import { render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

/**
 * US-04: the public page /payment-safety «Оплата та безпека». A visitor has no session: `/api/me` answers 401, and the page must
 * still open. sc.3 (the narrow screen) needs a real layout, so it is a Playwright check in e2e/payment-safety.spec.ts.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url === '/api/me' ? json({ error: { code: 'AUTH_REQUIRED', message: 'x' } }, 401) : json({ status: 'ok' }))),
  );
});

const open = async () => {
  render(<RouterProvider router={createTestRouter(['/payment-safety'])} future={providerFuture} />);
  return within(await screen.findByRole('main'));
};
const pageText = async () => (await open()).getByRole('article').textContent ?? '';

describe('/payment-safety the public page (US-04 sc.1)', () => {
  it('US-04 sc.1 a visitor without a session sees the page, not the login form', async () => {
    const main = await open();

    expect(await main.findByRole('heading', { level: 1, name: 'Оплата та безпека' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Вхід' })).toBeNull();
    expect(screen.queryByText('Увійдіть, щоб продовжити')).toBeNull();
  });

  it('US-04 sc.1 the deal is one numbered list of four stages: reserve, work, review, payout, in this order', async () => {
    const main = await open();

    const stages = main.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(stages).toEqual(['Резервування коштів замовником', 'Виконання завдання', 'Перевірка результату', 'Виплата на картку']);
    expect(main.getByRole('heading', { level: 2, name: 'Як проходить угода' })).toBeInTheDocument();
    const ordered = main.getAllByRole('list').filter((el) => el.tagName === 'OL');
    expect(ordered).toHaveLength(1);
    expect(within(ordered[0]!).getAllByRole('listitem')).toHaveLength(4);
  });

  it('US-04 sc.1 every stage has a text, and the review stage names both results: accept or return', async () => {
    const main = await open();

    for (const item of within(main.getAllByRole('list').find((el) => el.tagName === 'OL')!).getAllByRole('listitem')) {
      expect(item.querySelector('p')?.textContent?.trim()).toBeTruthy();
    }
    const review = main.getByRole('heading', { level: 3, name: 'Перевірка результату' }).closest('li')!;
    expect(review).toHaveTextContent(/приймає/);
    expect(review).toHaveTextContent(/повертає на доопрацювання/);
  });

  it('US-04 sc.1 the page links to the terms with the commission, without repeating the number', async () => {
    const main = await open();

    expect(main.getByRole('link', { name: /Умови та поточна комісія/ })).toHaveAttribute('href', '/terms');
    expect(main.getByRole('article').textContent).not.toMatch(/\d\s?%/);
  });
});

describe('/payment-safety the key guarantees (US-04 sc.2)', () => {
  it('US-04 sc.2 the page names both key guarantees in words: «резервування» and «виплата на картку»', async () => {
    const text = (await pageText()).toLowerCase();

    expect(text).toContain('резервування');
    expect(text).toContain('виплата на картку');
  });

  it('US-04 sc.2 the page says the customer reserves the money before the work starts', async () => {
    const text = await pageText();

    expect(text).toMatch(/резервує/);
    expect(text).toMatch(/до початку роботи/);
  });

  it('US-04 sc.2 the page says the payout goes to a card after the customer confirms the result', async () => {
    const text = await pageText();

    expect(text).toMatch(/на картку/);
    expect(text).toMatch(/підтвердження результату/);
  });

  it('US-04 sc.2 the guarantees are also a list of their own, so they are found without reading the stages', async () => {
    const main = await open();

    const guarantees = within(main.getByRole('heading', { level: 2, name: 'Що це означає для вас' }).closest('section')!);
    const items = guarantees.getAllByRole('listitem').map((li) => li.textContent);
    expect(items.some((t) => /резервує кошти до початку роботи/.test(t ?? ''))).toBe(true);
    expect(items.some((t) => /Виплата на картку/.test(t ?? ''))).toBe(true);
  });

  it('US-04 sc.2 the page promises nothing it does not do: no instant payout, and the demo note is there (OQ-48)', async () => {
    const text = await pageText();

    expect(text).not.toMatch(/миттєв|одразу на картку/i);
    expect(text).toMatch(/демонстраційн/);
    expect(text).toMatch(/модератор вручну/);
  });
});
