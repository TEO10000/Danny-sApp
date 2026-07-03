# Prompt para Claude Code — Danny'sApp Fase 6B: CRUD de usuarios (Admin) + AuditLog

Copia todo lo que sigue como prompt de Claude Code, ejecutado desde la raíz del repo `Danny-sApp`.

---

Estás trabajando en **Danny'sApp** (subdirectorio activo **`panaderia-fase0/`**), sistema de gestión interna de una panadería con dos sucursales en Ecuador. En la fase anterior (6A) se implementó una sidebar lateral (`src/components/Sidebar.tsx`) cuyos enlaces salen del array `NAV` en `src/app/(panel)/layout.tsx`, filtrado por rol en el servidor.

## Contexto técnico (NO violar ninguna de estas convenciones)

- Next.js 14 App Router + TypeScript, Tailwind con sistema "Horno" (`masa-*`, `corteza-*`, `horno-*`, `cuadre-*`). Sin librerías nuevas de ningún tipo.
- Prisma 5 + PostgreSQL (Neon). El cliente Prisma está en `src/lib/prisma.ts` como Proxy de inicialización perezosa — **importarlo siempre de ahí, jamás instanciar otro**.
- Auth.js v5, JWT (8h), roles `ADMIN` | `PANADERO` | `ATENCION_CLIENTE` en `session.user.rol`. Contraseñas con `bcryptjs`, costo 10 (igual que `prisma/seed.ts`).
- Formularios: `useFormState`/`useFormStatus` de `react-dom`, validación **Zod en el servidor** dentro de las server actions (patrón existente en `src/app/(panel)/catalogo/actions.ts` — léelo primero y replica su estilo).
- Páginas de servidor: `export const dynamic = "force-dynamic"`.
- Textos de UI en español. Zona horaria de referencia: America/Guayaquil.
- Transacciones: callbacks tipados con `Prisma.TransactionClient` importado de `@prisma/client`.
- **Autorización siempre en servidor**: cada server action de esta fase debe verificar `session.user.rol === "ADMIN"` por sí misma; el middleware es solo la primera barrera.

## Estado actual relevante

- `model User` en `prisma/schema.prisma`: `id (cuid)`, `nombre`, `email @unique`, `passwordHash`, `rol`, `activo Boolean @default(true)`, `createdAt`, más relaciones hacia coches, cierres, facturas (registradas y pagadas), planes y consultas IA. **Por esas FKs, jamás se borra físicamente un usuario: solo se desactiva.**
- `authorize` en `src/lib/auth.ts` ya rechaza el login si `!user.activo`. Lo que falta es expulsar a quien ya tiene una sesión JWT viva cuando se le desactiva (se resuelve en la Tarea 3).
- El mapa de permisos por prefijo de ruta está en `PERMISOS` dentro de `src/lib/auth.config.ts`.

---

## TAREA 1 — Entidad `AuditLog` (base para esta fase y las siguientes)

### Schema (`prisma/schema.prisma`)

```prisma
model AuditLog {
  id            String   @id @default(cuid())
  entidad       String   // "User" | "CierreTurno" | "CocheProduccion" | "FacturaProveedor" ...
  entidadId     String
  accion        String   // "CREAR" | "EDITAR" | "DESACTIVAR" | "ACTIVAR" | "RESET_PASSWORD" ...
  campo         String?  // nombre del campo cambiado (null en CREAR)
  valorAnterior String?  // serializado a string (null en CREAR)
  valorNuevo    String?
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  fecha         DateTime @default(now())

  @@index([entidad, entidadId])
  @@index([fecha])
}
```

Agrega la relación inversa `auditLogs AuditLog[]` en `model User`. Migración con `npx prisma migrate dev --name audit_log` (aditiva, no toca datos existentes).

### Helper: `src/lib/auditoria.ts`

Función `registrarAuditoria(tx, { entidad, entidadId, accion, cambios, userId })` donde:
- `tx` es `Prisma.TransactionClient` (o el cliente normal), para poder llamarla **dentro** de la misma transacción que hace el cambio.
- `cambios` es un array opcional de `{ campo, valorAnterior, valorNuevo }`; si viene, crea un registro por campo cambiado (usar `createMany`); si no (p. ej. CREAR), crea un solo registro sin campo.
- **Nunca** registrar hashes de contraseña en `valorAnterior`/`valorNuevo`: para resets guardar la acción `RESET_PASSWORD` sin valores.

---

## TAREA 2 — Módulo `/usuarios` (solo ADMIN)

### Rutas y permisos

- Nueva carpeta `src/app/(panel)/usuarios/` con `page.tsx` (listado + crear) y `[id]/page.tsx` (editar) o el patrón de diálogo/inline que ya use el catálogo — replica el patrón existente del catálogo, no inventes uno nuevo.
- Agregar `{ prefijo: "/usuarios", roles: ["ADMIN"] }` a `PERMISOS` en `src/lib/auth.config.ts`.
- Agregar la entrada `{ href: "/usuarios", etiqueta: "Usuarios", roles: ["ADMIN"] }` al array `NAV` del layout, con su ícono SVG inline (silueta de personas) siguiendo el estilo de los íconos de la sidebar de 6A. Ubicarla junto a las secciones de administración (después de Catálogo).

### Listado (`page.tsx`, server component, `force-dynamic`)

- Tabla/tarjetas mobile-first con: nombre, email, rol legible ("Atención al Cliente", etc.), estado (badge Activo/Inactivo con colores Horno), fecha de creación (formateada en America/Guayaquil).
- Usuarios inactivos visibles pero atenuados, con acción "Reactivar".
- Botón "Nuevo usuario".

### Server actions (`actions.ts` en la misma carpeta)

Todas: verificar sesión ADMIN al inicio; validación Zod; envolver cambio + auditoría en `prisma.$transaction`; `revalidatePath("/usuarios")`.

1. **`crearUsuario`** — campos: nombre (min 2), email (email válido, guardar en minúsculas/trim, manejar violación de unicidad con mensaje claro "Ese email ya está registrado"), rol (enum), contraseña inicial (min 8). Hash con `bcrypt.hash(pw, 10)`. Auditoría `CREAR`.
2. **`editarUsuario`** — editable: nombre, email, rol. No editable aquí: contraseña. Auditoría `EDITAR` con un registro por campo realmente cambiado (comparar contra el valor actual antes de escribir).
3. **`resetearPassword`** — genera una contraseña temporal aleatoria legible (10–12 caracteres alfanuméricos sin ambiguos como 0/O/1/l, usando `crypto.randomBytes` de Node, no `Math.random`), la hashea, guarda, y **la devuelve en el estado del formulario para mostrarla UNA sola vez** al admin con aviso "Cópiala ahora; no se volverá a mostrar". Auditoría `RESET_PASSWORD` sin valores.
4. **`cambiarEstadoUsuario`** (desactivar/reactivar) — reglas duras en servidor:
   - El admin **no puede desactivarse a sí mismo** (comparar con `session.user.id`).
   - No se puede desactivar al **último ADMIN activo** (contar dentro de la transacción: `tx.user.count({ where: { rol: "ADMIN", activo: true } })`).
   - Auditoría `DESACTIVAR`/`ACTIVAR`.
   - Desactivar es soft delete; **nunca** implementar borrado físico (FKs históricas).

### UI de formularios

- `useFormState`/`useFormStatus`, mensajes de error en español bajo cada campo, botón con estado "Guardando…".
- Confirmación explícita (diálogo o doble paso) antes de desactivar: "¿Desactivar a {nombre}? No podrá iniciar sesión y sus sesiones activas se cerrarán."
- La contraseña temporal del reset se muestra en un bloque destacado con botón "Copiar".

---

## TAREA 3 — Expulsión inmediata de usuarios desactivados (RF-P07 dependencia / decisión D5)

El middleware corre en Edge sin Prisma, así que el chequeo por request va en el **layout del panel** (Node):

1. En `src/app/(panel)/layout.tsx`, tras obtener la sesión, consultar `prisma.user.findUnique({ where: { id: session.user.id }, select: { activo: true } })`.
2. Si el usuario no existe o `activo === false`, redirigir a una nueva ruta `src/app/api/salir/route.ts` (GET) que ejecuta `signOut({ redirectTo: "/login" })` de `@/lib/auth` para destruir la cookie de sesión. Con la cookie destruida no hay bucle con la redirección de `/login` para usuarios autenticados.
3. Es una consulta por request sobre PK con `select` mínimo: aceptable a esta escala. No cachearla (el layout ya se renderiza dinámico porque las páginas son `force-dynamic`).

---

## Criterios de aceptación (verificar TODOS antes de terminar)

1. `npm run build` y `npx prisma migrate dev` pasan sin errores; migración puramente aditiva.
2. PANADERO o ATENCION_CLIENTE que intenten `/usuarios` son redirigidos por el middleware, **y** las server actions rechazan igualmente si se invocan directo (defensa en profundidad).
3. Crear, editar, resetear y desactivar/reactivar funcionan y cada operación deja su rastro en `AuditLog` (verificable con `npx prisma studio`).
4. Imposible: desactivarse a sí mismo, quedar sin ADMIN activo, ver una contraseña temporal dos veces, encontrar un hash en AuditLog.
5. Un usuario desactivado con sesión viva es expulsado al `/login` en su siguiente navegación dentro del panel.
6. Email duplicado muestra mensaje claro, no un error 500.
7. UI en español, mobile-first, estilo Horno, sin librerías nuevas.
8. Nada de esta fase toca: lógica de cálculo de ventas/caja, schema de entidades operativas, ni las vistas de otros módulos (solo el layout para NAV + chequeo de activo).

## Al terminar

- Resumen de archivos creados/modificados y del resultado de las 4 reglas duras probadas.
- Commit sugerido: `feat(fase6b): CRUD de usuarios para admin + AuditLog + expulsión de sesiones inactivas`
- NO hacer push ni tocar configuración de Vercel.
