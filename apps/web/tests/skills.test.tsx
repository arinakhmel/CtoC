import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

let savedSkills: string[];
let meResponse: () => Response;
let putResponse: (skills: string[]) => Response;
let puts: unknown[];

beforeEach(() => {
  savedSkills = [];
  puts = [];
  meResponse = () => json({ user: { id: 'u1', role: 'student', displayName: 'Олена', emailConfirmed: true, studentVerified: false } });
  putResponse = (skills) => json({ skills: [...skills].sort() });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/me') return meResponse();
      if (url === '/api/profiles/u1') return json({ profile: { id: 'u1', displayName: 'Олена', verified: false, skills: savedSkills } });
      if (url.startsWith('/api/skills')) return json({ skills: ['Java', 'HTML', 'Копірайтинг'] });
      if (url === '/api/me/skills' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { skills: string[] };
        puts.push(body);
        return putResponse(body.skills);
      }
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const openEditor = async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createTestRouter(['/me/profile'])} future={providerFuture} />);
  await screen.findByLabelText('Навичка');
  return user;
};
const addSkill = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.type(screen.getByLabelText('Навичка'), name);
  await user.click(screen.getByRole('button', { name: 'Додати' }));
};
const listed = () => within(screen.getByRole('list', { name: 'Ваші навички' })).queryAllByRole('listitem').map((li) => li.textContent?.replace('Видалити', '').trim());

describe('/me/profile skills editor (US-10)', () => {
  it('US-10 sc.1 the student adds skills, saves them, and gets a link to the public profile', async () => {
    const user = await openEditor();

    await addSkill(user, 'Java');
    await addSkill(user, 'HTML');
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }));

    expect(await screen.findByText(/Зміни збережено/)).toBeInTheDocument();
    expect(puts).toEqual([{ skills: ['Java', 'HTML'] }]);
    expect(screen.getByRole('link', { name: 'Мій публічний профіль' })).toHaveAttribute('href', '/u/u1');
    expect(listed()).toEqual(['HTML', 'Java']);
  });

  it('US-10 sc.1 saved skills are loaded, can be removed, and the catalogue is offered as suggestions', async () => {
    savedSkills = ['Java', 'Python'];
    const user = await openEditor();

    expect(listed()).toEqual(['Java', 'Python']);
    expect(Array.from(document.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'))).toEqual(['Java', 'HTML', 'Копірайтинг']);

    await user.click(screen.getByRole('button', { name: 'Видалити навичку Java' }));
    expect(listed()).toEqual(['Python']);
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }));
    expect(puts).toEqual([{ skills: ['Python'] }]);
  });

  it('US-10 sc.1 Enter adds a skill and does not save the form; a duplicate in another case is not added twice', async () => {
    const user = await openEditor();

    await user.type(screen.getByLabelText('Навичка'), 'Java{Enter}');
    await user.type(screen.getByLabelText('Навичка'), 'java{Enter}');

    expect(listed()).toEqual(['Java']);
    expect(puts).toHaveLength(0);
  });

  it.each([
    ['ROLE_FORBIDDEN', 403, 'Доступ заборонено'],
    ['EMAIL_NOT_CONFIRMED', 403, 'Спершу підтвердіть пошту'],
    ['SKILLS_LIMIT', 400, 'Досягнуто ліміту навичок (20)'],
    ['VALIDATION_FAILED', 400, 'Перевірте правильність заповнення полів'],
  ])('US-10 sc.1 the API code %s is shown by its Ukrainian text', async (code, status, text) => {
    putResponse = () => apiError(code, status);
    const user = await openEditor();

    await addSkill(user, 'Java');
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }));

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/Зміни збережено/)).toBeNull();
  });

  it('US-10 sc.1 without a session the page shows the login prompt', async () => {
    meResponse = () => apiError('AUTH_REQUIRED', 401);
    render(<RouterProvider router={createTestRouter(['/me/profile'])} future={providerFuture} />);

    expect(await screen.findByText(/Увійдіть, щоб продовжити/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Увійти' })).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText('Навичка')).toBeNull();
  });

  it.each([[''], ['   ']])('US-10 sc.2 adding the empty skill %j adds nothing and shows a warning', async (empty) => {
    const user = await openEditor();

    if (empty) await user.type(screen.getByLabelText('Навичка'), empty);
    await user.click(screen.getByRole('button', { name: 'Додати' }));

    expect(await screen.findByText('Навичка не може бути порожньою')).toBeInTheDocument();
    expect(listed()).toEqual([]);
  });

  it('US-10 sc.3 the 21st skill is blocked with the limit message and the list stays at 20', async () => {
    savedSkills = Array.from({ length: 20 }, (_, i) => `Навичка ${i + 1}`);
    const user = await openEditor();
    expect(listed()).toHaveLength(20);

    await addSkill(user, 'Ще одна');

    expect(await screen.findByText('Досягнуто ліміту навичок (20)')).toBeInTheDocument();
    expect(listed()).toHaveLength(20);
    expect(screen.getByText('20 з 20')).toBeInTheDocument();
  });

  it('US-10 sc.3 the 20th skill is still accepted', async () => {
    savedSkills = Array.from({ length: 19 }, (_, i) => `Навичка ${i + 1}`);
    const user = await openEditor();

    await addSkill(user, 'Двадцята');

    expect(listed()).toHaveLength(20);
    expect(screen.queryByText('Досягнуто ліміту навичок (20)')).toBeNull();
  });
});

describe('/u/:userId skills (US-10)', () => {
  it('US-10 sc.1 the public profile lists the saved skills, and has no skills section when there are none', async () => {
    savedSkills = ['HTML', 'Java'];
    const first = render(<RouterProvider router={createTestRouter(['/u/u1'])} future={providerFuture} />);
    const section = within((await screen.findByRole('heading', { level: 2, name: 'Навички' })).closest('section')!);
    expect(section.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['HTML', 'Java']);
    first.unmount();

    savedSkills = [];
    render(<RouterProvider router={createTestRouter(['/u/u1'])} future={providerFuture} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Олена' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Навички' })).toBeNull();
  });
});
