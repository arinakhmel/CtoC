import { describe, expect, it } from 'vitest';
import { chatQuerySchema, createMessageSchema, LIMITS } from '../src';
import { codesOf } from './helpers';

describe('US-23 chat schemas', () => {
  it('US-23 sc.1 a message body is kept, trimmed, and unknown keys are stripped', () => {
    expect(createMessageSchema.parse({ body: '  Привіт  ', senderId: 'x', taskId: 'y' })).toEqual({ body: 'Привіт' });
  });

  it('US-23 sc.2 an empty, spaces-only or missing body is MESSAGE_EMPTY', () => {
    for (const input of [{ body: '' }, { body: '   ' }, {}]) {
      expect(codesOf(createMessageSchema, input)).toContain('MESSAGE_EMPTY');
    }
  });

  it('US-23 sc.2 over 2000 characters is MESSAGE_TOO_LONG; exactly 2000 passes', () => {
    expect(codesOf(createMessageSchema, { body: 'а'.repeat(LIMITS.messageMax + 1) })).toContain('MESSAGE_TOO_LONG');
    expect(createMessageSchema.safeParse({ body: 'а'.repeat(LIMITS.messageMax) }).success).toBe(true);
  });

  it('US-23 sc.2 the length is counted in Unicode code points: 2000 emoji pass, 2001 do not', () => {
    const emoji = '💻'; // one code point, two UTF-16 units
    expect(emoji.length).toBe(2);
    expect(createMessageSchema.safeParse({ body: emoji.repeat(LIMITS.messageMax) }).success).toBe(true);
    expect(codesOf(createMessageSchema, { body: emoji.repeat(LIMITS.messageMax + 1) })).toContain('MESSAGE_TOO_LONG');
  });

  it('US-23 an empty body is still only MESSAGE_EMPTY, not also too long', () => {
    expect(codesOf(createMessageSchema, { body: '' })).toEqual(['MESSAGE_EMPTY']);
  });

  it('US-23 the poll query accepts an optional after and rejects an empty one', () => {
    expect(chatQuerySchema.parse({})).toEqual({});
    expect(chatQuerySchema.parse({ after: 'm-1' })).toEqual({ after: 'm-1' });
    expect(chatQuerySchema.safeParse({ after: '' }).success).toBe(false);
  });
});
