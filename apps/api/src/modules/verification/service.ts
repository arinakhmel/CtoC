import { createHash, randomUUID } from 'node:crypto';
import { checkDocumentUpload, type TelegramUpdate } from '@ctoc/shared';
import { Prisma, type User, type VerificationRequest } from '@prisma/client';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { getFileStorage } from '../../platform/ports/file-storage';
import { getMailer } from '../../platform/ports/mailer';
import { answerCallback, editCaption, sendReviewRequest, telegramConfig } from '../../platform/telegram';
import { detectDocumentMime, parseDecision } from './domain';
import { assertStudentWithConfirmedEmail } from './policy';
import { decidePending, findLatestRequest, findUserEmail, guardNotVerified, insertAuditEvent, insertDocumentFile, insertPendingRequest, markStudentVerified } from './repo';

export interface UploadedDocument {
  bytes: Buffer;
  originalName: string;
}

const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173';

/**
 * US-08. Checks the file by its content (type and size), stores it, then creates the File row and the
 * pending request in one transaction. INV-04 (one pending request per user) is the partial unique index.
 * The user never gets the student role from this: studentVerifiedAt is set only by a moderator (INV-03).
 * After the commit the document goes to the moderators' Telegram group (when configured).
 */
export async function submitDocument(user: User, upload: UploadedDocument) {
  assertStudentWithConfirmedEmail(user);

  const mime = detectDocumentMime(upload.bytes);
  const rejected = checkDocumentUpload({
    mime: mime ?? 'application/octet-stream',
    sizeBytes: upload.bytes.length,
    fileName: upload.originalName,
  });
  if (rejected) throw new ApiError(rejected, { details: [{ field: 'file', code: rejected }] });

  const storageKey = randomUUID();
  const storage = getFileStorage();
  await storage.put(storageKey, upload.bytes); // file I/O stays outside the transaction

  let request: VerificationRequest;
  try {
    request = await prisma.$transaction(async (tx) => {
      const guard = await guardNotVerified(tx, user.id);
      if (guard.count === 0) throw new ApiError('ALREADY_VERIFIED');

      const file = await insertDocumentFile(tx, {
        ownerId: user.id,
        storageKey,
        originalName: upload.originalName,
        mime: mime!,
        sizeBytes: upload.bytes.length,
        sha256: createHash('sha256').update(upload.bytes).digest('hex'),
      });
      try {
        return await insertPendingRequest(tx, { userId: user.id, fileId: file.id });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ApiError('VERIFICATION_PENDING');
        }
        throw error;
      }
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined); // no orphan file when nothing was saved
    throw error;
  }

  await notifyModerators(user, upload, mime!);
  return request;
}

/** A failed send never fails the upload: the request stays pending and the error is logged. */
async function notifyModerators(user: User, upload: UploadedDocument, mime: string): Promise<void> {
  const config = telegramConfig();
  if (!config) return;
  try {
    await sendReviewRequest(config, {
      bytes: upload.bytes,
      mime,
      fileName: upload.originalName,
      caption: `Student verification request\nEmail: ${user.email}\nID: ${user.id}`,
      userId: user.id,
    });
  } catch (error) {
    console.error('Verification request was not sent to Telegram', error instanceof Error ? error.message : error);
  }
}

export async function getMyVerification(user: User) {
  assertStudentWithConfirmedEmail(user);
  return findLatestRequest(user.id);
}

const REJECT_REASON = 'Відхилено модератором';

const moderatorName = (from: { id: number; username?: string | undefined; first_name?: string | undefined }) =>
  from.username ? `@${from.username}` : (from.first_name ?? `id ${from.id}`);

/**
 * A moderator clicked a button under the document in the Telegram group (webhook, already authenticated by policy).
 * The decision is one conditional update of the pending request plus the badge, in one transaction, so a
 * double click or two moderators give exactly one decision (ADR-0007). Telegram, email and the caption edit
 * come after the commit and never fail the webhook, so Telegram does not retry a decision that is already saved.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const config = telegramConfig();
  const click = update.callback_query;
  if (!config || !click?.message || String(click.message.chat.id) !== config.chatId) return; // not our group

  const toast = (text: string) => answerCallback(config, click.id, text).catch(logFailure('answerCallbackQuery'));
  const decision = parseDecision(click.data);
  if (!decision) {
    await toast('Unknown action');
    return;
  }

  const approve = decision.action === 'verify';
  const email = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const moved = await decidePending(tx, decision.userId, approve ? 'approved' : 'rejected', approve ? null : REJECT_REASON, now);
    if (moved.count === 0) return null;
    if (approve) await markStudentVerified(tx, decision.userId, now);
    await insertAuditEvent(tx, {
      action: approve ? 'verification.approved' : 'verification.rejected',
      entityId: decision.userId,
      data: { via: 'telegram', moderator: moderatorName(click.from), telegramUserId: click.from.id },
    });
    return (await findUserEmail(tx, decision.userId))?.email ?? null;
  });

  if (email === null) {
    await toast('Already decided');
    return;
  }

  const who = moderatorName(click.from);
  const status = approve ? `✅ Approved by ${who}` : `❌ Rejected by ${who}`;
  const caption = `${click.message.caption ?? `ID: ${decision.userId}`}\n\n${status}`;
  await editCaption(config, click.message.chat.id, click.message.message_id, caption).catch(logFailure('editMessageCaption'));
  await toast(approve ? 'Approved' : 'Rejected');
  await sendResultEmail(email, approve);
}

async function sendResultEmail(to: string, approved: boolean): Promise<void> {
  const link = `${appUrl()}/me/verification`;
  try {
    await getMailer().send(
      approved
        ? {
            to,
            subject: 'Статус студента підтверджено в CtoC',
            text: 'Вашу верифікацію підтверджено. Тепер ви можете відгукуватися на завдання, а на вашому профілі є позначка «Верифікований студент».',
          }
        : {
            to,
            subject: 'Верифікацію студента відхилено в CtoC',
            text: `Вашу верифікацію відхилено. Ви можете завантажити новий документ: ${link}`,
            link,
          },
    );
  } catch (error) {
    console.error('Verification result email was not sent', error);
  }
}

const logFailure = (what: string) => (error: unknown) =>
  console.error(`Telegram ${what} failed`, error instanceof Error ? error.message : error);
