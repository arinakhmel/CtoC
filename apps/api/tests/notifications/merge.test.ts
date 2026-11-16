import { describe, expect, it } from 'vitest';
import { mergeUnreadFirst } from '../../src/modules/notifications/domain';

describe('Notification list merge: US-21', () => {
  it('US-21 sc.3 unread rows come first, then the read ones', () => {
    const merged = mergeUnreadFirst([{ id: 'n-3' }, { id: 'n-1' }], [{ id: 'n-4' }, { id: 'n-2' }]);
    expect(merged.map((row) => row.id)).toEqual(['n-3', 'n-1', 'n-4', 'n-2']);
  });

  it('US-21 sc.3 a notification marked read between the two queries is listed once, in its unread place', () => {
    const merged = mergeUnreadFirst([{ id: 'n-3' }, { id: 'n-1' }], [{ id: 'n-3' }, { id: 'n-2' }]);
    expect(merged.map((row) => row.id)).toEqual(['n-3', 'n-1', 'n-2']);
  });

  it('US-21 sc.3 empty lists merge to an empty list', () => {
    expect(mergeUnreadFirst([], [])).toEqual([]);
  });
});
