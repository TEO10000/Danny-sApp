# Prompt para Claude Code — Danny'sApp: Modales de detalle + Catálogo para Atención al Cliente

Copia todo lo que sigue como prompt de Claude Code, ejecutado desde la raíz del repo `Danny-sApp` (subdirectorio activo `panaderia-fase0/`).

---

Estás trabajando en **Danny'sApp**, sistema de gestión interna de una panadería con dos sucursales en Ecuador. Vas a implementar 3 cambios independientes que no se pisan entre sí.

## Contexto técnico (NO violar ninguna de estas convenciones)

- Next.js 14 App Router + TypeScript, Tailwind con sistema "Horno" (`masa-*`, `corteza-*`, `horno-*`, `cuadre-*`). **Sin librerías nuevas de ningún tipo** (ni de modales, ni de UI).
- Prisma 5 + PostgreSQL (Neon). Cliente Prisma como Proxy en `src/lib/prisma.ts` — importar siempre de ahí.
- Auth.js v5, JWT, roles `ADMIN` | `PANADERO` | `ATENCION_CLIENTE` en `session.user.rol`.
- Páginas de servidor: `export const dynamic = "force-dynamic"`.
- Autorización **siempre verificada en servidor** dentro de cada action, además del middleware.
- Montos: `Number()` desde `Prisma.Decimal` + `Math.round(x*100)/100`.
- Zona horaria: `America/Guayaquil`. Textos en español.
- Para overlays/paneles flotantes, el proyecto ya tiene una convención visual en `src/components/Sidebar.tsx`: fondo de overlay `fixed inset-0 z-30 bg-corteza-900/50`, panel `fixed ... z-40 bg-white shadow-xl`. **Reutiliza esos mismos tokens de color y z-index** para los modales nuevos, no inventes otra paleta.
- No hay ningún componente `Modal` genérico todavía — vas a crear uno reutilizable en `src/components/Modal.tsx`.

---

## TAREA 1 — Componente `Modal` reutilizable

Crea `src/components/Modal.tsx`, componente cliente (`"use client"`) genérico:

```tsx
type ModalProps = {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: React.ReactNode;
};
```

Requisitos:
- Overlay `fixed inset-0 z-30 bg-corteza-900/50` que cierra al hacer click.
- Panel centrado (`fixed inset-0 z-40 flex items-center justify-center p-4`) con contenido en `rounded-panel bg-white shadow-xl max-h-[85vh] overflow-y-auto` y ancho máximo razonable para desktop (`max-w-lg` o similar) y `w-full` en móvil.
- Cierra con tecla `Escape` (listener en `useEffect`, limpiar al desmontar).
- Botón de cerrar (×) visible arriba a la derecha, con área táctil ≥ 44px.
- Cuando `abierto` es `false`, no renderiza nada (`return null`).
- No usar `<dialog>` nativo ni librerías; div + overlay manual, accesible con `role="dialog"` y `aria-modal="true"`.

---

## TAREA 2 — Modal de detalle en Cierre de Caja (`/caja`)

**Objetivo:** al tocar/hacer click en una card de la lista `/caja`, se abre el modal con el detalle completo del cierre, en **solo lectura**, disponible para `ADMIN` y `ATENCION_CLIENTE` (ambos roles ya tienen acceso a `/caja`).

### 2.1 — Server action de detalle

En `src/app/(panel)/caja/actions.ts`, agrega una nueva función exportada:

```ts
export async function obtenerDetalleCierre(cierreId: string) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "ATENCION_CLIENTE"].includes(session.user.rol ?? "")) {
    throw new Error("No autorizado.");
  }
  // ...
}
```

Debe cargar (reutilizando lo que ya existe en `src/lib/turnos.ts` y `src/lib/recalculo.ts`, sin duplicar lógica de cálculo):
- El `CierreTurno` con `sucursal`, `empleada`, `sobrantes` (con nombre de producto), `facturas` (proveedor, monto, estado, origenPago), `transferencias` (monto, referencia, remitente, hora, estado).
- Las filas de `datosParaCierre(...)` (usando los precios vigentes al **fin del turno**, igual que hace `recalcularCierre`) para mostrar por producto: anterior, producido, disponible, sobrante contado, vendidos = disponible − sobrante, precio, valor.
- El desglose final ya guardado en el cierre: `fondoInicial`, `efectivoEsperado`, `efectivoContado`, `descuadre`, `totalTransferencias`.

Devuelve un objeto plano serializable (convierte todos los `Decimal` con `Number()`).

### 2.2 — Componente cliente del modal

Crea `src/app/(panel)/caja/DetalleCierreModal.tsx` (`"use client"`):
- Props: `cierreId: string | null`, `onCerrar: () => void`.
- Usa el `Modal` de la Tarea 1.
- Al abrirse (cuando `cierreId` cambia de `null` a un id), llama a `obtenerDetalleCierre(cierreId)` con `useEffect`, muestra estado de carga simple ("Cargando…") y luego el contenido.
- Contenido a mostrar, organizado en secciones claras:
  1. Encabezado: fecha, sucursal, turno, empleada.
  2. Tabla de sobrantes/ventas por producto (producto, anterior, producido, disponible, sobrante, vendidos, valor).
  3. Facturas del turno (proveedor, monto, estado, origen de pago).
  4. Transferencias confirmadas (monto, referencia, remitente, hora).
  5. Resumen de caja: fondo $40 + ventas − pagos desde caja − transferencias = esperado, vs. contado, y el descuadre (con el mismo color condicional que ya usa `page.tsx`: `text-cuadre-ok` / `text-cuadre-mal`).
- **Sin botones de editar ni de guardar** — es solo lectura. Si el usuario es ADMIN, agrega igual un link "Editar este cierre →" hacia `/caja/[id]/editar` dentro del modal (no lo dupliques, solo enlázalo).

### 2.3 — Conectar con la lista

En `src/app/(panel)/caja/page.tsx`, la página sigue siendo Server Component. Envuelve el `<ul>` de cierres con un componente cliente pequeño (p. ej. `src/app/(panel)/caja/ListaCierres.tsx`, `"use client"`) que:
- Reciba los `cierres` ya formateados como prop desde `page.tsx` (misma data que hoy, no cambies las queries del server).
- Mantenga `estado: cierreIdAbierto` (string | null).
- Cada `<li>` se vuelve clickeable (`onClick` que setea el id, cursor-pointer, sin romper el botón "Editar" existente — ese botón debe hacer `stopPropagation()` para no abrir el modal al click en "Editar").
- Renderiza `<DetalleCierreModal cierreId={cierreIdAbierto} onCerrar={() => setCierreIdAbierto(null)} />` una sola vez al final de la lista.

---

## TAREA 3 — Modal de detalle en Coche de Producción (`/produccion`)

Mismo patrón que la Tarea 2, aplicado a `/produccion`.

### 3.1 — Server action de detalle

En `src/app/(panel)/produccion/actions.ts`, agrega:

```ts
export async function obtenerDetalleCoche(cocheId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("No autorizado.");
  // ...
}
```

Carga el `CocheProduccion` con `sucursal`, `panadero`, `detalles` (con nombre de producto, numLatas, panesPorLata, mermas). Si `session.user.rol === "ADMIN"`, además calcula el ingreso estimado por línea con `preciosVigentesEn(coche.fecha)` (igual que hace hoy `page.tsx`). **Si el rol es `PANADERO` o `ATENCION_CLIENTE`, el objeto devuelto NO debe incluir ningún campo de dinero** — la restricción se aplica en el servidor, no ocultando en el cliente.

### 3.2 — Componente cliente del modal

Crea `src/app/(panel)/produccion/DetalleCocheModal.tsx`, mismo patrón que `DetalleCierreModal`:
- Encabezado: fecha/hora, sucursal, panadero, notas.
- Tabla por tipo de pan: producto, latas, panes por lata, subtotal (latas × panesPorLata), mermas, buenos.
- Totales: latas totales, panes totales, mermas totales.
- Ingreso estimado (solo si vino en la respuesta, es decir solo ADMIN lo ve).
- Si el usuario puede editar (misma regla que ya existe en `page.tsx`: ADMIN siempre, PANADERO solo si es suyo y es de hoy), link "Editar este coche →" hacia `/produccion/[id]/editar`.

### 3.3 — Conectar con la lista

Igual que 2.3: extraer el `<ul>` de `src/app/(panel)/produccion/page.tsx` a un componente cliente `ListaCoches.tsx` que maneja el estado del modal abierto, sin cambiar las queries del Server Component. El botón "Editar" existente debe seguir funcionando con `stopPropagation()`.

---

## TAREA 4 — Catálogo abierto a Atención al Cliente (acceso total)

**Objetivo:** `ATENCION_CLIENTE` obtiene el mismo nivel de acceso que `ADMIN` en `/catalogo` (crear, editar, activar/desactivar productos y precios), para poder cargar el catálogo completo de la panadería.

### 4.1 — Middleware

En `src/lib/auth.config.ts`, en el array `PERMISOS`, cambia la línea:

```ts
{ prefijo: "/catalogo", roles: ["ADMIN"] },
```

por:

```ts
{ prefijo: "/catalogo", roles: ["ADMIN", "ATENCION_CLIENTE"] },
```

### 4.2 — Server actions

En `src/app/(panel)/catalogo/actions.ts`, renombra la función `exigirAdmin()` a `exigirPermisoCatalogo()` (para que el nombre refleje que ya no es exclusiva de Admin) y actualiza su lógica:

```ts
async function exigirPermisoCatalogo() {
  const session = await auth();
  const rol = session?.user?.rol;
  if (rol !== "ADMIN" && rol !== "ATENCION_CLIENTE") {
    throw new Error("No tienes permiso para modificar el catálogo.");
  }
  return session!.user;
}
```

Actualiza **todas** las llamadas existentes a `exigirAdmin()` en ese archivo para que apunten a `exigirPermisoCatalogo()` (son 5 usos según el código actual — no dejes ninguna sin migrar).

### 4.3 — UI de la página

Revisa `src/app/(panel)/catalogo/page.tsx` y `Formularios.tsx`: si en algún lugar hay un chequeo explícito de `rol === "ADMIN"` para mostrar/ocultar botones de crear/editar (además del control de las actions), actualízalo también para incluir `ATENCION_CLIENTE`. Si el componente ya muestra los controles a cualquier usuario autenticado que llegó a la página (confiando en el middleware + actions), no hace falta tocar nada ahí.

### 4.4 — Registro de quién hizo el cambio

Si `crearProducto`/`editarProducto`/etc. ya usan `registrarAuditoria`, verifica que sigan registrando `userId: user.id` correctamente (el `user` que devuelve `exigirPermisoCatalogo()` ahora puede ser de rol `ATENCION_CLIENTE`, no solo `ADMIN` — no debería requerir cambios si ya usan el id genérico de sesión, pero confírmalo).

No cambies nada del middleware para `/precios` (sigue siendo de solo lectura para todos los roles no-ADMIN, eso no forma parte de este pedido).

---

## Criterios de aceptación

1. Al tocar cualquier card de `/caja`, se abre un modal con el detalle completo del cierre (sobrantes, facturas, transferencias, desglose de caja), sin navegar de página, funcionando igual para ADMIN y ATENCION_CLIENTE.
2. Al tocar cualquier card de `/produccion`, se abre un modal con el detalle completo del coche; PANADERO y ATENCION_CLIENTE nunca ven montos de dinero en el modal (verificado en el servidor, no solo ocultado en el cliente).
3. Los botones "Editar" existentes en ambas listas siguen funcionando exactamente igual que antes (no abren el modal, navegan a la página de edición).
4. `ATENCION_CLIENTE` puede entrar a `/catalogo` y crear/editar/activar/desactivar productos y precios sin errores de autorización.
5. `npx tsc --noEmit` y `npm run build` pasan sin errores.
6. Ningún cambio afecta la lógica de cálculo de caja, producción o precios — solo se agregan vistas de lectura y se amplía un permiso.
