# Prompt para Claude Code — Fase 4: Escaneo de Facturas con IA + Dashboards

Copia todo el texto entre las líneas de guiones y pégalo en Claude Code, ubicado en la raíz del proyecto (`Danny'sApp/panaderia-fase0/`).

---

## CONTEXTO DEL PROYECTO

Trabajas en "Danny'sApp", sistema interno de gestión para una panadería con dos sucursales (Principal y Consejo). Stack: **Next.js 14 (App Router) + TypeScript + Prisma 5 + PostgreSQL (Neon) + Auth.js v5 (credenciales, JWT, roles) + Tailwind CSS + Zod**. Toda la UI en **español**. Despliegue en **Vercel**. Zona horaria del negocio: **America/Guayaquil**.

Roles: `ADMIN`, `PANADERO`, `ATENCION_CLIENTE`. Las fases 0 a 3 ya están construidas y funcionando: autenticación con roles, catálogo con historial de precios, registro de coches de producción, cierre de caja por turno con ventas calculadas por sobrantes, y el módulo completo de Proveedores y Facturas (registro manual rápido/detallado, CRUD de estados, pago desde caja, pago del jefe, evolución de costos).

Tu tarea es la **Fase 4**, que tiene dos partes independientes:
- **Parte A — Escaneo de facturas con IA:** tomar una foto/PDF de una factura, que la API de Claude (visión) extraiga los datos, y pre-llenar el formulario de registro de facturas que ya existe. La persona revisa, corrige y confirma. Esta es la vía principal de ingreso; las manuales pasan a ser ocasionales.
- **Parte B — Dashboards para el Admin:** estadísticas por sucursal y consolidadas, construidas sobre los datos que las fases anteriores ya generan.

**ANTES DE ESCRIBIR CÓDIGO — lee estos archivos para respetar las convenciones exactas del proyecto:**
1. `prisma/schema.prisma` — modelos y relaciones (especialmente `FacturaProveedor`, `VentaCalculada`, `CierreTurno`, `ConsultaIA`, `DetalleCoche`, `PrecioProducto`).
2. `src/lib/prisma.ts` — la instancia de Prisma es un **proxy con inicialización perezosa**; impórtala y úsala tal cual (no crees un `new PrismaClient()`).
3. `src/lib/facturas.ts` — helpers existentes (`insumosConUltimoCosto`, evolución de costos). Reúsalos.
4. `src/lib/catalogo.ts` — helper `dinero()` y patrón de "precio vigente en una fecha". Reúsalos para valorar y formatear.
5. `src/app/(panel)/facturas/actions.ts` — la acción `crearFactura` y su **estructura de payload exacta** (ver abajo). El escaneo debe producir datos compatibles con esta misma estructura.
6. `src/app/(panel)/facturas/FacturaForm.tsx` — props actuales: `{ proveedores, insumos, sucursales, hoy }`. Hay que extenderlo para aceptar valores iniciales del escaneo.
7. `src/app/(panel)/facturas/nueva/page.tsx` — cómo se cargan los datos y se renderiza el formulario.
8. `src/app/api/cron/plan-semanal/route.ts` — patrón de **route handler protegido por secreto de entorno**; imítalo para proteger el endpoint de escaneo.
9. Una página de la Fase 2/3 con datos (`src/app/(panel)/caja/page.tsx`) para copiar el patrón de página servidor: `export const dynamic = "force-dynamic"`, conversión de `Decimal` con `Number()`, redondeo `Math.round(x*100)/100`, fechas con `Intl.DateTimeFormat`.

**Reglas generales:** no modifiques las fases anteriores salvo los puntos de integración indicados. La única dependencia nueva permitida es el SDK oficial de Anthropic (`@anthropic-ai/sdk`); no agregues librerías de gráficos (los dashboards se hacen con SVG/HTML y Tailwind a mano). Anota explícitamente el tipo de los callbacks de transacción Prisma como `async (tx: typeof prisma) => {}` para pasar el chequeo estricto. Maneja todo `Decimal` con `Number()`.

## ESTRUCTURA DEL PAYLOAD DE `crearFactura` (el escaneo debe rellenar ESTO)

La acción `crearFactura` ya recibe un JSON en `formData.get("payload")` con esta forma (validada por Zod). El escaneo NO crea su propia ruta de guardado: produce un objeto con esta forma para pre-llenar el formulario, y el guardado final pasa por la acción existente.

```ts
{
  proveedorId?: string;                 // si coincide con uno existente
  proveedorNuevo?: { nombre: string; contacto?: string|null; telefono?: string|null };
  sucursalId: string;                   // obligatorio (lo elige la persona)
  fecha: string;                        // "YYYY-MM-DD"
  numero?: string | null;               // número de factura
  lineas: Array<{
    insumoId?: string;                  // si coincide con un insumo existente
    insumoNuevo?: { nombre: string; unidadMedida: string };
    cantidad: number;                   // > 0
    costoTotal: number;                 // > 0
  }>;                                    // mínimo 1
}
```

## PARTE A — ESCANEO DE FACTURAS CON IA

### A1. Dependencia y variable de entorno
- Agrega `@anthropic-ai/sdk` a `package.json`.
- Usa `process.env.ANTHROPIC_API_KEY` (ya está documentada en `.env.example`; si falta, agrégala). La clave **solo** se usa en el servidor; nunca la expongas al cliente.

### A2. Endpoint de extracción — `src/app/api/ia/escanear-factura/route.ts`
- Route handler `POST` que recibe la imagen o PDF de la factura (base64 o multipart; elige uno y documsenta en un comentario).
- Llama a la API de Claude con un modelo con visión (usa `claude-sonnet-4-5` o el identificador vigente del SDK; si no estás seguro, deja el modelo en una constante al inicio del archivo para cambiarlo fácil).
- El prompt al modelo debe pedir **exclusivamente un JSON** (sin texto adicional, sin markdown) con esta forma:
  ```json
  {
    "proveedorNombre": "string|null",
    "numero": "string|null",
    "fecha": "YYYY-MM-DD|null",
    "lineas": [{ "descripcion": "string", "cantidad": number, "unidad": "string|null", "costoTotal": number }]
  }
  ```
- Parsea la respuesta de forma robusta: quita posibles fences ```json, `JSON.parse`, y **valida con Zod**. Si el modelo devuelve algo inválido, responde un error claro (no rompas).
- **Mapeo a entidades existentes (hazlo en el servidor):**
  - Si `proveedorNombre` coincide (case-insensitive, sin tildes) con un `Proveedor` existente → devuelve su `proveedorId`. Si no, devuelve `proveedorNuevo: { nombre }`.
  - Para cada línea, intenta casar la `descripcion` con un `Insumo` existente por nombre aproximado → `insumoId`; si no, `insumoNuevo: { nombre: descripcion, unidadMedida: unidad ?? "unidad" }`.
  - Devuelve el objeto ya con la forma del payload de `crearFactura` (sin `sucursalId`, que lo elige la persona), más un bloque `crudo` con lo que devolvió la IA tal cual.
- **Registra el uso** creando un `ConsultaIA` con `tipo: "ESCANEO_FACTURA"`, `entrada` = nombre/ú­ltimos datos de la factura (no la imagen completa), `respuesta` = JSON extraído, `userId` = usuario de la sesión. Verifica rol `ADMIN` o `ATENCION_CLIENTE` antes de procesar.
- (Opcional, si es simple) sube la imagen a **Vercel Blob** y guarda la URL para pasarla luego a `imagenUrl`. Si no lo implementas, deja un comentario `TODO` claro; no bloquees la fase por esto.

### A3. Integración en el formulario de registro
- Extiende `FacturaForm` para aceptar un prop opcional de **valores iniciales** (proveedor detectado, número, fecha, líneas con sus insumos casados o nuevos). Cuando llegue, inicializa el estado del formulario con esos valores en vez de vacío. **No rompas** el uso actual sin valores iniciales (todos los props nuevos son opcionales).
- En `src/app/(panel)/facturas/nueva/page.tsx` agrega, encima del formulario, un componente cliente de escaneo: un input de archivo/cámara (`accept="image/*"` con `capture` para móvil, y PDF) que sube el archivo al endpoint A2, muestra estado de carga ("Leyendo la factura…"), y al recibir la respuesta **rellena el formulario** con los valores iniciales.
- Deja siempre visible que los datos son una propuesta de la IA y que la persona debe revisar el monto, la sucursal y las líneas antes de guardar. El guardado final usa la acción `crearFactura` ya existente; cuando el origen sea escaneo, marca `origenRegistro: "ESCANEO_IA"` (extiende mínimamente el payload/acción para aceptar ese origen y, si lo implementaste, `imagenUrl` y `datosIaJson`; mantén compatibilidad con el registro manual que usa `"MANUAL"`).

### A4. Manejo de errores y costo
- Si la API falla, hay timeout, o la imagen no es legible: muestra un mensaje amable ("No pudimos leer la factura, regístrala manualmente abajo") y deja el formulario manual funcionando. El escaneo nunca debe ser un punto único de falla.

## PARTE B — DASHBOARDS (solo ADMIN) en `src/app/(panel)/dashboard/page.tsx`

Reemplaza el placeholder actual. `export const dynamic = "force-dynamic"`. Todo filtrable por **sucursal (Principal / Consejo / Consolidado)** y por **rango de fechas** (con un selector simple por query params; por defecto, últimos 30 días en hora de Ecuador). Construye los indicadores a partir de los datos reales:

1. **Ventas** (de `VentaCalculada`): total del período, serie por día (gráfico de barras o líneas en SVG), y desglose por producto (más y menos vendidos). Valor en `dinero()`.
2. **Producción y ganancia estimada** (de `CocheProduccion` + `DetalleCoche`, valorando con el precio vigente del día de cada coche, igual que ya se hace en la página de producción): unidades producidas, mermas, e ingreso estimado del período.
3. **Costos de insumos** (de `FacturaProveedor` + `CompraInsumo`): total comprado en el período por sucursal; opcionalmente los insumos de mayor gasto.
4. **Caja** (de `CierreTurno`): suma de descuadres del período (cuánto faltó/sobró en total), y lista de turnos con mayor descuadre (para detectar pérdidas por turno/empleada).
5. **Facturas** (de `FacturaProveedor`): cuántas y cuánto dinero hay **pendiente** vs. pagado, por sucursal.

Requisitos de presentación:
- Mobile-first; tarjetas con los totales arriba, gráficos abajo. Usa los tokens del proyecto: colores `masa`, `corteza`, `horno`, `cuadre` (`cuadre-ok` verde / `cuadre-mal` rojo para descuadres), utilidades `rounded-panel`, `text-touch-lg`.
- Gráficos en SVG/HTML a mano (sin librerías). Mantenlos legibles y simples.
- Maneja el caso "sin datos en el período" con un mensaje claro en cada tarjeta.
- **Exportación a CSV** (RF-06.3): un botón que descargue las ventas del período filtrado como CSV. Puede ser un route handler `src/app/api/dashboard/export/route.ts` que arme el CSV en el servidor respetando los mismos filtros, o una generación en cliente a partir de los datos ya cargados. Solo ADMIN.

## CRITERIOS DE ACEPTACIÓN
- `npx tsc --noEmit` pasa sin errores y `npm run build` compila.
- Subir una foto de factura llama a la API de Claude, extrae los datos y **pre-llena** el formulario existente; la persona puede corregir y guardar con la acción `crearFactura`. Si la IA falla, el registro manual sigue funcionando.
- Las facturas creadas por escaneo quedan con `origenRegistro = "ESCANEO_IA"` y se registra un `ConsultaIA` de tipo `ESCANEO_FACTURA`. El registro manual sigue marcando `"MANUAL"`.
- El dashboard muestra ventas, producción/ganancia, costos, descuadres de caja y facturas pendientes, filtrables por sucursal y fecha, con exportación CSV de ventas.
- La `ANTHROPIC_API_KEY` solo se usa en el servidor. Nada de claves en el cliente.
- Todo en español, mobile-first, con los tokens de Tailwind del proyecto.

Trabaja paso a paso: primero lee los archivos indicados, implementa la Parte A, verifica que el formulario se pre-llena, luego la Parte B, y al final ejecuta `npx tsc --noEmit` y `npm run build` para confirmar que todo queda en verde. Recuérdame al terminar que debo agregar `ANTHROPIC_API_KEY` en las variables de entorno de Vercel y, si usaste Vercel Blob, el token correspondiente.
