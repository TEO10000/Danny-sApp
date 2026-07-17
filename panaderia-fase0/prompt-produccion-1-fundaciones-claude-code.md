# Prompt 1/2 para Claude Code — Danny'sApp: Fundaciones de datos para producción flexible

Ejecutar este prompt PRIMERO, verificar que compila y que los cierres de caja existentes recalculan igual que antes (sin cambios numéricos) antes de pasar al Prompt 2.

---

Estás trabajando en **Danny'sApp**, sistema interno de una panadería con dos sucursales en Ecuador. Vas a modificar el modelo de datos y el cálculo de producción para soportar productos que no se producen "por lata" (ej. alfajores, tres leches — se cuentan por unidad), y para agregar seguimiento de vida útil en productos de pastelería/galletería/empaquetados.

## Contexto técnico (no violar ninguna convención)

- Next.js 14 App Router + TypeScript, Prisma 5 + PostgreSQL (Neon), cliente Prisma como Proxy en `src/lib/prisma.ts`.
- Migraciones **aditivas**, nunca destructivas. Datos históricos existentes deben seguir funcionando exactamente igual (todo `DetalleCoche` ya guardado usa hoy `numLatas`/`panesPorLata` obligatorios — eso NO cambia para esos registros).
- `src/lib/turnos.ts` y `src/lib/recalculo.ts` son la fuente de verdad del cálculo de ventas por sobrantes (RF-05) — cualquier cambio ahí debe mantener el resultado idéntico para coches que ya usan latas.
- Zod valida en cliente y servidor. Montos: `Number()` + `Math.round(x*100)/100`. Transacciones tipadas `Prisma.TransactionClient`. Zona horaria `America/Guayaquil`. Español en toda la UI. Sin librerías nuevas.

## TAREA 1 — Migración de schema

En `prisma/schema.prisma`:

1. Nuevo enum:
   ```prisma
   enum ModoProduccion {
     LATAS
     UNIDADES
   }
   ```

2. En `model Producto`, agregar:
   ```prisma
   modoProduccion ModoProduccion @default(LATAS)
   vidaUtilHoras  Int?           // null = no se rastrea vencimiento (ej. pan de sal/dulce)
   ```

3. En `model DetalleCoche`:
   - Volver **nullable** `numLatas` y `panesPorLata` (eran obligatorios).
   - Agregar `cantidadUnidades Int?` (para productos con `modoProduccion = UNIDADES`).
   - Agregar `agotado Boolean @default(false)` y `agotadoEn DateTime?` (para el botón "marcar agotado/descartado" que silencia la alerta de vencimiento de esa línea).
   - Agregar un check a nivel de aplicación (no a nivel de constraint SQL, Prisma no lo soporta fácil): cada fila debe tener O (`numLatas` + `panesPorLata`) O `cantidadUnidades`, nunca ambos ni ninguno. Esto se valida en las server actions (Tarea 3), no hace falta en el schema.

Genera la migración con `npx prisma migrate dev --name produccion_modo_flexible` (o el comando que uses en este entorno — revisa `package.json`/README si hay uno específico para generar sin aplicar en Neon directamente). Confirma que es aditiva: los productos existentes quedan con `modoProduccion = LATAS` por defecto (su comportamiento actual no cambia) y `vidaUtilHoras = null`.

## TAREA 2 — Cálculo: soportar ambos modos sin romper el existente

En `src/lib/turnos.ts`, ubica la línea (aprox. línea 114) donde hoy se calcula:

```ts
const buenos = Math.max(d.numLatas * d.panesPorLata - d.mermas, 0);
```

Reemplázala por una función auxiliar reutilizable (agrégala en el mismo archivo o en `src/lib/produccion-calculo.ts` si preferís separarla, y usala también en `src/lib/recalculo.ts` donde se repite la misma lógica):

```ts
type DetalleParaCalculo = {
  numLatas: number | null;
  panesPorLata: number | null;
  cantidadUnidades: number | null;
  mermas: number;
};

function unidadesBuenas(d: DetalleParaCalculo): number {
  const producidas =
    d.cantidadUnidades != null
      ? d.cantidadUnidades
      : (d.numLatas ?? 0) * (d.panesPorLata ?? 0);
  return Math.max(producidas - d.mermas, 0);
}
```

Actualiza el `select`/`include` de la consulta de `DetalleCoche` en `turnos.ts` (y el mismo patrón en `recalculo.ts` si hace una consulta equivalente) para incluir `cantidadUnidades`. **Verificá que ambos archivos usan la misma función** — no dupliques la lógica de cálculo en dos lugares.

## TAREA 3 — Server actions de producción: validar el modo correcto por producto

En `src/app/(panel)/produccion/actions.ts`:

1. Cambia `detalleSchema` para aceptar ambas formas (usa `z.union` o `z.discriminatedUnion` con un campo `modo`):
   ```ts
   const detalleLatasSchema = z.object({
     productoId: z.string().min(1),
     modo: z.literal("LATAS"),
     numLatas: z.coerce.number().int().min(1, "Cada fila necesita al menos 1 lata."),
     panesPorLata: z.coerce.number().int().min(1, "Indica cuántos panes salen por lata."),
     mermas: z.coerce.number().int().min(0).default(0),
   });
   const detalleUnidadesSchema = z.object({
     productoId: z.string().min(1),
     modo: z.literal("UNIDADES"),
     cantidadUnidades: z.coerce.number().int().min(1, "Indica cuántas unidades se produjeron."),
     mermas: z.coerce.number().int().min(0).default(0),
   });
   const detalleSchema = z.discriminatedUnion("modo", [detalleLatasSchema, detalleUnidadesSchema]);
   ```

2. Antes de guardar (en `registrarCoche` y `editarCoche`), busca los productos involucrados (`prisma.producto.findMany({ where: { id: { in: [...] } }, select: { id: true, modoProduccion: true } })`) y **valida server-side que el `modo` enviado coincide con `producto.modoProduccion`** — si no coincide, retorna error (`"El producto X se produce por unidades, no por latas."` o viceversa). Esto evita que alguien manipule el formulario y mande datos inconsistentes con el producto.

3. Actualiza la validación de mermas (hoy compara contra `numLatas * panesPorLata`) para usar `unidadesBuenas`/la cantidad producida según el modo de cada fila.

4. Al guardar (`prisma.detalleCoche.create`/dentro de `editarCoche`), mapea cada fila a los campos correctos según su modo: si es `LATAS`, `numLatas`/`panesPorLata` con valor y `cantidadUnidades: null`; si es `UNIDADES`, `cantidadUnidades` con valor y `numLatas`/`panesPorLata: null`.

5. Agrega una nueva server action:
   ```ts
   export async function marcarAgotado(detalleId: string, agotado: boolean) { ... }
   ```
   Requiere sesión con rol `ADMIN` o `PANADERO` (mismo criterio que el resto de `/produccion`). Actualiza `DetalleCoche.agotado` y `agotadoEn` (fecha actual si `agotado = true`, `null` si se desmarca). No requiere transacción ni recálculo de cierres (no afecta ventas, es solo para silenciar la alerta de vencimiento — dejalo explícito en un comentario en el código). `revalidatePath("/produccion")`.

## TAREA 4 — Catálogo: nuevos campos en el formulario de producto

En `src/app/(panel)/catalogo/actions.ts`:

1. Agrega a `productoSchema` (usado en `crearProducto`):
   ```ts
   modoProduccion: z.enum(["LATAS", "UNIDADES"]).default("LATAS"),
   vidaUtilHoras: z.coerce.number().int().min(1).nullable().optional(),
   ```
   y pásalos al `prisma.producto.create`.

2. Agrega una nueva action `editarModoYVidaUtil` (o extendé `editarProducto` si preferís mantenerlo todo junto — a tu criterio, pero si lo separás usá el mismo patrón transaccional + `registrarAuditoria` que ya usa `editarProducto`) para poder cambiar `modoProduccion` y `vidaUtilHoras` de un producto ya existente.

En `src/app/(panel)/catalogo/Formularios.tsx`, agrega al formulario de creación/edición de producto:
- Un selector `modoProduccion`: "Por latas" / "Por unidades" (radio o select, con texto de ayuda: "Por unidades: se cuenta la cantidad total producida, sin latas ni panes por lata — ideal para alfajores, tortas, tres leches, etc.").
- Un campo opcional `vidaUtilHoras`: número, con ayuda "Horas que el producto se mantiene apto para la venta. Dejalo vacío si no aplica (ej. pan de sal/dulce que se vende el mismo día)." Mostrar el campo con más énfasis si la categoría elegida es `PASTELERIA`, `GALLETERIA` o `EMPAQUETADO` (pero no lo ocultes para las demás — puede haber excepciones).

## Criterios de aceptación de este prompt

1. `npx prisma migrate dev` corre sin errores y sin tocar datos existentes.
2. Todos los coches ya guardados (con `numLatas`/`panesPorLata`) siguen calculando exactamente el mismo `ventasCalculadas`/`descuadre` que calculaban antes de este cambio — verificalo comparando el resultado de `datosParaCierre` de un cierre real antes/después de la migración.
3. Se puede crear un producto nuevo con `modoProduccion = UNIDADES` y `vidaUtilHoras` desde `/catalogo`.
4. Registrar un coche con un producto en modo `UNIDADES` funciona (guarda `cantidadUnidades`, no pide latas).
5. Intentar mandar un modo que no coincide con el producto (manipulando el form) es rechazado en el servidor.
6. `npx tsc --noEmit` y `npm run build` pasan sin errores.
7. **No toques todavía la UI de `CocheForm.tsx` para mostrar el input dinámico ni la lista de `/produccion`** — eso es el Prompt 2. Este prompt deja el backend listo; el formulario puede quedar mandando siempre `modo: "LATAS"` por ahora si hace falta para que compile, se termina de conectar en el siguiente prompt.
