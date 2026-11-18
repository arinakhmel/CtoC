// Status enums from docs/architecture/domain-model.md. Values are stored as text in the database
// (CHECK constraints in the migration) and used by the API and the web app.
import { z } from 'zod';

export const USER_ROLES = ['student', 'customer', 'moderator'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

/** Task (the brief's "Project"). domain-model.md §3.1. */
export const TASK_STATUSES = [
  'pending_moderation',
  'published',
  'rejected',
  'in_progress',
  'in_review',
  'revision',
  'done',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const taskStatusSchema = z.enum(TASK_STATUSES);

/**
 * US-27 (INV-16, domain-model.md §3.1). The executor may add result files only while the task is `in_progress`, or `revision`
 * after a return. In `in_review` the files are locked (RESULT_LOCKED, US-29 sc.3); `done` and `cancelled` are final.
 * One list for the API (the write lock) and the web (the upload form).
 */
export const RESULT_EDITABLE_STATUSES = ['in_progress', 'revision'] as const satisfies readonly TaskStatus[];
export const isResultEditable = (status: string | undefined): boolean =>
  status !== undefined && (RESULT_EDITABLE_STATUSES as readonly string[]).includes(status);
/** The words the user sees for a task status. The labels of domain-model.md §3.1 (one place, so lists and cards agree). */
export const TASK_STATUS_UK: Record<TaskStatus, string> = {
  pending_moderation: 'На модерації',
  published: 'Опубліковано',
  rejected: 'Відхилено',
  in_progress: 'В роботі',
  in_review: 'На перевірці',
  revision: 'На доопрацюванні',
  done: 'Виконано',
  cancelled: 'Скасовано',
};

/** Application (Відгук). domain-model.md §3.3. */
export const APPLICATION_STATUSES = ['sent', 'accepted', 'rejected'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
/** The words the student sees (US-20 [AC], domain-model.md §2). One place, so US-24 and US-25 show the same labels. */
export const APPLICATION_STATUS_UK: Record<ApplicationStatus, string> = {
  sent: 'Надіслано',
  accepted: 'Прийнято',
  rejected: 'Відхилено',
};

/** Student verification request (drives the student role). domain-model.md §3.2. */
export const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected', 'revoked'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES);

export const ESCROW_STATUSES = ['held', 'released', 'refunded'] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];
export const escrowStatusSchema = z.enum(ESCROW_STATUSES);

export const RESULT_VERSION_STATUSES = ['draft', 'submitted', 'accepted', 'returned'] as const;
export type ResultVersionStatus = (typeof RESULT_VERSION_STATUSES)[number];
export const resultVersionStatusSchema = z.enum(RESULT_VERSION_STATUSES);

export const WITHDRAWAL_STATUSES = ['requested', 'paid', 'rejected'] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];
export const withdrawalStatusSchema = z.enum(WITHDRAWAL_STATUSES);

export const LEDGER_ENTRY_KINDS = [
  'topup',
  'hold',
  'refund',
  'payout',
  'commission',
  'withdrawal',
  'withdrawal_reversal',
] as const;
export type LedgerEntryKind = (typeof LEDGER_ENTRY_KINDS)[number];
export const ledgerEntryKindSchema = z.enum(LEDGER_ENTRY_KINDS);

export const FILE_KINDS = ['student_document', 'result'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const EMAIL_TOKEN_PURPOSES = ['confirm_email', 'reset_password'] as const;
export type EmailTokenPurpose = (typeof EMAIL_TOKEN_PURPOSES)[number];

/** Notification types. US-21, US-30, US-39/S2, US-47, US-48, US-49 and the proposed ones in domain-model.md. */
export const NOTIFICATION_TYPES = [
  'executor_selected',
  'result_accepted',
  'verification_rejected',
  'verification_approved',
  'application_received',
  'result_submitted',
  'result_returned',
  'task_published',
  'task_rejected',
  'withdrawal_processed',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const SETTING_KEYS = ['commission_bp', 'min_price_kopecks', 'max_price_kopecks'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Display labels of a verification request (domain-model.md, decision W-14: «Очікує перевірки»). */
export const VERIFICATION_STATUS_LABELS_UK: Record<VerificationStatus, string> = {
  pending: 'Очікує перевірки',
  approved: 'Підтверджено',
  rejected: 'Відхилено',
  revoked: 'Скасовано',
};
