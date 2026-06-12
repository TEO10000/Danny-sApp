import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // --- Sucursales (nombres internos reales) ---
  const principal = await prisma.sucursal.upsert({
    where: { nombre: "Principal" },
    update: {},
    create: { nombre: "Principal" },
  });
  const consejo = await prisma.sucursal.upsert({
    where: { nombre: "Consejo" },
    update: {},
    create: { nombre: "Consejo" },
  });

  // --- Usuarios iniciales (cambiar contraseñas después del primer ingreso) ---
  const usuarios = [
    { nombre: "Administrador", email: "admin@panaderia.local", password: "Admin2026!", rol: "ADMIN" as const },
    { nombre: "Maestro Panadero", email: "panadero@panaderia.local", password: "Horno2026!", rol: "PANADERO" as const },
    { nombre: "Atención al Cliente", email: "caja@panaderia.local", password: "Caja2026!", rol: "ATENCION_CLIENTE" as const },
  ];

  for (const u of usuarios) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        nombre: u.nombre,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 10),
        rol: u.rol,
      },
    });
  }

  console.log("Seed listo:");
  console.log(`  Sucursales: ${principal.nombre}, ${consejo.nombre}`);
  console.log("  admin@panaderia.local / Admin2026!");
  console.log("  panadero@panaderia.local / Horno2026!");
  console.log("  caja@panaderia.local / Caja2026!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
