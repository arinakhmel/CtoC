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

/** Application (Відгук). domain-model.md §3.3. */
export const APPLICATION_STATUSES = ['sent', 'accepted', 'rejected'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

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
