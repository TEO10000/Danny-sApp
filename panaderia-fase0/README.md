# Panadería — Sistema de Gestión Interna

Fase 0 (Fundaciones): Next.js 14 + TypeScript + Prisma + Auth.js v5 con 3 roles,
2 sucursales (Principal y Consejo) y despliegue en Vercel.

## Requisitos
- Node.js 18.18+ (recomendado 20)
- Una cuenta gratuita en [Neon](https://neon.tech) (Postgres)
- Una cuenta en [Vercel](https://vercel.com)

## 1. Configurar en local

```bash
npm install
cp .env.example .env
```

Edita `.env`:
1. En Neon crea un proyecto y copia la cadena **Pooled connection** en `DATABASE_URL`
   y la cadena directa (sin `-pooler`) en `DIRECT_URL`.
2. Genera `AUTH_SECRET` con: `openssl rand -base64 32`
3. Pon cualquier texto largo en `CRON_SECRET`.
4. `ANTHROPIC_API_KEY` queda vacío hasta la Fase 4/5.

Crea las tablas y los datos iniciales:

```bash
npm run db:migrate     # crea la migración inicial en Neon
npm run db:seed        # crea sucursales Principal/Consejo y 3 usuarios de prueba
npm run dev            # http://localhost:3000
```

Usuarios de prueba (cámbialos en producción):

| Rol | Correo | Contraseña | Entra a |
|---|---|---|---|
| Admin (dueños) | admin@panaderia.local | Admin2026! | /dashboard (ve todo) |
| Maestro panadero | panadero@panaderia.local | Horno2026! | /produccion |
| Atención al cliente | caja@panaderia.local | Caja2026! | /caja y /facturas |

## 2. Desplegar en Vercel

1. Sube el proyecto a un repositorio de GitHub.
2. En Vercel: **Add New → Project → importa el repo**. Vercel detecta Next.js solo.
3. En **Settings → Environment Variables** agrega: `DATABASE_URL`, `DIRECT_URL`,
   `AUTH_SECRET`, `CRON_SECRET` (y más adelante `ANTHROPIC_API_KEY`).
4. Deploy. El `vercel.json` ya deja programado el cron del plan semanal:
   domingos 11:00 UTC = **06:00 hora Ecuador**.
5. Las migraciones en producción se aplican con `npx prisma migrate deploy`
   (puedes correrlo desde tu máquina apuntando al `DATABASE_URL` de producción,
   o agregarlo al build más adelante).

## Estructura

```
prisma/schema.prisma        Esquema completo v1.1 (sucursales, coches, cierres, facturas…)
prisma/seed.ts              Sucursales + usuarios iniciales
src/lib/auth.config.ts      Reglas de acceso por rol (corre en Edge)
src/lib/auth.ts             Login con credenciales (bcrypt + Prisma)
src/middleware.ts           Protección de todas las rutas
src/app/login/              Pantalla de ingreso
src/app/(panel)/            Dashboard, Producción, Caja, Facturas (placeholders por fase)
src/app/api/cron/...        Endpoint del plan semanal (Fase 5)
```

## Diseño ("Horno")
Tokens en `tailwind.config.ts`: `masa` (fondos), `corteza` (texto), `horno`
(único acento, acciones primarias) y `cuadre.ok/mal` reservados para estados de
caja. Botones e inputs grandes: todo se diseña primero para el celular del mostrador.

## Fases siguientes
1. Catálogo y producción (coches/latas, ganancia por coche)
2. Sobrantes y cierre de caja ($40, descuadres)
3. Proveedores y facturas (CRUD de estados)
4. Escaneo de facturas con IA + dashboards
5. Campañas + plan semanal con la API de Claude
