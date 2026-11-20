import { createHash, randomUUID } from 'node:crypto';
import { checkDocumentUpload, LIMITS, type ModVerificationsQuery, type TelegramUpdate } from '@ctoc/shared';
import { Prisma, type User, type VerificationRequest } from '@prisma/client';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { getFileStorage } from '../../platform/ports/file-storage';
import { getMailer } from '../../platform/ports/mailer';
import { answerCallback, editCaption, sendReviewRequest, telegramConfig } from '../../platform/telegram';
import { notifyVerificationApproved, notifyVerificationRejected } from '../notifications/service';
import { detectDocumentMime, parseDecision, TELEGRAM_REJECT_REASON, VERIFICATION_APPROVED, VERIFICATION_REJECTED } from './domain';
import { assertStudentWithConfirmedEmail } from './policy';
import {
  decidePending,
  findLatestRequest,
  findRequestById,
  findRequestWithStudentTx,
  findUserEmail,
  guardNotVerified,
  insertAuditEvent,
  insertDocumentFile,
  insertPendingRequest,
  listRequestsByStatus,
  markStudentVerified,
} from './repo';

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

const moderatorName = (from: { id: number; username?: string | undefined; first_name?: string | undefined }) =>
  from.username ? `@${from.username}` : (from.first_name ?? `id ${from.id}`);

interface Decision {
  userId: string;
  approve: boolean;
  /** Null on approve. */
  reason: string | null;
  /** Set by the web screen: only this document is decided (the one the moderator saw). Telegram knows only the user. */
  requestId?: string;
  /** Set by the web screen: the moderator's account. Telegram moderators have none, so it stays empty. */
  moderatorId?: string;
  audit: Record<string, unknown>;
}

/**
 * The one decision, for both entrances (INV-03, INV-04, INV-24, ADR-0007). One transaction: the conditional update of the
 * pending request, the badge on approve, the audit event and the notification to the student (INV-23). Returns null when nothing
 * was pending (already decided), and the email of the student otherwise. The email is sent by the caller after the commit.
 */
async function decideVerification(decision: Decision): Promise<{ email: string | null } | null> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const status = decision.approve ? VERIFICATION_APPROVED : VERIFICATION_REJECTED;
    const moved = await decidePending(tx, { userId: decision.userId, requestId: decision.requestId, status, reason: decision.reason, decidedBy: decision.moderatorId, now });
    if (moved.count === 0) return null;
    if (decision.approve) {
      await markStudentVerified(tx, decision.userId, now);
      await notifyVerificationApproved(tx, decision.userId);
    } else {
      await notifyVerificationRejected(tx, decision.userId, decision.reason ?? TELEGRAM_REJECT_REASON);
    }
    await insertAuditEvent(tx, {
      action: decision.approve ? 'verification.approved' : 'verification.rejected',
      entityId: decision.userId,
      actorId: decision.moderatorId,
      data: decision.audit,
    });
    return { email: (await findUserEmail(tx, decision.userId))?.email ?? null };
  });
}

/** US-39. The moderator's queue (api.md §4.8b). The caller has already checked the moderator role (INV-25). */
export const listVerificationQueue = (query: ModVerificationsQuery) => listRequestsByStatus(query.status, LIMITS.verificationQueueMax);

/**
 * US-39 sc.1, sc.2. A moderator decides the request they saw. An unknown id is 404, a request that is no longer pending (decided,
 * or the student sent a newer document) is 409 ALREADY_DECIDED and nothing changes. The result email follows the commit.
 */
export async function decideByModerator(moderatorId: string, requestId: string, outcome: { approve: true } | { approve: false; reason: string }) {
  const request = await findRequestById(requestId);
  if (!request) throw new ApiError('NOT_FOUND');
  const decided = await decideVerification({
    userId: request.userId,
    requestId,
    moderatorId,
    approve: outcome.approve,
    reason: outcome.approve ? null : outcome.reason,
    audit: { via: 'web', requestId },
  });
  if (!decided) throw new ApiError('ALREADY_DECIDED');
  if (decided.email) await sendResultEmail(decided.email, outcome.approve, outcome.approve ? null : outcome.reason);
  return prisma.$transaction((tx) => findRequestWithStudentTx(tx, requestId));
}

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
  const decided = await decideVerification({
    userId: decision.userId,
    approve,
    reason: approve ? null : TELEGRAM_REJECT_REASON,
    audit: { via: 'telegram', moderator: moderatorName(click.from), telegramUserId: click.from.id },
  });
  const email = decided?.email ?? null;

  if (email === null) {
    await toast('Already decided');
    return;
  }

  const who = moderatorName(click.from);
  const status = approve ? `✅ Approved by ${who}` : `❌ Rejected by ${who}`;
  const caption = `${click.message.caption ?? `ID: ${decision.userId}`}\n\n${status}`;
  await editCaption(config, click.message.chat.id, click.message.message_id, caption).catch(logFailure('editMessageCaption'));
  await toast(approve ? 'Approved' : 'Rejected');
  await sendResultEmail(email, approve, approve ? null : TELEGRAM_REJECT_REASON);
}

async function sendResultEmail(to: string, approved: boolean, reason: string | null): Promise<void> {
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
            text: `Вашу верифікацію відхилено.${reason ? ` Причина: ${reason}.` : ''} Ви можете завантажити новий документ: ${link}`,
            link,
          },
    );
  } catch (error) {
    console.error('Verification result email was not sent', error);
  }
}

const logFailure = (what: string) => (error: unknown) =>
  console.error(`Telegram ${what} failed`, error instanceof Error ? error.message : error);
