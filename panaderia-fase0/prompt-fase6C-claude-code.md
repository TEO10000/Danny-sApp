# Prompt para Claude Code — Danny'sApp Fase 6C: Edición de cierres, coches y facturas + ocultar precios al PANADERO

Copia todo lo que sigue como prompt de Claude Code, ejecutado desde la raíz del repo `Danny-sApp`. **Esta es la sub-fase más delicada de la Fase 6: toca la integridad de las ventas calculadas y los descuadres de caja. Lee TODO el contexto antes de escribir una línea.**

---

Estás trabajando en **Danny'sApp** (subdirectorio activo **`panaderia-fase0/`**). Fases previas ya entregadas: sidebar (6A) y CRUD de usuarios + `AuditLog` con helper `registrarAuditoria` en `src/lib/auditoria.ts` (6B) — **reutiliza ese helper en toda esta fase**.

## Contexto técnico (NO violar ninguna de estas convenciones)

- Next.js 14 App Router + TS, Tailwind sistema "Horno". Sin librerías nuevas.
- Prisma desde `src/lib/prisma.ts` (Proxy perezoso, jamás instanciar otro). Transacciones con callbacks tipados `Prisma.TransactionClient`.
- `useFormState`/`useFormStatus`, Zod en servidor, `force-dynamic`, textos en español, dinero con `Number()` + `Math.round(x*100)/100`, zona horaria America/Guayaquil (UTC−5).
- Autorización **en servidor dentro de cada action**, además del middleware.

## Cómo funciona hoy el cálculo (léelo en el código antes de tocar nada)

Archivos a leer completos primero: `src/lib/turnos.ts`, `src/lib/catalogo.ts`, `src/app/(panel)/caja/actions.ts`, `src/app/(panel)/produccion/actions.ts`, `src/app/(panel)/facturas/actions.ts`, y los `page.tsx` de caja, producción, facturas y plan-semanal.

Resumen del mecanismo (verifícalo contra el código):
- `datosParaCierre(sucursalId, fechaStr, tipo)` en `src/lib/turnos.ts`: encuentra el **cierre anterior** de la sucursal comparando la hora de fin de turno (`finDeTurno`), define la ventana `(fin del anterior, fin de este turno]`, suma la producción buena de los coches en esa ventana, y arma por producto: `disponible = sobrante_anterior + producido`.
- `registrarCierre` en `caja/actions.ts`: `vendidos = disponible − sobrante contado`; crea `CierreTurno` + `SobranteTurno` + filas `VentaCalculada` (solo si `vendidos !== 0`) y marca las facturas seleccionadas como `PAGADA` con `origenPago: "CAJA_TURNO"` y `cierreTurnoId`. `efectivoEsperado = 40 + Σventas − Σfacturas pagadas desde caja`; `descuadre = contado − esperado`.
- `VentaCalculada` tiene `@@unique([sucursalId, fecha, tipoTurno, productoId])` → el recálculo es **borrar y regenerar** ese conjunto.
- `CierreTurno` tiene `@@unique([sucursalId, fecha, tipoTurno])`.
- `src/lib/catalogo.ts` ya expone `preciosVigentesEn(fecha)` (la usa la vista de producción para valorar coches con el precio de SU fecha).

### La cascada, exactamente

- Editar los **sobrantes** de un cierre N cambia: (a) las ventas de N (disponible fijo, sobrante nuevo), (b) el `efectivoEsperado`/`descuadre` de N, y (c) el `disponible` del **cierre siguiente** (su "anterior" es el sobrante de N) → también sus ventas y su descuadre. **La cascada se detiene ahí**: el cierre sub-siguiente depende de los sobrantes contados del siguiente, que no cambian.
- Editar el **efectivo contado** de N solo cambia el `descuadre` de N.
- Editar un **coche** cuya fecha cae dentro de la ventana de un cierre ya existente cambia el `producido` → ventas y descuadre de **ese** cierre (sin cascada al siguiente, por la misma razón).
- Editar el **monto** de una factura `PAGADA` con `origenPago: "CAJA_TURNO"` cambia `Σpagos desde caja` → `efectivoEsperado`/`descuadre` del cierre asociado.

---

## TAREA 0 — Helper central de recálculo: `src/lib/recalculo.ts`

Toda la fase gira alrededor de UNA función bien probada. No dupliques esta lógica en las actions.

```ts
recalcularCierre(tx: Prisma.TransactionClient, cierreId: string): Promise<void>
```

Pasos:
1. Cargar el cierre con sus `sobrantes` y sus facturas `PAGADA`/`origenPago: CAJA_TURNO`.
2. Rearmar la ventana y el `disponible` por producto con la **misma lógica de `datosParaCierre`**, pero: (a) ejecutando las consultas sobre `tx`, y (b) **valorizando con `preciosVigentesEn(fecha del turno)`, NUNCA con el precio de hoy** — si los precios cambiaron después de ese turno, usar el precio actual distorsionaría el histórico. Para no duplicar código, refactoriza `datosParaCierre` para aceptar un cliente opcional (`tx` o `prisma`, default `prisma`) y un parámetro de precios, manteniendo su firma actual compatible con los llamadores existentes (la pantalla de cierre debe seguir funcionando idéntica, con precios vigentes de hoy que en un cierre en curso son los correctos).
3. `deleteMany` de `VentaCalculada` por `(sucursalId, fecha, tipoTurno)` y `createMany` con las filas nuevas (misma regla existente: solo `vendidos !== 0`; se permiten negativos, igual que hoy).
4. Recalcular `efectivoEsperado` (fondo 40 + ventas − pagos desde caja de ESTE cierre) y `descuadre` (contra su `efectivoContado` actual) y actualizar el cierre.

```ts
cierreSiguiente(tx, sucursalId, finVentanaDe: Date): Promise<{ id } | null>
```
El cierre de la misma sucursal con el fin de turno **inmediatamente posterior** (usar `finDeTurno` sobre los candidatos, igual que hace `datosParaCierre` para encontrar el anterior).

---

## TAREA 1 — Edición y eliminación de cierres de turno (RF-P03, solo ADMIN)

### Alcance de edición (deliberadamente acotado)
- **Editables:** sobrantes por producto, efectivo contado, notas.
- **NO editables:** sucursal, fecha, tipo de turno, empleada. Cambiarlos rompería la semántica de ventanas encadenadas. Para un cierre con esos datos mal, el camino es **eliminarlo y volver a cerrar el turno** correctamente (por eso la eliminación es parte de esta tarea). Deja esto explicado en la UI ("Para corregir sucursal, fecha o turno: elimina este cierre y ciérralo de nuevo").

### Ruta `src/app/(panel)/caja/[id]/editar/page.tsx` (ADMIN)
- El listado actual de cierres (donde esté hoy: `/caja` o dashboard) gana, solo para ADMIN, un enlace "Editar" por cierre.
- El formulario muestra la tabla de sobrantes precargada con los valores actuales, efectivo contado y notas. Muestra en vivo (informativo) el nuevo descuadre estimado.

### Action `editarCierre`
1. Verificar ADMIN.
2. Zod (mismas validaciones que `registrarCierre` para sobrantes/efectivo).
3. En una sola `prisma.$transaction`:
   - Actualizar `SobranteTurno` (upsert por producto), `efectivoContado`, `notas`.
   - `recalcularCierre(tx, id)`.
   - `sig = cierreSiguiente(...)`; si existe, `recalcularCierre(tx, sig.id)`.
   - `registrarAuditoria(tx, ...)` con un cambio por campo/producto realmente modificado (comparar antes de escribir).
4. `revalidatePath` de `/caja`, `/dashboard`.

### Action `eliminarCierre`
1. Verificar ADMIN + confirmación explícita en la UI ("Se borrarán sus ventas calculadas y sus facturas pagadas desde caja volverán a PENDIENTE").
2. En transacción: borrar `VentaCalculada` del turno; revertir facturas del cierre pagadas desde caja a `PENDIENTE` (limpiar `origenPago`, `pagadaPorId`, `fechaPago`, `cierreTurnoId`); borrar `SobranteTurno`; borrar el cierre; recalcular el **cierre siguiente** si existe (su "anterior" pasa a ser el previo-previo); auditoría `ELIMINAR` con snapshot resumido en `valorAnterior`.

### Marcado visual
- En listados/detalle, los cierres con registros de edición en `AuditLog` muestran un badge discreto "Corregido" con la fecha de la última edición (consulta a `AuditLog` por `entidad: "CierreTurno"` + id).

---

## TAREA 2 — Edición de coches de producción (RF-P04)

### Permisos (regla confirmada con el cliente)
- **PANADERO:** solo coches **propios** (`panaderoId === session.user.id`) y **del día en curso** en America/Guayaquil (comparar la fecha del coche con la fecha actual UTC−5).
- **ADMIN:** cualquier coche, cualquier fecha.
- Ambas reglas verificadas **en la server action**, no solo en la UI.

### Ruta `src/app/(panel)/produccion/[id]/editar/page.tsx`
- Reutilizar la tabla editable del alta (mismo componente si es posible), precargada con los detalles del coche: filas producto/latas/panes-por-lata/mermas, sucursal, fecha, hora, notas.
- El listado de producción gana enlace "Editar" solo en los coches donde el usuario actual tiene permiso (calculado en servidor).

### Action `editarCoche`
1. Permisos como arriba. Zod igual al alta (`detalleSchema`/`cocheSchema`).
2. En transacción:
   - Reemplazar detalles (delete + createMany dentro de la tx es aceptable) y actualizar cabecera.
   - Determinar los cierres afectados: el cierre (si existe) cuya ventana contiene la **fecha/hora anterior** del coche y el de la **nueva** (pueden ser distintos si cambió fecha, hora o sucursal; puede no existir ninguno si el turno aún no se cierra). Para cada cierre afectado distinto: `recalcularCierre(tx, ...)`. Sin cascada al siguiente (los sobrantes contados no cambian).
   - Auditoría por campo cambiado; para los detalles, un registro con resumen legible ("detalles: 8×20 enrollado → 9×20 enrollado").
3. Si el coche editado cae en un turno **ya cerrado**, mostrar tras guardar un aviso claro: "Este cambio recalculó las ventas del turno ya cerrado del {fecha} {turno}".

---

## TAREA 3 — Edición de facturas (RF-P05)

Reglas por estado (verificadas en servidor):
- **`PENDIENTE`** — editan: quien la registró (`registradaPorId`) o ADMIN. Editable: proveedor, número, fecha, sucursal, y las líneas `CompraInsumo` (cantidades/costos) **replicando la lógica de recálculo de `montoTotal` y `costoUnitario` del alta** (léela en `facturas/actions.ts` y refléjala; no inventes otra).
- **`PAGADA`** — solo ADMIN. Si `origenPago === "CAJA_TURNO"`: cualquier cambio de `montoTotal` dispara, en la misma transacción, `recalcularCierre(tx, cierreTurnoId)` (cambia Σpagos → esperado/descuadre). Además, acción "Revertir pago" → vuelve a `PENDIENTE`, limpia campos de pago y recalcula el cierre si era de caja.
- **`ANULADA`** — solo lectura. Acción "Anular" (ADMIN, confirmación explícita): si estaba `PAGADA` desde caja, recalcula el cierre asociado.
- Toda edición → `registrarAuditoria` por campo.
- UI: en el detalle/listado de facturas, botones según estado y rol calculados en servidor.

---

## TAREA 4 — Ocultar precios y ganancia al PANADERO (RF-P07)

1. `grep -rn "preciosVigentesEn\|ganancia\|Ganancia\|ingreso\|dinero(" src/app/\(panel\)/produccion src/app/\(panel\)/plan-semanal` para localizar toda valorización monetaria visible en vistas a las que accede PANADERO.
2. En cada server component afectado: si `session.user.rol === "PANADERO"`, **no ejecutar** las consultas/cálculos monetarios (no basta ocultar la columna: los montos no deben viajar en el HTML/payload). Renderizar la vista sin columnas/tarjetas de ingreso, ganancia o precio.
3. La pantalla de edición de coches (Tarea 2) tampoco muestra montos al PANADERO.
4. `/precios` no se toca: PANADERO tiene permiso explícito a esa sección por diseño original (RF-02.3); RF-P07 aplica a las vistas de **producción y plan semanal**. Verificar con el cliente después si también quiere cerrar `/precios` — no lo hagas tú.
5. ADMIN sigue viendo todo exactamente igual (verificar que no se rompió nada de su vista).

---

## Criterios de aceptación (verificar TODOS antes de terminar)

1. `npm run build` pasa. **Cero migraciones de schema en esta fase** (todo usa modelos existentes + `AuditLog` de 6B).
2. Escenario de regresión mental obligatorio — documenta en tu resumen que lo verificaste traza en mano:
   a. Existen cierres T1 y T2 del mismo día. Admin edita un sobrante de T1 → cambian ventas y descuadre de T1 **y** de T2 (su disponible partía del sobrante de T1); T1 del día siguiente NO cambia.
   b. Admin edita el efectivo contado de T1 → solo cambia el descuadre de T1.
   c. Se edita un coche horneado en la ventana de T1 (ya cerrado) → cambian ventas/descuadre de T1, nada más.
   d. Se elimina T1 → sus ventas desaparecen, sus facturas de caja vuelven a PENDIENTE, y T2 se recalcula tomando como "anterior" el cierre previo a T1.
   e. Todos los recálculos de cierres pasados usan `preciosVigentesEn(fecha del turno)`.
3. Cada edición/eliminación deja rastro completo en `AuditLog` y ocurre dentro de UNA transacción (falla todo o nada).
4. PANADERO: puede editar solo sus coches de hoy; no ve ningún monto en producción, edición ni plan semanal (verificar viendo el HTML servido, no solo la pantalla); ATENCION_CLIENTE y ADMIN sin cambios en lo que ven.
5. Facturas: reglas por estado imposibles de saltar invocando las actions directo.
6. Los llamadores existentes de `datosParaCierre` (pantalla y action de cierre) siguen funcionando idéntico.
7. UI en español, mobile-first, estilo Horno, sin librerías nuevas.

## Al terminar

- Resumen: archivos creados/modificados, verificación de los escenarios a–e, y qué encontró el grep de RF-P07.
- Commit sugerido: `feat(fase6c): edición auditada de cierres/coches/facturas con recálculo en cascada + ocultar montos a panadero`
- NO hacer push ni tocar configuración de Vercel.
