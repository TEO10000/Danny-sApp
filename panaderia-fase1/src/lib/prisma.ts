import { PrismaClient } from "@prisma/client";

// Inicialización perezosa: el cliente se construye en el primer uso real
// (una consulta en runtime), nunca durante el build. En desarrollo se
// reutiliza la misma instancia entre recargas para no agotar conexiones.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = client[prop as keyof PrismaClient];
    return typeof value === "function" ? (value as Function).bind(client) : value;
  },
});
