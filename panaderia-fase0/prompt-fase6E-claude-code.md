# Prompt para Claude Code — Danny'sApp Fase 6E: Transferencias bancarias en el cierre de caja (lectura automática desde Gmail)

Copia todo lo que sigue como prompt de Claude Code, ejecutado desde la raíz del repo `Danny-sApp`. **Esta fase modifica la fórmula del cierre de caja. Lee todo el contexto antes de escribir.**

---

Estás trabajando en **Danny'sApp** (subdirectorio activo **`panaderia-fase0/`**). Fases previas: sidebar/selectores (6A), usuarios + `AuditLog`/`registrarAuditoria` (6B), ediciones con `src/lib/recalculo.ts` (6C), IVA en facturas (6D).

## Regla de negocio

Las ventas del turno se calculan por sobrantes y **eso no cambia**. Pero parte de esas ventas se cobra por **transferencia bancaria** (Banco Pichincha) en lugar de efectivo, y hoy eso aparece como faltante falso en el descuadre. Las notificaciones de cada transferencia llegan por correo a **un buzón Gmail por sucursal**. El sistema debe leerlas automáticamente y mostrárselas a la empleada en el cierre para que solo las **confirme** — sin digitar montos. El ingreso manual existe únicamente como respaldo si la lectura falla.

Fórmula nueva: `efectivoEsperado = 40 + ventasTurno − pagosDesdeCaja − Σ transferenciasConfirmadas`.

## Contexto técnico (NO violar, con UNA excepción explícita)

- Convenciones de siempre: Prisma desde `src/lib/prisma.ts`, `Prisma.TransactionClient`, `useFormState`, Zod en servidor, `force-dynamic`, español, `Math.round(x*100)/100`, America/Guayaquil (UTC−5), autorización en servidor.
- **Excepción autorizada:** puedes instalar `imapflow` y `mailparser` (dependencias de servidor para leer el buzón). Son las ÚNICAS librerías nuevas permitidas; nada de UI.
- La ventana temporal de un turno ya está definida por el sistema de ventas: `datosParaCierre` devuelve `inicioVentana` (fin del cierre anterior) y `finVentana`. **Usa exactamente esa misma ventana para atribuir transferencias al turno** — así transferencias y ventas siempre cubren los mismos intervalos sin huecos ni solapes.
- La API de Claude ya se usa en `src/app/api/ia/escanear-factura/route.ts` — replica su forma de invocar el SDK y su modelo.

## Estado actual relevante

- Fórmula de caja en dos lugares (y SOLO dos): `src/app/(panel)/caja/actions.ts` (~línea 128) y `src/lib/recalculo.ts` (~línea 91). Ambos: `FONDO_CAJA + totalVentas − pagosDesdeCaja`.
- El formulario de cierre vive en `src/app/(panel)/caja/cerrar/` (server component que llama `datosParaCierre` + client component de la tabla).
- La edición de cierres de admin (6C) está en `src/app/(panel)/caja/[id]/editar/`.

---

## TAREA 1 — Schema (migración aditiva)

```prisma
enum EstadoTransferencia { SUGERIDA CONFIRMADA DESCARTADA }
enum OrigenTransferencia { CORREO MANUAL }

model TransferenciaTurno {
  id            String              @id @default(cuid())
  sucursalId    String
  cierreTurnoId String?             // null mientras es sugerencia sin cierre
  monto         Decimal             @db.Decimal(10, 2)
  referencia    String?             // nro. de comprobante/documento del banco
  remitente     String?             // nombre de quien transfirió, si el correo lo trae
  hora          DateTime?           // momento de la transferencia
  messageId     String?             @unique // Message-ID del correo: idempotencia
  estado        EstadoTransferencia @default(SUGERIDA)
  origen        OrigenTransferencia
  createdAt     DateTime            @default(now())

  sucursal    Sucursal     @relation(fields: [sucursalId], references: [id])
  cierreTurno CierreTurno? @relation(fields: [cierreTurnoId], references: [id])

  @@index([sucursalId, estado])
  @@index([cierreTurnoId])
}
```

En `CierreTurno`: `totalTransferencias Decimal @default(0) @db.Decimal(10, 2)` (denormalizado, siempre = Σ confirmadas del cierre) + relación `transferencias TransferenciaTurno[]`. Relación inversa en `Sucursal`. Migración aditiva: cierres históricos quedan con 0 y su descuadre no cambia.

---

## TAREA 2 — Módulo de lectura del banco: `src/lib/banco.ts`

### Configuración (solo variables de entorno, jamás en código ni en cliente)

```
BANCO_IMAP_USER_PRINCIPAL / BANCO_IMAP_PASS_PRINCIPAL   ← tones6205@gmail.com + app password
BANCO_IMAP_USER_CONSEJO   / BANCO_IMAP_PASS_CONSEJO     ← (segundo buzón, puede faltar aún)
BANCO_REMITENTE                                          ← filtro de remitente; default "pichincha.com"
```

Mapeo sucursal→credenciales por el **nombre** de la sucursal ("Principal"/"Consejo"); si una sucursal no tiene credenciales configuradas, la función lo reporta como "no configurado" (no como error).

### `leerTransferencias(sucursalNombre, desde: Date | null, hasta: Date): Promise<ResultadoLectura>`

1. Conexión `imapflow` a `imap.gmail.com:993` (TLS), buzón `INBOX`, **solo lectura** (no marcar como leídos ni mover nada).
2. Búsqueda por fecha (`since` con margen de 1 día por el desfase UTC del SEARCH de IMAP) + filtro por remitente que **contenga** `BANCO_REMITENTE`; luego filtrar en código por `hora del correo ∈ (desde, hasta]` en UTC−5.
3. Parsear cada correo con `mailparser` (texto y HTML).
4. Extracción en dos capas, en `src/lib/banco-parser.ts`:
   - **Capa 1 — regex:** patrones para montos (`$?\s*[\d.,]+` con normalización de separadores), referencia/documento y hora sobre el texto del correo. Deja los patrones en constantes bien comentadas con `// TODO: afinar con el correo real de Banco Pichincha` — el formato exacto se calibrará cuando el cliente entregue un correo de ejemplo.
   - **Capa 2 — fallback IA:** si la regex no logra extraer un monto válido, enviar el TEXTO del correo (nunca adjuntos) a la API de Claude pidiendo SOLO JSON `{ monto, referencia?, remitente?, hora? }`, validado con Zod (monto positivo, ≤ 10 000 como sanidad). Reutilizar patrón/modelo del escaneo de facturas.
5. Devolver `{ ok: true, transferencias: [...] }` con `messageId`, o `{ ok: false, motivo }` (credenciales faltantes, timeout, error IMAP). **Timeout defensivo total de ~8s** (Promise.race) y `finally` que cierra la conexión — es serverless, nada puede quedar colgado.
6. No loguear cuerpos de correos ni credenciales; solo conteos y errores.

---

## TAREA 3 — Sugerencias en el formulario de cierre

1. En el server component de `/caja/cerrar`, tras `datosParaCierre`: llamar `leerTransferencias(sucursal, inicioVentana, finVentana)`.
2. Persistir cada transferencia leída como `SUGERIDA` con `origen: CORREO`, `cierreTurnoId: null`, usando **upsert por `messageId`** — recargar la página nunca duplica (el `@unique` es la red de seguridad).
3. Cargar de BD todas las `SUGERIDA` de esa sucursal con `hora ∈ ventana` (incluye las de recargas anteriores) y pasarlas al client component.
4. UI (tabla de cierre, sección "Transferencias del turno", estilo Horno):
   - Lista con monto, hora (formato de Guayaquil), referencia y remitente; **checkbox por transferencia, marcado por defecto**; total de confirmadas en vivo, integrado a la vista previa del efectivo esperado.
   - Botón "Actualizar" que recarga la página (vuelve a leer el buzón) por si entró una transferencia mientras cuadraban.
   - Fila "Agregar manual" (monto obligatorio, referencia/nota opcional) — visible siempre, destacada cuando la lectura falló.
   - Si `ok: false`: aviso amable ("No se pudo leer el correo del banco: {motivo}. Registra las transferencias a mano.") sin bloquear el cierre.
5. El submit envía `transferencias` como JSON (patrón existente de `sobrantes`): `{ sugeridasConfirmadasIds: string[], manuales: [{ monto, referencia? }] }`.

### Cambios en `registrarCierre` (`caja/actions.ts`)

1. Zod para el JSON de transferencias.
2. **Re-verificar en BD** las sugeridas confirmadas (id ∈ lista, sucursal correcta, estado `SUGERIDA`, hora en ventana) y tomar el monto **de la BD, jamás del cliente**. Manuales: montos del form validados.
3. `totalTransferencias = round2(Σ confirmadas + Σ manuales)`; fórmula: `efectivoEsperado = FONDO_CAJA + totalVentas − pagosDesdeCaja − totalTransferencias`.
4. Dentro de la transacción existente: crear el cierre con `totalTransferencias`; actualizar las sugeridas confirmadas → `CONFIRMADA` + `cierreTurnoId`; las sugeridas de la ventana NO confirmadas → `DESCARTADA` + `cierreTurnoId` (trazabilidad de lo que la empleada descartó); crear las manuales como `CONFIRMADA`/`MANUAL` ligadas al cierre.

---

## TAREA 4 — Recálculo y edición de admin

1. `src/lib/recalculo.ts` → `recalcularCierre`: sumar las `TransferenciaTurno` `CONFIRMADA` del cierre y restarlas en `efectivoEsperado`; actualizar también `totalTransferencias` denormalizado. Cierres históricos sin transferencias: Σ = 0 → resultados idénticos a hoy (retrocompatibilidad exacta).
2. Edición de cierres (6C, `/caja/[id]/editar`): nueva sección de transferencias del cierre donde el ADMIN puede cambiar CONFIRMADA↔DESCARTADA y agregar manuales; cada cambio corre en transacción con `recalcularCierre` + `registrarAuditoria` (entidad `TransferenciaTurno`).
3. Detalle del cierre y listado: mostrar "Efectivo: $X · Transferencias: $Y" donde hoy se muestran las ventas del turno.
4. Dashboard: donde se muestren ventas/descuadres por turno o día, agregar el desglose por canal (efectivo = ventas − transferencias del cierre; transferencia = totalTransferencias). Sin gráficas nuevas: columnas/tarjetas dentro de lo existente.

---

## Criterios de aceptación (verificar TODOS antes de terminar)

1. `npm run build` y migración pasan; cierres históricos: `totalTransferencias = 0` y descuadres idénticos (probar `recalcularCierre` sobre uno viejo: mismo resultado que antes de esta fase).
2. Turno con ventas $200, factura de caja $30 y transferencias confirmadas $50 → esperado = 40 + 200 − 30 − 50 = $160. Las **ventas** siguen siendo $200 (el canal no cambia el total vendido).
3. Recargar el formulario de cierre 5 veces no duplica ninguna sugerencia (`messageId @unique`).
4. Con credenciales ausentes o IMAP caído, el cierre se completa por la vía manual sin errores 500.
5. Los montos confirmados salen de la BD; manipular el JSON del cliente con montos falsos de sugeridas no tiene efecto.
6. Conexión IMAP: solo lectura, se cierra siempre, timeout ~8s, nada de credenciales o cuerpos en logs.
7. Admin puede corregir transferencias de un cierre pasado y el descuadre se recalcula con auditoría.
8. `imapflow` y `mailparser` son las únicas dependencias nuevas en `package.json`.
9. UI en español, mobile-first, estilo Horno.

## Al terminar

- Resumen: archivos creados/modificados, y lista de las variables de entorno que el dueño debe cargar en Vercel (con instrucción de generar el app password en https://myaccount.google.com/apppasswords con verificación en 2 pasos activa).
- Recordatorio en el resumen: los patrones regex de `banco-parser.ts` quedan con TODO hasta calibrarlos con un correo real de Banco Pichincha; mientras tanto el fallback de IA cubre la extracción.
- Commit sugerido: `feat(fase6e): transferencias del turno leídas del correo del banco (IMAP) con confirmación en el cierre`
- NO hacer push ni tocar configuración de Vercel.
