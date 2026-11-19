import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

/**
 * US-37 and US-38 in the browser: the section «Досвід / Резюме» on the public profile `/u/:userId` and on the student's own
 * `/me/profile`. Only `fetch` is mocked; the API side is in apps/api/tests/experience/profile-experience.test.ts.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

interface Record {
  id: string;
  title: string;
  description: string;
  completedAt: string;
  confirmedBy: 'platform';
}
const record = (id: string, title: string, completedAt: string): Record => ({ id, title, description: `Опис: ${title}`, completedAt, confirmedBy: 'platform' });

let experience: Record[];
let skills: string[];

beforeEach(() => {
  experience = [];
  skills = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/me') return json({ user: { id: 'u1', role: 'student', displayName: 'Олена Коваль', emailConfirmed: true, studentVerified: true } });
      if (url === '/api/profiles/u1') return json({ profile: { id: 'u1', displayName: 'Олена Коваль', verified: true, skills, bio: '', experience } });
      if (url === '/api/me/skills' && init?.method === 'PUT') {
        skills = (JSON.parse(String(init.body)) as { skills: string[] }).skills;
        return json({ skills });
      }
      if (url.startsWith('/api/skills')) return json({ skills: [] });
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const openAt = (path: string) => render(<RouterProvider router={createTestRouter([path])} future={providerFuture} />);

describe('/u/:userId: «Досвід / Резюме» (US-37, US-38)', () => {
  it('US-37 sc.1 a finished task appears with its title, description and completion date', async () => {
    experience = [record('x1', 'Логотип для кав’ярні', '2026-11-18T10:00:00Z')];
    openAt('/u/u1');

    const card = await screen.findByRole('article', { name: 'Логотип для кав’ярні' });
    expect(within(card).getByText('Опис: Логотип для кав’ярні')).toBeInTheDocument();
    expect(within(card).getByText('18.11.2026')).toHaveAttribute('datetime', '2026-11-18T10:00:00Z');
    expect(screen.getByRole('heading', { level: 2, name: 'Досвід / Резюме' })).toBeInTheDocument();
  });

  it('US-37 sc.3 the records are shown in the order of the API, newest first', async () => {
    experience = [record('x3', 'Листопадове завдання', '2026-11-10T10:00:00Z'), record('x1', 'Березневе завдання', '2026-03-10T10:00:00Z')];
    openAt('/u/u1');

    const list = await screen.findByRole('list', { name: 'Досвід / Резюме' });
    const titles = within(list).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(titles).toEqual(['Листопадове завдання', 'Березневе завдання']);
  });

  it('US-38 sc.1 every record carries «Підтверджено платформою CtoC»', async () => {
    experience = [record('x2', 'Друге', '2026-11-10T10:00:00Z'), record('x1', 'Перше', '2026-03-10T10:00:00Z')];
    openAt('/u/u1');

    const items = within(await screen.findByRole('list', { name: 'Досвід / Резюме' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const item of items) expect(within(item).getByText('Підтверджено платформою CtoC')).toBeInTheDocument();
  });

  it('US-37 a student with no finished task sees that records appear automatically', async () => {
    openAt('/u/u1');
    expect(await screen.findByText(/Записи з’являються автоматично, коли замовник приймає результат/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Досвід / Резюме' })).not.toBeInTheDocument();
  });

  it('US-38 sc.2 the public profile has no control to add, edit or delete experience', async () => {
    experience = [record('x1', 'Логотип для кав’ярні', '2026-11-18T10:00:00Z')];
    openAt('/u/u1');
    const section = (await screen.findByRole('heading', { level: 2, name: 'Досвід / Резюме' })).closest('section')!;
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('/me/profile: the student’s own experience is read only (US-38)', () => {
  it('US-38 sc.2 the profile settings have no «Додати досвід» and no field for experience, only the confirmed records', async () => {
    experience = [record('x1', 'Логотип для кав’ярні', '2026-11-18T10:00:00Z')];
    openAt('/me/profile');

    const section = (await screen.findByRole('heading', { level: 2, name: 'Досвід / Резюме' })).closest('section')!;
    expect(within(section).getByText('Підтверджено платформою CtoC')).toBeInTheDocument();
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /досвід/i })).not.toBeInTheDocument();
  });

  it('US-38 sc.2 with no records the settings say they cannot be added by hand', async () => {
    openAt('/me/profile');
    expect(await screen.findByText(/Додати їх вручну не можна/)).toBeInTheDocument();
  });

  it('US-38 sc.3 after the student saves new skills, the record and its mark are still shown unchanged', async () => {
    experience = [record('x1', 'Логотип для кав’ярні', '2026-11-18T10:00:00Z')];
    const user = userEvent.setup();
    openAt('/me/profile');

    await user.type(await screen.findByLabelText('Навичка'), 'Java');
    await user.click(screen.getByRole('button', { name: 'Додати' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }));
    expect(await screen.findByText(/Зміни збережено/)).toBeInTheDocument();

    const card = screen.getByRole('article', { name: 'Логотип для кав’ярні' });
    expect(within(card).getByText('Підтверджено платформою CtoC')).toBeInTheDocument();
    expect(within(card).getByText('18.11.2026')).toBeInTheDocument();
  });
});
