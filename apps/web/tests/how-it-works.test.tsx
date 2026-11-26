import { render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';
import { HowItWorks } from '../src/features/landing/components/HowItWorks';
import { HOW_IT_WORKS_STEPS, normalizeSteps, type HowItWorksStep } from '../src/features/landing/steps';

/**
 * US-02: the «Як це працює» block on `/`. The content is static (A-23, OQ-16, W-11), so sc.2 and sc.3 are guards of the component:
 * a wrong number of steps and an empty text never reach the page. Only `fetch` is mocked (the layout asks the API for its status).
 */

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })));
});

const step = (n: number, overrides: Partial<HowItWorksStep> = {}): HowItWorksStep => ({
  id: `own-${n}`,
  icon: '⭐',
  title: `Крок ${n}`,
  description: `Опис кроку ${n}`,
  ...overrides,
});
const steps = (count: number) => Array.from({ length: count }, (_, i) => step(i + 1));
const listItems = () => within(screen.getByRole('list')).getAllByRole('listitem');

describe('/ the «Як це працює» block (US-02 sc.1)', () => {
  it('US-02 sc.1 the landing page has the block with one numbered list of 3 or 4 steps from sign-up to the task', async () => {
    render(<RouterProvider router={createTestRouter(['/'])} future={providerFuture} />);

    const block = within(await screen.findByRole('region', { name: 'Як це працює' }));
    const list = block.getByRole('list');
    expect(list.tagName).toBe('OL');
    const items = block.getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(4);
    expect(items[0]).toHaveTextContent('Зареєструйтесь');
    expect(items.at(-1)).toHaveTextContent('Отримайте оплату');
  });

  it('US-02 sc.1 every step has an icon that is hidden from a screen reader, a title and a description', () => {
    render(<HowItWorks />);

    for (const item of listItems()) {
      expect(item.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBeTruthy();
      expect(item.querySelector('strong')?.textContent?.trim()).toBeTruthy();
      expect(item.querySelector('p')?.textContent?.trim()).toBeTruthy();
    }
  });

  it('US-02 sc.1 the default steps are 3 or 4, each with a title and a description (guards an edit of the text)', () => {
    expect(HOW_IT_WORKS_STEPS.length).toBeGreaterThanOrEqual(3);
    expect(HOW_IT_WORKS_STEPS.length).toBeLessThanOrEqual(4);
    for (const s of HOW_IT_WORKS_STEPS) {
      expect(s.title.trim()).not.toBe('');
      expect(s.description.trim()).not.toBe('');
    }
  });

  it('US-02 sc.1 3 and 4 steps given by the caller are shown as they are, in order', () => {
    for (const count of [3, 4]) {
      const { unmount } = render(<HowItWorks steps={steps(count)} />);
      expect(listItems().map((li) => li.querySelector('strong')?.textContent)).toEqual(steps(count).map((s) => s.title));
      unmount();
    }
  });
});

describe('US-02 sc.2 a wrong number of steps gives the default structure', () => {
  it.each([[0], [1], [2], [5], [8]])('US-02 sc.2 %i steps → the default steps, not the given ones', (count) => {
    render(<HowItWorks steps={steps(count)} />);

    expect(listItems().map((li) => li.querySelector('strong')?.textContent)).toEqual(HOW_IT_WORKS_STEPS.map((s) => s.title));
    expect(screen.queryByText('Крок 1')).toBeNull();
  });

  it('US-02 sc.2 nothing or null given → the default steps', () => {
    expect(normalizeSteps(undefined)).toBe(HOW_IT_WORKS_STEPS);
    expect(normalizeSteps(null)).toBe(HOW_IT_WORKS_STEPS);
    expect(normalizeSteps([])).toBe(HOW_IT_WORKS_STEPS);
  });
});

describe('US-02 sc.3 a step with no text', () => {
  it('US-02 sc.3 an empty or blank description of a known step is replaced by the template description', () => {
    const given = [
      { ...HOW_IT_WORKS_STEPS[0]!, description: '' },
      { ...HOW_IT_WORKS_STEPS[1]!, description: '   ' },
      { ...HOW_IT_WORKS_STEPS[2]!, description: undefined },
    ];

    const result = normalizeSteps(given);

    expect(result).toHaveLength(3);
    expect(result.map((s) => s.description)).toEqual(HOW_IT_WORKS_STEPS.slice(0, 3).map((s) => s.description));
  });

  it('US-02 sc.3 a step of our own with no description has no template, so it is hidden, and the rest is kept', () => {
    render(<HowItWorks steps={[...steps(3), step(4, { description: '' })]} />);

    expect(listItems()).toHaveLength(3);
    expect(screen.queryByText('Крок 4')).toBeNull();
  });

  it('US-02 sc.3 hiding leaves fewer than 3 steps → the default structure (sc.2 applies after sc.3)', () => {
    render(<HowItWorks steps={[step(1), step(2), step(3, { description: ' ' })]} />);

    expect(listItems().map((li) => li.querySelector('strong')?.textContent)).toEqual(HOW_IT_WORKS_STEPS.map((s) => s.title));
  });

  it('US-02 sc.3 a step with no title and no template is hidden as well', () => {
    expect(normalizeSteps([...steps(3), step(4, { title: '' })])).toHaveLength(3);
  });

  it('US-02 sc.3 there is no empty element in the list, whatever is given', () => {
    render(<HowItWorks steps={[step(1), step(2, { description: '' }), step(3), step(4, { title: '  ' })]} />);

    for (const el of screen.getByRole('list').querySelectorAll('li, strong, p')) {
      expect(el.textContent?.trim()).not.toBe('');
    }
  });

  it('US-02 sc.3 a text that looks like markup is shown as text, not as markup', () => {
    render(<HowItWorks steps={[step(1, { title: '<b>x</b>' }), step(2), step(3)]} />);

    expect(screen.getByText('<b>x</b>')).toBeInTheDocument();
    expect(screen.getByRole('list').querySelector('b')).toBeNull();
  });
});
