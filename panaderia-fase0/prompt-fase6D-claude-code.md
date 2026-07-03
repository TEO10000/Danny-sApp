# Prompt para Claude Code — Danny'sApp Fase 6D: IVA 15% en facturas de proveedores

Copia todo lo que sigue como prompt de Claude Code, ejecutado desde la raíz del repo `Danny-sApp`.

---

Estás trabajando en **Danny'sApp** (subdirectorio activo **`panaderia-fase0/`**). Fases previas: sidebar y `SelectorBuscador` (6A), CRUD de usuarios + `AuditLog`/`registrarAuditoria` (6B), edición auditada de cierres/coches/facturas con `src/lib/recalculo.ts` (6C). **Reutiliza la auditoría y el recálculo existentes; no dupliques nada.**

## Contexto técnico (NO violar ninguna de estas convenciones)

- Next.js 14 App Router + TS, Tailwind sistema "Horno", sin librerías nuevas.
- Prisma desde `src/lib/prisma.ts` (Proxy perezoso). Transacciones con `Prisma.TransactionClient`.
- `useFormState`/`useFormStatus`, Zod en servidor, `force-dynamic`, español, dinero `Number()` + `Math.round(x*100)/100`, America/Guayaquil.
- Autorización en servidor dentro de cada action.

## Regla de negocio acordada con el cliente (leer dos veces)

En Ecuador la mayoría de insumos de panadería son tarifa 0%, pero **ciertas facturas llevan IVA 15%**. Decisiones cerradas:

1. El IVA es un **check a nivel de factura completa** (no por línea).
2. El monto que hoy sale de sumar las líneas (`montoTotal = Σ costoTotal`) pasa a ser el **subtotal**. Con el check activo: `iva = subtotal × 0.15` y el **total real** = `subtotal + iva`. Sin check: `iva = 0`, total = subtotal.
3. `montoTotal` conserva su nombre pero pasa a representar el **total real** (subtotal + iva). Esto es clave porque todo lo que ya consume `montoTotal` (pagos desde caja en `caja/actions.ts`, `recalcularCierre` en `recalculo.ts`, listados, dashboard de facturas pendientes) espera "lo que sale de la caja" — y eso es el total con IVA. **No renombrar ni tocar esos consumidores: al mantener la semántica "total pagable", siguen correctos sin cambios.**
4. La evolución de costos de insumos ya es consistente sin cambios: `costoUnitario` de `CompraInsumo` se deriva de las líneas (subtotal, sin IVA) — verificar que ninguna vista de evolución de costos use `montoTotal` en lugar de las líneas; si alguna lo hace, corregirla a líneas.

## Estado actual relevante (léelo en el código primero)

- `prisma/schema.prisma` → `model FacturaProveedor`: tiene `montoTotal Decimal @db.Decimal(10,2)`, sin campos de IVA.
- `src/app/(panel)/facturas/actions.ts`: el alta (formulario rápido y detallado) calcula `montoTotal = Σ costoTotal` de líneas con redondeo a 2 decimales, y `costoUnitario` a 4 decimales; la edición de 6C (~línea 280) recalcula `montoTotal` desde las líneas y, si la factura estaba pagada desde caja, dispara `recalcularCierre`.
- `src/app/api/ia/escanear-factura/route.ts`: `esquemaIA` (Zod) valida la extracción de Claude; el prompt de visión describe las líneas (`costoTotal` = cantidad × precio unitario).
- Formularios de facturas: rápido, detallado y pantalla de corrección del escaneo (localízalos con grep de `registrarFactura`/nombres reales de las actions).

---

## TAREA 1 — Migración de schema (aditiva, con backfill)

En `model FacturaProveedor` agregar:

```prisma
aplicaIva Boolean @default(false)
subtotal  Decimal @default(0) @db.Decimal(10, 2)
iva       Decimal @default(0) @db.Decimal(10, 2)
```

Generar la migración con `npx prisma migrate dev --create-only --name factura_iva`, **editar el SQL generado** para agregar al final el backfill de las facturas históricas:

```sql
UPDATE "FacturaProveedor" SET "subtotal" = "montoTotal";
```

(históricas: `aplicaIva = false`, `iva = 0`, `subtotal = montoTotal` — su total no cambia, no se distorsiona nada). Luego `npx prisma migrate dev` para aplicarla. Verificar con `npx prisma studio` o un `SELECT` que ninguna factura vieja cambió su `montoTotal`.

Documentar con un comentario en el schema: `// montoTotal = subtotal + iva (total real pagable)`.

---

## TAREA 2 — Cálculo en las server actions

Crear un helper único `calcularTotalesFactura(lineas, aplicaIva)` en el módulo donde viva la lógica de facturas (o `src/lib/facturas.ts` si no hay un lugar natural):

```ts
subtotal = round2(Σ costoTotal de líneas)
iva      = aplicaIva ? round2(subtotal * 0.15) : 0
montoTotal = round2(subtotal + iva)
```

Usarlo en TODOS los puntos que hoy calculan `montoTotal`:
1. Alta por formulario rápido.
2. Alta por formulario detallado.
3. Confirmación del escaneo IA.
4. La edición de facturas de 6C (que además debe permitir cambiar el check `aplicaIva` — cambiarlo en una factura `PAGADA` desde caja modifica `montoTotal` y por tanto debe seguir disparando `recalcularCierre` en la misma transacción, como ya hace con otros cambios de monto; el cambio de `aplicaIva` queda auditado con `registrarAuditoria`).

Zod: `aplicaIva: z.coerce.boolean().default(false)` (con checkbox de FormData: presencia del campo = true; maneja el patrón que ya use el proyecto para booleanos de formulario, y si no hay ninguno, `formData.get("aplicaIva") === "on"`).

---

## TAREA 3 — UI de formularios y vistas

1. **Checkbox "Factura con IVA (15%)"** en: formulario rápido, formulario detallado, pantalla de corrección del escaneo IA y pantalla de edición (6C). Estilo Horno, target táctil ≥ 44px.
2. Bajo la tabla de líneas, un bloque de totales en vivo (client-side, solo informativo — el servidor recalcula siempre): `Subtotal`, `IVA 15%` (visible solo con el check activo) y `Total`. Los tres con el mismo redondeo a 2 decimales que el servidor para que nunca difieran.
3. **Detalle/listado de facturas**: donde hoy se muestra el monto, mostrar el total; si `iva > 0`, mostrar el desglose "Subtotal $X + IVA $Y" (en el detalle siempre; en listados basta un indicador discreto "c/IVA" junto al monto).
4. El flujo de cierre de caja (selección de facturas a pagar desde caja) no cambia: ya usa `montoTotal`, que ahora es el total real. Solo verificar que la pantalla muestre ese total (lo que efectivamente sale de la caja).

---

## TAREA 4 — Escaneo IA

1. Ampliar `esquemaIA` en `src/app/api/ia/escanear-factura/route.ts` con campos opcionales: `subtotal`, `iva`, `total`, `aplicaIva` (boolean).
2. Actualizar el prompt de visión: si la factura trae impresos subtotal/IVA/total, extraerlos tal cual; indicar que en Ecuador el IVA vigente es 15% y que muchas facturas de insumos son tarifa 0% (en ese caso `aplicaIva: false`).
3. Validación de coherencia en servidor: si vienen los tres montos, exigir `|subtotal + iva − total| ≤ 0.02`; si no cuadra, descartar el desglose extraído y dejar que la persona lo marque a mano (la IA solo pre-llena, nunca decide sola — principio existente del proyecto).
4. En la pantalla de corrección, el check llega pre-marcado según la extracción y los totales pre-calculados; la persona confirma o corrige. Al confirmar, el servidor recalcula con `calcularTotalesFactura` a partir de las líneas + check (fuente de verdad: líneas, no los montos extraídos).
5. Si el subtotal extraído de la factura difiere de la suma de líneas extraídas por más de $0.02, mostrar una advertencia visual en la corrección ("La suma de líneas no cuadra con el subtotal impreso — revisa cantidades y precios").

---

## Criterios de aceptación (verificar TODOS antes de terminar)

1. `npm run build` y la migración pasan; **ninguna factura histórica cambia su `montoTotal`** (backfill verificado).
2. Factura nueva sin check: subtotal = total, iva = 0 — idéntico comportamiento al actual.
3. Factura nueva con check: líneas suman $100 → subtotal 100.00, iva 15.00, total 115.00; al pagarla desde caja, el efectivo esperado del cierre baja $115 (no $100).
4. Cambiar el check en la edición de una factura PAGADA desde caja recalcula el descuadre del cierre asociado (transacción única + auditoría del cambio).
5. La evolución de costos de insumos sigue mostrando costos sin IVA (deriva de líneas).
6. El escaneo IA extrae el desglose cuando está impreso, valida coherencia y nunca guarda sin confirmación humana.
7. Redondeos servidor/cliente idénticos: ningún caso donde la pantalla muestre un total distinto al guardado.
8. UI en español, mobile-first, estilo Horno, sin librerías nuevas; cero cambios en `caja/actions.ts` y `recalculo.ts` (si necesitas tocarlos, algo está mal planteado — detente y revisa la regla de negocio #3).

## Al terminar

- Resumen: archivos modificados, SQL final de la migración, y confirmación de los criterios 1–8.
- Commit sugerido: `feat(fase6d): IVA 15% por factura con desglose subtotal/iva/total y extracción en escaneo IA`
- NO hacer push ni tocar configuración de Vercel.
