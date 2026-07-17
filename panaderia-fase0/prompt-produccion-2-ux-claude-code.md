# Prompt 2/2 para Claude Code — Danny'sApp: UX de producción (formulario dinámico, tabs, alertas, historial)

Ejecutar DESPUÉS del Prompt 1 (fundaciones de datos), ya verificado. Este prompt es solo UI/UX sobre lo que el Prompt 1 dejó listo en el backend — no debería tocar `turnos.ts` ni `recalculo.ts`.

---

## Contexto técnico

Mismas convenciones del proyecto ya establecidas (Next.js 14 App Router, TypeScript, Tailwind con sistema "Horno", sin librerías externas, `useFormState`/`useFormStatus`, español, mobile-first). Si en este momento ya existe `src/components/Modal.tsx` y `src/app/(panel)/produccion/DetalleCocheModal.tsx` (de un prompt anterior sobre modales de detalle), **reutilízalos y extiéndelos** en vez de crear otros nuevos — revisa el repo antes de tocar nada. Si no existen todavía, creálos como parte de este prompt siguiendo el mismo patrón que `src/components/Sidebar.tsx` para overlays (`fixed inset-0 z-30 bg-corteza-900/50`).

## TAREA 1 — Formulario dinámico por producto (`CocheForm.tsx`)

En `src/app/(panel)/produccion/CocheForm.tsx`:

1. Extiende el tipo `ProductoOpcion` para incluir `categoria: string` y `modoProduccion: "LATAS" | "UNIDADES"` (la página `page.tsx`/`nuevo/page.tsx` que lo renderiza debe pasar estos campos en el `select` de Prisma).

2. Agrega un filtro de categoría **como ayuda de búsqueda, no como puerta del formulario**: una fila de chips/tabs (Todas / Pan de sal / Pan de dulce / Pastelería / Galletería / Empaquetado) arriba del `SelectorBuscador` de cada fila, que simplemente reduce la lista de `opciones` que se le pasa al buscador cuando está activo un filtro. No cambia la estructura del formulario por sí solo.

3. El `Fila` (tipo interno) pasa a tener: `productoId`, `modo: "LATAS" | "UNIDADES" | ""` (se completa automáticamente al elegir el producto, leyendo `modoProduccion` del producto seleccionado — el usuario no lo elige a mano), `numLatas`, `panesPorLata`, `cantidadUnidades`, `mermas`.

4. Cuando `onSeleccion` del `SelectorBuscador` dispara con un `productoId`, además de guardarlo, buscá el producto en `productos` y seteá `modo` según su `modoProduccion`.

5. El bloque de inputs de cada fila se vuelve condicional:
   - Si `modo === "LATAS"` (o vacío, antes de elegir producto): mostrar los inputs de "Latas" y "Panes/lata" como hoy.
   - Si `modo === "UNIDADES"`: mostrar un solo input "Cantidad producida" en vez de los dos anteriores.
   - "Mermas" se mantiene igual en ambos casos.

6. Actualiza el cálculo de `totales` (latas, panes, mermas, ingreso) para sumar correctamente ambos modos (usa la misma idea de `unidadesBuenas` del Prompt 1, replicada en el cliente para el preview en vivo — no hace falta importarla del server, es solo para mostrar el resumen mientras se llena el form).

7. Actualiza `detallesJson` para mandar el campo `modo` y solo los campos correspondientes a ese modo (no mandar `numLatas`/`panesPorLata` en `undefined` para filas en modo unidades, y viceversa).

8. Aplica el mismo cambio en el formulario de edición si existe un componente separado para editar coches (revisa si `editarCoche` reusa `CocheForm` o tiene su propio componente).

## TAREA 2 — Rediseño de las cards de `/produccion`

En `src/app/(panel)/produccion/page.tsx`, extrae el `<ul>` de cards a un componente cliente `ListaCoches.tsx` (si no lo hiciste ya en un prompt anterior para el modal de detalle) y aplica:

1. **Jerarquía visual de 2 niveles** en cada card:
   - Línea principal (negrita, tamaño normal): productos + cantidades + hora.
   - Línea secundaria (más chica, `text-corteza-400`): sucursal, panadero, mermas.
   - El monto de ingreso estimado (solo visible para ADMIN, la restricción ya existe) queda pequeño y alineado a la derecha, sin competir visualmente con la cantidad producida.

2. **Badge de sucursal con color**: mapea `sucursal.nombre → color` (ej. Consejo = naranja/horno, Principal = azul/un tono nuevo del sistema Horno que sea consistente — revisa `tailwind.config.ts` para ver si ya hay un tono azul definido o si hay que agregar uno; si agregás un color nuevo, hazlo como token del sistema Horno, no un azul genérico de Tailwind).

3. **Badge de turno**: reutiliza la función de `src/lib/cierres.ts` que calcula el turno a partir de la hora (`hora < 14 ? "T1_06_14" : "T2_14_22"`) para mostrar "Turno 1" o "Turno 2" en cada card. No agregues columna nueva a la base de datos para esto.

4. **Botón flotante** "Registrar producción" (`fixed bottom-6 right-6` o similar, respetando safe-area en móvil) que linkea a `/produccion/nuevo`, visible en toda la sección `/produccion` para roles `ADMIN` y `PANADERO`.

## TAREA 3 — Agrupar por fecha y tabs por categoría

1. Agrupa visualmente los coches por fecha: sección "Hoy" primero y expandida por defecto, con el resto de fechas pasadas debajo (colapsadas o simplemente en orden descendente con encabezados de fecha) — no hace falta un componente de acordeón complejo, un simple encabezado sticky por fecha alcanza.
2. Agrega tabs/chips arriba de la lista para filtrar por `categoria` del producto (Todo / Pan de sal / Pan de dulce / Pastelería / Galletería / Empaquetado) — filtra client-side sobre los coches ya cargados (no hace falta ir al servidor de nuevo si el volumen es bajo, ~20 registros/día; si preferís hacerlo server-side con query param, también es válido, a tu criterio según lo que quede más simple).

## TAREA 4 — Duplicar producción

Agrega una opción "Duplicar" junto a "Editar" en cada card (o dentro del modal de detalle). Al tocarla, navega a `/produccion/nuevo?duplicarDe=ID` y `CocheForm` precarga las filas (`productoId`, `modo`, `numLatas`/`panesPorLata`/`cantidadUnidades`) del coche original, dejando `fecha`/`hora` en el valor actual (no las del coche original) para que el usuario solo confirme.

## TAREA 5 — Historial de auditoría en el modal de detalle

En `DetalleCocheModal.tsx` (creado o existente), agrega una sección "Historial de cambios" que consulte `AuditLog` filtrando por `entidad: "CocheProduccion"` y `entidadId: coche.id`, ordenado por `fecha desc`, mostrando: fecha, usuario (`user.nombre`), campo, valor anterior → valor nuevo. Si no hay registros, no mostrar la sección (o mostrar "Sin cambios registrados").

## TAREA 6 — Alerta de posible vencimiento + botón agotado/descartado

1. En `src/lib/produccion.ts` (o el archivo que corresponda), crea una función que, dado un rango de coches recientes (ej. últimos 7 días), calcule para cada `DetalleCoche` con `producto.vidaUtilHoras != null` y `agotado = false`:
   ```
   horasTranscurridas = (ahora - coche.fecha) en horas
   estado =
     horasTranscurridas < vidaUtilHoras * 0.75  → "vigente" (no se muestra)
     horasTranscurridas < vidaUtilHoras          → "por_vencer"
     horasTranscurridas >= vidaUtilHoras         → "vencido"
   ```
   (El umbral de 0.75 para "por vencer" es una sugerencia razonable — ajustalo si el código ya tiene una convención similar en otro lado, o dejalo configurable como constante al inicio del archivo.)

2. Esta función solo aplica a categorías `PASTELERIA`, `GALLETERIA`, `EMPAQUETADO` (filtrá por `producto.categoria`) — pan de sal/dulce no entra aunque tuviera `vidaUtilHoras` seteado por error, ya que ese caso no aplica según lo conversado.

3. En `src/app/(panel)/produccion/page.tsx`, agrega arriba de la lista (antes del resumen diario si también lo implementás en este prompt) un banner de alerta si hay items en estado `por_vencer` o `vencido`:
   ```
   ⚠ 3 producciones para revisar
   ```
   Al tocarlo (puede ser un `<details>` nativo o desplegar inline, sin necesidad de modal separado) muestra la lista: producto, sucursal, cuánto hace que se produjo, y un botón "Marcar agotado/descartado" por línea que llama a la server action `marcarAgotado` del Prompt 1 (client component pequeño con `useTransition` para la llamada).

4. **Aclaración de alcance** (dejalo como comentario en el código para que quede documentado): esta alerta se basa únicamente en el tiempo transcurrido desde la producción, no en el stock real restante — el sistema no tiene un contador de inventario en vivo entre cierres de turno. Es un recordatorio de revisión, no una confirmación de que el producto sigue físicamente disponible.

5. Esta alerta se muestra **al entrar a `/produccion`** (arriba de todo, lo primero que se ve), no como interceptor del login general — mantenerlo así de simple a menos que se pida explícitamente lo contrario.

## Criterios de aceptación

1. Al registrar producción, elegir un producto en modo `UNIDADES` muestra el input de cantidad simple; elegir uno en modo `LATAS` muestra latas/panes por lata — automático, sin que el usuario elija el modo a mano.
2. Cada card de `/produccion` muestra: color de sucursal, badge de turno (T1/T2), jerarquía visual clara, y el ingreso estimado solo visible para ADMIN.
3. Existe un botón flotante para registrar producción, visible en toda la sección.
4. La lista agrupa "Hoy" primero y permite ver días anteriores. Los tabs de categoría filtran correctamente usando `Producto.categoria`.
5. "Duplicar" desde una card precarga un coche nuevo con los mismos productos/cantidades.
6. El modal de detalle de un coche muestra su historial de auditoría si tiene ediciones.
7. Si existen productos con `vidaUtilHoras` vencido/por vencer sin marcar `agotado`, aparece el banner de alerta al entrar a `/produccion`, y el botón "Marcar agotado" funciona y hace desaparecer esa línea de la alerta al recargar.
8. `npx tsc --noEmit` y `npm run build` pasan sin errores.
9. Ningún cambio de este prompt modifica `src/lib/turnos.ts` ni `src/lib/recalculo.ts` — si te parece que hace falta tocarlos, deten la ejecución y señalalo en vez de modificarlos.
