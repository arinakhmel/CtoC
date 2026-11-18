import { describe, expect, it } from 'vitest';
import { executorSelectedPayloadSchema, LIMITS, notificationsQuerySchema, resultAcceptedPayloadSchema, resultSubmittedPayloadSchema } from '../src';

describe('US-21 notification schemas', () => {
  it('US-21 the list query defaults to the page size and accepts after', () => {
    expect(notificationsQuerySchema.parse({})).toEqual({ limit: LIMITS.notificationsPage.default });
    expect(notificationsQuerySchema.parse({ after: 'n-1', limit: '5' })).toEqual({ after: 'n-1', limit: 5 });
  });

  it('US-21 a limit of 0 or over the maximum is rejected', () => {
    expect(notificationsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(notificationsQuerySchema.safeParse({ limit: String(LIMITS.notificationsPage.max + 1) }).success).toBe(false);
  });

  it('US-21 the executor_selected payload needs a task id and a title', () => {
    expect(executorSelectedPayloadSchema.safeParse({ taskId: 't1', taskTitle: 'Назва' }).success).toBe(true);
    expect(executorSelectedPayloadSchema.safeParse({ taskId: 't1' }).success).toBe(false);
  });
});

describe('US-48 notification schema', () => {
  it('US-48 the result_submitted payload needs a task id and a title', () => {
    expect(resultSubmittedPayloadSchema.safeParse({ taskId: 't1', taskTitle: 'Парсер сайту' }).success).toBe(true);
    expect(resultSubmittedPayloadSchema.safeParse({ taskId: 't1' }).success).toBe(false);
    expect(resultSubmittedPayloadSchema.safeParse({ taskTitle: 'Парсер сайту' }).success).toBe(false);
  });
});

describe('US-30 notification schema', () => {
  it('US-30 the result_accepted payload needs a task id and a title', () => {
    expect(resultAcceptedPayloadSchema.safeParse({ taskId: 't1', taskTitle: 'Парсер сайту' }).success).toBe(true);
    expect(resultAcceptedPayloadSchema.safeParse({ taskId: 't1' }).success).toBe(false);
    expect(resultAcceptedPayloadSchema.safeParse({ taskTitle: 'Парсер сайту' }).success).toBe(false);
  });
});
