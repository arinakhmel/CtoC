import { expect } from 'vitest';
import { screen } from '@testing-library/react';

/** Words of an auction or of price competition (US-42 sc.3). */
export const BID_WORDS = /ставк|торг|запропонувати ціну|аукціон/i;
const PRICE_LABEL = /ціна|ставка|пропоную|бюджет|price|budget|bid/i;

/**
 * The student sees no way to offer a price: no number field, no field named after a price,
 * no auction wording in the visible text, accessible names or placeholders (US-13 sc.1/sc.3, US-42 sc.1/sc.3).
 * `allowNote`: the note block of US-19 is open, so its single textarea is allowed.
 */
export function expectNoBidControls({ allowNote = false } = {}) {
  const textboxes = screen.queryAllByRole('textbox');
  if (allowNote) {
    expect(textboxes.map((el) => el.tagName)).toEqual(['TEXTAREA']);
  } else {
    expect(textboxes).toHaveLength(0);
  }
  expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  expect(document.querySelector('input[type="number"]')).toBeNull();
  expect(screen.queryAllByLabelText(PRICE_LABEL).filter((el) => el.getAttribute('type') !== 'hidden' && !(allowNote && el.tagName === 'TEXTAREA'))).toHaveLength(0);
  expect(screen.queryAllByPlaceholderText(BID_WORDS)).toHaveLength(0);
  expect(screen.queryAllByRole('button', { name: BID_WORDS })).toHaveLength(0);
  expect(screen.queryAllByRole('link', { name: BID_WORDS })).toHaveLength(0);
  expect(screen.queryAllByLabelText(BID_WORDS)).toHaveLength(0);
  expect(screen.queryAllByText(BID_WORDS)).toHaveLength(0);
}
