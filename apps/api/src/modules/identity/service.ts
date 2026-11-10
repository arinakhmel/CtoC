import { emailDomain, type RegisterInput } from '@ctoc/shared';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { getMailer } from '../../platform/ports/mailer';
import {
  CONFIRM_TOKEN_TTL_MS,
  generateSessionId,
  generateToken as defaultGenerateToken,
  hashSessionId,
  hashToken,
  SESSION_TTL_MS,
  tokenFailure,
} from './domain';
import {
  confirmUser,
  deleteExpiredSessions,
  consumeToken,
  findTokenByHash,
  findStudentById,
  findUserByEmail,
  findUserById,
  insertConfirmToken,
  insertSession,
  insertUser,
  invalidateUnusedConfirmTokens,
  isUniversityDomainListed,
} from './repo';

const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173';

/** Sent after the transaction. A failed send never fails the request (integrations.md). */
async function sendConfirmationEmail(to: string, token: string): Promise<void> {
  const link = `${appUrl()}/confirm-email?token=${encodeURIComponent(token)}`;
  try {
    await getMailer().send({
      to,
      subject: 'Підтвердіть електронну пошту в CtoC',
      text: `Щоб активувати акаунт, відкрийте посилання (діє 24 години): ${link}`,
      link,
    });
  } catch (error) {
    console.error('Confirmation email was not sent', error);
  }
}

/**
 * US-06 / US-43. Creates an unconfirmed account and its confirmation token in one transaction
 * (INV-01 is the unique email index), then sends the email.
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

  await sendConfirmationEmail(user.email, token);
  return user;
}

/**
 * US-07/S1, S2. The token is consumed by a conditional update (single use, not expired), and the
 * account is confirmed in the same transaction. Two concurrent requests: one wins, one gets TOKEN_INVALID.
 */
export async function confirmEmail(token: string) {
  const tokenHash = hashToken(token);
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const row = await findTokenByHash(tx, tokenHash);
    if (!row || row.purpose !== 'confirm_email') throw new ApiError('TOKEN_INVALID');

    const consumed = await consumeToken(tx, row.id, now);
    if (consumed.count === 0) throw new ApiError(tokenFailure(row, now));

    await confirmUser(tx, row.userId, now); // already confirmed by another means: nothing to change
    return findUserById(tx, row.userId);
  });
}

/**
 * US-07/S3. Public (the user may not be able to log in yet). Older unused tokens are invalidated and a
 * new one is stored in one transaction. An unknown email gets the same silent answer as a known one.
 */
export async function resendConfirmation(email: string, deps: { generateToken?: () => string } = {}) {
  const user = await findUserByEmail(email);
  if (!user) return;
  if (user.emailConfirmedAt !== null) throw new ApiError('EMAIL_ALREADY_CONFIRMED');

  const token = (deps.generateToken ?? defaultGenerateToken)();
  await prisma.$transaction(async (tx) => {
    await invalidateUnusedConfirmTokens(tx, user.id, new Date());
    await insertConfirmToken(tx, {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + CONFIRM_TOKEN_TTL_MS),
    });
  });
  await sendConfirmationEmail(user.email, token);
}

/** Compared when the email is unknown, so both failures take about the same time (US-45/S2). */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

/**
 * US-45. Wrong password and unknown email are the same INVALID_CREDENTIALS. An unconfirmed user may log in
 * (they can only resend the confirmation email). Returns the cookie value: only its hash is stored.
 */
export async function login(email: string, password: string) {
  const user = await findUserByEmail(email);
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) throw new ApiError('INVALID_CREDENTIALS');

  const now = new Date();
  const sessionId = generateSessionId();
  await deleteExpiredSessions(now);
  await insertSession({ id: hashSessionId(sessionId), userId: user.id, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) });
  return { user, sessionId, maxAgeMs: SESSION_TTL_MS };
}

/** US-09. A missing account and a non-student account are both NOT_FOUND, so the URL reveals nothing. */
export async function getPublicProfile(userId: string) {
  const user = await findStudentById(userId);
  if (!user) throw new ApiError('NOT_FOUND');
  return user;
}
