// Length and size limits. Each value is tagged in docs/architecture/domain-model.md
// as [AC] (acceptance criterion), [ex] (example value adopted) or [prop] (proposed).
/** The highest price of a task, in kopecks. Also the cap of one sandbox top-up, so one top-up can pay for any task (US-26, OQ-33). */
const PRICE_MAX_KOPECKS = 2_000_000;

export const LIMITS = {
  emailTokenTtlHours: 24,
  passwordMinLength: 8,
  displayName: { min: 2, max: 60 },
  title: { min: 5, max: 120 },
  description: { min: 1, max: 5000 },
  priceKopecks: { min: 5_000, max: PRICE_MAX_KOPECKS },
  applicationNoteMax: 500,
  bioMax: 500,
  skillsMax: 20,
  skillLength: { min: 1, max: 40 },
  revisionCommentMax: 2000,
  moderationReasonMax: 500,
  messageMax: 2000,
  commissionBp: { min: 0, max: 5000, default: 1000 },
  documentMaxBytes: 10 * 1024 * 1024,
  resultMaxBytes: 50 * 1024 * 1024,
  resultFilesMax: 10,
  cardNumberLength: 16,
  feedPage: { default: 20, max: 50 },
  myWorkMax: 100,
  /** US-36: the student's withdrawal list and the moderator's queue, both without paging (api.md §4.1c, §4.1d). */
  withdrawalsMax: 100,
  /** US-37: the experience records in a public profile, newest first, without paging (api.md §4.9). */
  experienceMax: 100,
  sandboxTopUp: { min: 100, max: PRICE_MAX_KOPECKS },
  /** The highest balance of one account, in kopecks (10 000 000 UAH). Far below the 32-bit integer of the database column. */
  balanceMaxKopecks: 1_000_000_000,
  candidatesMax: 100,
  chatPage: { max: 100 },
  notificationsPage: { default: 20, max: 50, unreadMax: 200 },
} as const;
