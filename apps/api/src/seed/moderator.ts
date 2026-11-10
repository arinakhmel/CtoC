import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Creates the moderator account if the email is free (ADR-0006: moderators are never self-registered).
 * Idempotent: an existing account is left untouched, including its password. Returns true when created.
 */
export async function ensureModerator(
  prisma: PrismaClient,
  options: { email: string; password: string; displayName?: string },
): Promise<boolean> {
  const email = options.email.trim().toLowerCase();
  if ((await prisma.user.findUnique({ where: { email } })) !== null) return false;
  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(options.password, 10),
      displayName: options.displayName ?? 'Модератор',
      role: 'moderator',
      emailConfirmedAt: new Date(),
    },
  });
  return true;
}
