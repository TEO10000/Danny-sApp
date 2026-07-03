# Prompt para Claude Code — Danny'sApp Fase 6A: Sidebar + Selectores móviles

Copia todo lo que sigue como prompt de Claude Code, ejecutado desde la raíz del repo `Danny-sApp`.

---

Estás trabajando en **Danny'sApp**, un sistema de gestión interna para una panadería con dos sucursales (Principal y Consejo) en Ecuador. El proyecto activo está en el subdirectorio **`panaderia-fase0/`** — todo tu trabajo ocurre ahí dentro.

## Contexto técnico (NO violar ninguna de estas convenciones)

- Next.js 14 App Router + TypeScript, Tailwind CSS con sistema de diseño propio "Horno" (tokens de color: `masa-*`, `corteza-*`, `horno-*`, `cuadre-*` — ya definidos en `tailwind.config.ts`; NO agregar colores nuevos fuera del sistema).
- Auth.js v5 con sesiones JWT; el rol vive en `session.user.rol` (`ADMIN` | `PANADERO` | `ATENCION_CLIENTE`).
- **NO instalar ninguna librería nueva** (ni de componentes, ni de íconos, ni de animación). Todo con React, Tailwind y SVG inline.
- Formularios existentes usan `useFormState`/`useFormStatus` de `react-dom` — no romper ese patrón.
- Páginas de servidor llevan `export const dynamic = "force-dynamic"` — no quitarlo de ninguna.
- Textos de UI en español.
- **Esta fase es SOLO de UI/navegación: prohibido tocar lógica de negocio, server actions de cálculo, schema de Prisma, middleware o `auth.config.ts`.**

## Estado actual relevante

La navegación vive en `src/app/(panel)/layout.tsx`: un `<header>` con logo + botón "Salir" y debajo un `<nav>` de pestañas horizontales con `overflow-x-auto`, generadas desde un array `NAV` de 9 entradas `{ href, etiqueta, roles }` (`/dashboard`, `/produccion`, `/caja`, `/facturas`, `/catalogo`, `/precios`, `/campanias`, `/plan-semanal`, `/chat-ia`), filtrado por el rol de la sesión en el servidor. Ese filtro por rol en servidor debe **conservarse exactamente igual** (los enlaces que no corresponden al rol no deben viajar al cliente).

Los formularios con `<select>` de proveedor/producto están (como mínimo) en:
- `src/app/(panel)/facturas/nueva/page.tsx` (y sus componentes de formulario rápido/detallado y corrección del escaneo IA)
- `src/app/(panel)/produccion/nuevo/page.tsx` (tipo de pan por fila de la tabla editable)
- `src/app/(panel)/caja/cerrar/page.tsx` (si usa selects de producto en sobrantes)

Antes de empezar, ejecuta `grep -rn "<select" src/app src/components` dentro de `panaderia-fase0/` para encontrar **todas** las instancias reales y decidir cuáles corresponden a proveedor/producto (esas se migran) y cuáles son selects cortos de pocas opciones fijas como sucursal o turno (esas se quedan como están).

---

## TAREA 1 — Sidebar lateral ocultable (reemplaza las pestañas)

### Componente nuevo: `src/components/Sidebar.tsx` (client component)

Recibe por props desde el layout de servidor: `enlaces` (ya filtrados por rol, cada uno con `href`, `etiqueta` y una clave de ícono), `nombreUsuario` y `rolLegible`. No recibe el mapa completo de permisos.

**Comportamiento en escritorio (≥ md):**
- Sidebar fija a la izquierda, altura completa, dos estados: **expandida** (ícono + etiqueta, ~240px) y **colapsada** (solo íconos, ~64px), con botón de alternar al pie o en la cabecera de la sidebar.
- El estado colapsada/expandida se persiste en `localStorage` (clave `sidebar-colapsada`) y se restaura al montar, evitando parpadeo (leer en un `useEffect` y aceptar el estado por defecto expandido en el primer render).
- En estado colapsado, cada ítem muestra tooltip nativo (`title`) con la etiqueta.
- Transición suave de ancho con Tailwind (`transition-[width]`), sin librerías.

**Comportamiento en móvil (< md):**
- La sidebar no ocupa espacio: se muestra una barra superior con botón **hamburguesa**, el logo/nombre y el botón "Salir".
- Al tocar la hamburguesa se abre un **drawer** desde la izquierda con overlay oscuro semitransparente; tocar el overlay o navegar a una sección lo cierra.
- Targets táctiles de los ítems ≥ 44px de alto.
- Bloquear el scroll del body mientras el drawer está abierto.

**Común:**
- Ítem activo resaltado usando `usePathname()` (activo si el pathname empieza con el `href`), con fondo `masa-100`/borde `horno-500` u otro tratamiento coherente con el sistema Horno.
- **Un ícono SVG inline por sección** (definidos en un objeto/mapa dentro del componente o en `src/components/iconos.tsx`), trazo simple estilo outline, `stroke="currentColor"`, 24×24. Sugerencia temática: dashboard=gráfica de barras, producción=trigo/pan, caja=caja registradora o billete, facturas=documento, catálogo=etiqueta, precios=dólar, campañas=megáfono, plan semanal=calendario, chat IA=burbuja de chat con chispa.
- El nombre del usuario y rol legible (hoy en el `<main>`) se mueven a la parte inferior de la sidebar (expandida) y a la barra superior en móvil.
- El botón "Salir" conserva su `form` con server action `signOut` tal como está hoy (puede pasarse como `children` o duplicarse el form; no cambiar la lógica de cierre de sesión).

### Cambios en `src/app/(panel)/layout.tsx`

- Sigue siendo **server component**: obtiene sesión, redirige a `/login` si no hay, filtra `NAV` por rol (agregar a cada entrada su clave de ícono) y renderiza `<Sidebar>` + `<main>`.
- Nueva estructura: contenedor `flex` con la sidebar a la izquierda y el `<main>` ocupando el resto (`flex-1`, mantener `max-w-5xl mx-auto px-4 py-6` para el contenido).
- **No cambiar ninguna ruta ni el array de permisos**; solo la presentación.

---

## TAREA 2 — Selector con buscador para proveedor/producto

### Componente nuevo reutilizable: `src/components/SelectorBuscador.tsx` (client component)

Props mínimas:
```ts
{
  name: string;                 // name del input hidden que participa en el form
  opciones: { id: string; etiqueta: string; detalle?: string }[]; // detalle: ej. último precio
  valorInicial?: string;        // id preseleccionado (p. ej. corrección de escaneo IA)
  placeholder?: string;         // ej. "Buscar proveedor…"
  etiquetaCrear?: string;       // si se pasa, muestra "➕ {etiquetaCrear}" cuando no hay match
  onCrear?: () => void;         // callback para el flujo de crear nuevo (si aplica en esa vista)
  onSeleccion?: (id: string) => void; // opcional, para formularios que reaccionan al cambio
  requerido?: boolean;
}
```

**Comportamiento:**
- Se ve como un campo que muestra la opción seleccionada (o el placeholder). Al tocarlo:
  - **< md:** se abre un **bottom sheet** (panel inferior fijo, altura ~70dvh, esquinas superiores redondeadas, overlay) con un input de búsqueda arriba (con `autoFocus`) y la lista filtrada debajo, scrolleable. Botón/gesto de cerrar.
  - **≥ md:** se comporta como **combobox flotante**: input de búsqueda con panel desplegable anclado debajo del campo, cerrable con `Escape` o clic fuera.
- Filtrado en vivo, insensible a mayúsculas y tildes (normalizar con `String.prototype.normalize("NFD")` + quitar diacríticos).
- Cada opción: alto mínimo 44px, etiqueta principal y `detalle` secundario en texto pequeño (p. ej. último precio pagado en facturas).
- La selección escribe el `id` en un `<input type="hidden" name={name}>` para que el submit con `useFormState` funcione **exactamente igual que con el `<select>` actual** (mismo `name`, mismo valor). Esto es crítico: las server actions no deben necesitar ningún cambio.
- Si `etiquetaCrear` está definida y la búsqueda no tiene resultados, mostrar la opción de crear (dispara `onCrear`).
- Accesible: `role="listbox"`/`role="option"`, navegación con flechas y Enter en escritorio.
- Estilo 100% sistema Horno, coherente con los inputs existentes.

### Migración

- Reemplazar por `SelectorBuscador` **solo** los `<select>` de **proveedor** y **producto/insumo** encontrados con el grep (formulario rápido de facturas, formulario detallado, corrección del escaneo IA, tipo de pan en la tabla de producción, y sobrantes en el cierre si aplica).
- En el formulario rápido de facturas, usar `detalle` para mostrar el último precio pagado si ese dato ya llega a la vista (no agregar queries nuevas si no está).
- En la tabla editable de producción hay un selector **por fila**: el componente debe funcionar con múltiples instancias simultáneas (estado interno propio, `name` distinto por fila, p. ej. `producto-${indiceFila}`, respetando el naming que las server actions ya esperan — verificarlo leyendo la action antes de tocar nada).
- Los selects de pocas opciones fijas (sucursal, tipo de turno, categoría, unidad de medida, estado) **NO se migran**.

---

## Criterios de aceptación (verificar TODOS antes de terminar)

1. `npm run build` pasa sin errores ni warnings nuevos dentro de `panaderia-fase0/`.
2. Cada rol ve en la sidebar exactamente las mismas secciones que veía en las pestañas (mismo filtro por rol en servidor); un usuario nunca recibe enlaces de secciones ajenas a su rol.
3. En móvil (~380px): drawer abre/cierra bien, overlay funciona, navegación cierra el drawer, sin scroll horizontal en ninguna página.
4. En escritorio: colapsar/expandir funciona y se recuerda al recargar.
5. Todos los formularios migrados **guardan igual que antes** (probar mentalmente el flujo del FormData: mismo `name`, mismo valor id). Ninguna server action modificada.
6. El buscador filtra ignorando tildes ("panaderia" encuentra "Panadería").
7. Cero librerías nuevas en `package.json`; cero cambios en `prisma/`, `middleware.ts`, `auth.config.ts` y server actions.
8. Estética consistente con el sistema Horno en ambos componentes.

## Al terminar

- Resumen de archivos creados/modificados y de qué selects se migraron vs. cuáles se dejaron.
- Commit sugerido: `feat(fase6a): sidebar lateral colapsable + selector con buscador para proveedor/producto`
- NO hacer push ni tocar configuración de Vercel.
