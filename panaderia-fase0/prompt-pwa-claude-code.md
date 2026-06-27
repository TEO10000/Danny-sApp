# Prompt para Claude Code — Integración PWA (App Instalable)

Copia todo el texto entre las líneas de guiones y pégalo en Claude Code, ubicado en la raíz del proyecto (`Danny'sApp/panaderia-fase0/`).

**ANTES de correr este prompt:** coloca tu logo en `public/logo-fuente.png` (crea la carpeta `public/` si no existe, al mismo nivel que `src/`). Debe ser un PNG cuadrado, idealmente 512×512 px o más, con fondo transparente o sólido de marca.

---

## CONTEXTO DEL PROYECTO

Trabajas en "Danny'sApp", un sistema interno de gestión para una panadería con dos sucursales (Principal y Consejo). Stack: **Next.js 14 (App Router) + TypeScript estricto + Prisma 5 + Auth.js v5 + Tailwind CSS**. UI en español, mobile-first. Desplegado en **Vercel** (HTTPS). El proyecto funciona y compila correctamente; ya está en producción.

Existe un sistema de diseño llamado "Horno" con tokens de Tailwind: colores `masa` (cremas de fondo), `corteza` (marrones de texto), `horno` (naranja de acento), `cuadre` (verde/rojo de estados). El layout raíz está en `src/app/layout.tsx` y ya usa la API `metadata` y `viewport` de Next.js App Router.

Tu tarea es **convertir la app en una PWA (Progressive Web App) instalable**, de forma **nativa con Next.js, SIN instalar librerías nuevas** (sin `next-pwa` ni similares). El objetivo es que dueños y empleados puedan instalar la app y abrirla desde un ícono propio, en ventana sin barra del navegador, tanto en celular (uso principal) como en escritorio.

**Decisiones ya tomadas (respétalas):**
- Instalable en **Android, iOS y escritorio**.
- **Requiere internet** (las panaderías tienen conexión estable). NO implementes funcionamiento offline complejo.
- El service worker debe ser **mínimo y conservador (network-first)**: nunca debe servir datos viejos de las pantallas dinámicas (caja, facturas, dashboards). Siempre datos frescos del servidor.
- Identidad visual: usar el logo en `public/logo-fuente.png`. Colores de marca acordes al sistema "Horno".
- Pantalla de carga (splash): solo el **logo estático** sobre fondo de marca. NO hagas animaciones.
- **No cambies ninguna lógica de negocio ni rompas funcionalidad existente.** La app debe seguir funcionando igual desde el navegador normal.

**ANTES de escribir código, lee:**
1. `src/app/layout.tsx` — el layout raíz con `metadata` y `viewport`. Aquí se integran los metadatos PWA.
2. `tailwind.config.ts` — para conocer los valores exactos de los colores `masa`, `corteza`, `horno` y usar el color de fondo/tema correcto.
3. `next.config.mjs` — la configuración actual de Next.js.
4. Confirma que existe `public/logo-fuente.png`. Si no existe, detente y avísame antes de continuar.

## QUÉ DEBES CONSTRUIR

### 1. Generar los íconos a partir del logo
Desde `public/logo-fuente.png`, genera los íconos en los tamaños que requieren las plataformas y guárdalos en `public/icons/`. Necesarios:
- `icon-192.png` (192×192) — Android.
- `icon-512.png` (512×512) — Android, splash.
- `icon-maskable-512.png` (512×512, versión "maskable" con margen de seguridad ~10% para que Android la recorte bien en cualquier forma).
- `apple-icon-180.png` (180×180) — iPhone/iPad (`apple-touch-icon`).
- `favicon` para la pestaña del navegador.

Puedes generar las imágenes con la herramienta que tengas disponible en el entorno (por ejemplo, un script de Node con `sharp` ejecutado puntualmente, o ImageMagick si está disponible). Si no hay ninguna herramienta de imágenes disponible, **detente y dime qué falta** en lugar de inventar los archivos. Los íconos deben verse correctos, no placeholders vacíos.

### 2. Manifiesto web
Crea el manifiesto usando el enfoque nativo de Next.js App Router (preferiblemente `src/app/manifest.ts`, que Next genera como `/manifest.webmanifest`). Debe incluir:
- `name`: "Danny'sApp — Gestión Panadería"
- `short_name`: "Danny's"
- `description`: breve, en español.
- `start_url`: "/"
- `display`: "standalone" (ventana propia, sin barra del navegador).
- `orientation`: "portrait" (uso principal en celular).
- `background_color` y `theme_color`: usa los valores de marca del sistema "Horno" leídos de `tailwind.config.ts` (un fondo claro tipo `masa` y un tema acorde; elige valores concretos y coméntalo).
- `icons`: referencia a los íconos generados, incluyendo el `maskable` con su `purpose` correcto.

### 3. Metadatos en el layout raíz
En `src/app/layout.tsx`, extiende los objetos `metadata` y `viewport` (sin romper los existentes) para PWA:
- Enlazar el manifiesto.
- `themeColor` en `viewport` con el color de marca.
- `appleWebApp`: habilitar modo standalone en iOS (`capable: true`), título y `statusBarStyle` adecuados.
- `apple-touch-icon` apuntando a `apple-icon-180.png`.
- `icons` (icon/shortcut/apple) según la API de `metadata` de Next.
- Mantén `lang="es"`.

### 4. Service worker mínimo (network-first)
- Crea un service worker en `public/sw.js` con estrategia **network-first**: intenta siempre la red primero; solo usa caché como respaldo para recursos estáticos básicos (no para respuestas de datos/HTML dinámico de caja, facturas o dashboards). Mantenlo corto y conservador. Incluye versión de caché para poder invalidar.
- Registra el service worker en el cliente de forma segura: un componente cliente pequeño (p. ej. `src/components/RegistrarSW.tsx`) que en `useEffect` haga `navigator.serviceWorker.register("/sw.js")` solo si está disponible y solo en producción. Inclúyelo en el layout raíz.
- Asegúrate de que el SW no cachee rutas de API ni navegaciones a páginas con datos; ante la duda, que vaya siempre a la red.

### 5. Pantalla de carga (splash)
- En Android, el splash lo deriva el navegador del manifiesto (íconos + `background_color` + `name`); asegúrate de que esos campos estén bien para que se vea el logo sobre el fondo de marca.
- En iOS, configura el splash/título con los metadatos de `appleWebApp`. No hace falta generar todas las imágenes de splash de iOS (son muchas resoluciones); con el `apple-touch-icon` y el modo standalone es suficiente para esta fase. Si decides añadir alguna, que sea opcional y mínima.
- NO implementes animaciones.

### 6. Configuración y compatibilidad
- Verifica en `next.config.mjs` que no haga falta nada extra para servir `sw.js` y el manifiesto (con la carpeta `public/` y `app/manifest.ts` debería bastar). Si hace falta algún header, agrégalo de forma mínima.
- Todo debe seguir siendo compatible con Vercel y HTTPS.

## CRITERIOS DE ACEPTACIÓN
- `npx tsc --noEmit` pasa sin errores y `npm run build` compila correctamente.
- Existe `/manifest.webmanifest` válido y los íconos en `public/icons/` se generaron de verdad (no vacíos), a partir del logo.
- En el layout, los metadatos PWA están integrados sin romper los `metadata`/`viewport` previos, y `lang="es"` se mantiene.
- El service worker se registra solo en producción, es network-first y no cachea datos dinámicos (caja, facturas, dashboards siguen mostrando información fresca).
- La app no cambió ninguna funcionalidad ni lógica de negocio; sigue funcionando igual desde el navegador normal.
- Tras desplegar en Vercel, la app debe ser instalable: ventana propia (standalone) con ícono del logo en Android y escritorio, y agregable a inicio desde Safari en iOS.

## AL TERMINAR
- Ejecuta `npx tsc --noEmit` y `npm run build` y confirma que ambos pasan.
- Hazme un resumen de los archivos creados/modificados.
- Recuérdame que, tras hacer push y que Vercel despliegue, debo probar la instalación en: Android (Brave/Chrome), iPhone (Safari) y escritorio (Chrome/Edge), y que en iPhone la instalación solo funciona desde Safari (no desde Brave/Chrome) por restricción de Apple.

Trabaja paso a paso: primero lee los archivos indicados y confirma que existe el logo, genera los íconos, crea el manifiesto, integra los metadatos, agrega y registra el service worker, y al final corre el type-check y el build.
