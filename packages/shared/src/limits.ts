// Length and size limits. Each value is tagged in docs/architecture/domain-model.md
// as [AC] (acceptance criterion), [ex] (example value adopted) or [prop] (proposed).
export const LIMITS = {
  emailTokenTtlHours: 24,
  passwordMinLength: 8,
  displayName: { min: 2, max: 60 },
  title: { min: 5, max: 120 },
  description: { min: 1, max: 5000 },
  priceKopecks: { min: 5_000, max: 2_000_000 },
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
} as const;
