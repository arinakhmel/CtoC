import { executorSelectedPayloadSchema, type ExecutorSelectedPayload } from '@ctoc/shared';

/** US-21 sc.1 [AC]: «Вас обрано виконавцем завдання [Назва]». The title replaces the placeholder. */
export const executorSelectedText = (taskTitle: string): string => `Вас обрано виконавцем завдання ${taskTitle}`;

export const executorSelectedPayload = (task: { id: string; title: string }): ExecutorSelectedPayload => ({
  taskId: task.id,
  taskTitle: task.title,
});

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
  return 'Нове сповіщення';
}
