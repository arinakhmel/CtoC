import {
  executorSelectedPayloadSchema,
  resultAcceptedPayloadSchema,
  resultReturnedPayloadSchema,
  resultSubmittedPayloadSchema,
  verificationApprovedPayloadSchema,
  verificationRejectedPayloadSchema,
  type ExecutorSelectedPayload,
  type VerificationRejectedPayload,
  type ResultAcceptedPayload,
  type ResultReturnedPayload,
  type ResultSubmittedPayload,
} from '@ctoc/shared';

/**
 * US-33: «Замовник повернув результат на доопрацювання за завданням «[Назва]»». The title replaces the placeholder. The comment of
 * the customer is NOT in the notification or its payload: it is shown on the task card, where it stays while the task is in revision.
 */
export const resultReturnedText = (taskTitle: string): string => `Замовник повернув результат на доопрацювання за завданням «${taskTitle}»`;

export const resultReturnedPayload = (task: { id: string; title: string }): ResultReturnedPayload => ({
  taskId: task.id,
  taskTitle: task.title,
});

/**
 * US-30 sc.1 [AC]: «Ваш результат прийнято замовником! Оплату нараховано». A fixed text: the title of the task is kept in the
 * payload only. «Оплату нараховано» is true only if the transaction that creates this notification also credited the payout
 * (INV-18), which is the accept of US-31.
 */
export const RESULT_ACCEPTED_TEXT = 'Ваш результат прийнято замовником! Оплату нараховано';

export const resultAcceptedPayload = (task: { id: string; title: string }): ResultAcceptedPayload => ({
  taskId: task.id,
  taskTitle: task.title,
});

/** US-48 sc.1 [AC]: «Студент надіслав результат за завданням «[Назва]» на перевірку». The title replaces the placeholder. */
export const resultSubmittedText = (taskTitle: string): string => `Студент надіслав результат за завданням «${taskTitle}» на перевірку`;

export const resultSubmittedPayload = (task: { id: string; title: string }): ResultSubmittedPayload => ({
  taskId: task.id,
  taskTitle: task.title,
});

/** US-21 sc.1 [AC]: «Вас обрано виконавцем завдання [Назва]». The title replaces the placeholder. */
export const executorSelectedText = (taskTitle: string): string => `Вас обрано виконавцем завдання ${taskTitle}`;

export const executorSelectedPayload = (task: { id: string; title: string }): ExecutorSelectedPayload => ({
  taskId: task.id,
  taskTitle: task.title,
});

/** US-39 (A-15): the student's document was approved. A fixed text; the badge is already on the profile in the same transaction. */
export const VERIFICATION_APPROVED_TEXT = 'Вашу верифікацію підтверджено. На профілі є позначка «Верифікований студент»';

/** US-39 sc.2: the reason of the moderator is part of the text, so the student reads why. */
export const verificationRejectedText = (reason: string): string => `Вашу верифікацію відхилено. Причина: ${reason}. Ви можете завантажити новий документ`;

export const verificationRejectedPayload = (reason: string): VerificationRejectedPayload => ({ reason });

/** The stored payload as an object, or null if it is not valid JSON of the expected shape. */
export function parsePayload(payloadJson: string): unknown {
  try {
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

/** The text the student reads, built from the type and the payload. Other types get a neutral text until their stories are built. */
export function notificationText(type: string, payload: unknown): string {
  if (type === 'executor_selected') {
    const parsed = executorSelectedPayloadSchema.safeParse(payload);
    if (parsed.success) return executorSelectedText(parsed.data.taskTitle);
  }
  if (type === 'result_submitted') {
    const parsed = resultSubmittedPayloadSchema.safeParse(payload);
    if (parsed.success) return resultSubmittedText(parsed.data.taskTitle);
  }
  if (type === 'result_accepted') {
    return resultAcceptedPayloadSchema.safeParse(payload).success ? RESULT_ACCEPTED_TEXT : 'Нове сповіщення';
  }
  if (type === 'result_returned') {
    const parsed = resultReturnedPayloadSchema.safeParse(payload);
    if (parsed.success) return resultReturnedText(parsed.data.taskTitle);
  }
  if (type === 'verification_approved') {
    return verificationApprovedPayloadSchema.safeParse(payload).success ? VERIFICATION_APPROVED_TEXT : 'Нове сповіщення';
  }
  if (type === 'verification_rejected') {
    const parsed = verificationRejectedPayloadSchema.safeParse(payload);
    if (parsed.success) return verificationRejectedText(parsed.data.reason);
  }
  return 'Нове сповіщення';
}

/**
 * US-21 sc.3. Every unread row first, then the read rows that are not already in the list. The two lists are read in
 * separate queries, so a notification marked read in between would be in both: it is kept once, in its unread place.
 */
export function mergeUnreadFirst<T extends { id: string }>(unread: T[], read: T[]): T[] {
  const seen = new Set(unread.map((row) => row.id));
  return [...unread, ...read.filter((row) => !seen.has(row.id))];
}
