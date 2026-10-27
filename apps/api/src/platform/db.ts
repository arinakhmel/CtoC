import { PrismaClient } from '@prisma/client';

/** One Prisma client per process. It connects lazily, so importing it needs no database. */
export const prisma = new PrismaClient();
