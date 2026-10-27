import { PrismaClient } from '@prisma/client';

/** Prisma client bound to the test database (DATABASE_URL is set in vitest.config.ts). */
export const prisma = new PrismaClient();

/**
 * Empties every table, keeping the schema. Call it in `beforeEach` of any test that touches the
 * database, so tests never depend on each other.
 */
export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  try {
    for (const { name } of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${name}"`);
  } finally {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  }
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
