import { emailDomain, type RegisterInput } from '@ctoc/shared';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { getMailer } from '../../platform/ports/mailer';
import { CONFIRM_TOKEN_TTL_MS, generateToken as defaultGenerateToken, hashToken } from './domain';
import { insertConfirmToken, insertUser, isUniversityDomainListed } from './repo';

const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173';

/**
 * US-06 / US-43. Creates an unconfirmed account and its confirmation token in one transaction
 * (INV-01 is the unique email index), then sends the email. A failed send never fails the
 * registration (integrations.md).
 */
export async function register(input: RegisterInput, deps: { generateToken?: () => string } = {}) {
  if (input.role === 'student' && !(await isUniversityDomainListed(emailDomain(input.email)))) {
    throw new ApiError('EMAIL_DOMAIN_NOT_ALLOWED', { details: [{ field: 'email', code: 'EMAIL_DOMAIN_NOT_ALLOWED' }] });
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const token = (deps.generateToken ?? defaultGenerateToken)();

  const user = await prisma.$transaction(async (tx) => {
    let created;
    try {
      created = await insertUser(tx, {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        role: input.role,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError('EMAIL_TAKEN', { details: [{ field: 'email', code: 'EMAIL_TAKEN' }] });
      }
      throw error;
    }
    await insertConfirmToken(tx, {
      userId: created.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + CONFIRM_TOKEN_TTL_MS),
    });
    return created;
  });

  const link = `${appUrl()}/confirm-email?token=${encodeURIComponent(token)}`;
  try {
    await getMailer().send({
      to: user.email,
      subject: 'Підтвердіть електронну пошту в CtoC',
      text: `Щоб активувати акаунт, відкрийте посилання (діє 24 години): ${link}`,
      link,
    });
  } catch (error) {
    console.error('Confirmation email was not sent', error);
  }
  return user;
}
