import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

let savedBio: string;
let putResponse: (bio: string) => Response;
let bioPuts: Array<{ bio: string }>;
let skillPuts: number;

beforeEach(() => {
  savedBio = '';
  bioPuts = [];
  skillPuts = 0;
  putResponse = (bio) => json({ bio });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/me') return json({ user: { id: 'u1', role: 'student', displayName: 'Олена', emailConfirmed: true, studentVerified: false } });
      if (url === '/api/profiles/u1') return json({ profile: { id: 'u1', displayName: 'Олена', verified: false, skills: [], bio: savedBio } });
      if (url.startsWith('/api/skills')) return json({ skills: [] });
      if (url === '/api/me/profile' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { bio: string };
        bioPuts.push(body);
        return putResponse(body.bio);
      }
      if (url === '/api/me/skills' && init?.method === 'PUT') {
        skillPuts += 1;
        return json({ skills: [] });
      }
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const openEditor = async () => {
  render(<RouterProvider router={createTestRouter(['/me/profile'])} future={providerFuture} />);
  return screen.findByLabelText('Про мене');
};
const typeBio = (textarea: HTMLElement, text: string) => fireEvent.change(textarea, { target: { value: text } });
const save = () => userEvent.setup().click(screen.getByRole('button', { name: 'Зберегти' }));

describe('/me/profile «Про мене» form (US-11)', () => {
  it('US-11 sc.1 the student saves the text and is told it is saved, without touching the skills', async () => {
    const textarea = await openEditor();

    typeBio(textarea, 'Студент 2 курсу, люблю frontend.');
    await save();

    expect(await screen.findByText('Зміни збережено.')).toBeInTheDocument();
    expect(bioPuts).toEqual([{ bio: 'Студент 2 курсу, люблю frontend.' }]);
    expect(skillPuts).toBe(0);
  });

  it('US-11 sc.1 the saved text is loaded into the field and the counter shows its length', async () => {
    savedBio = 'Привіт!';

    const textarea = await openEditor();

    expect(textarea).toHaveValue('Привіт!');
    expect(screen.getByText('7 / 500')).toBeInTheDocument();
  });

  it('US-11 sc.1 the saved text is shown to everyone on the public profile, with line breaks kept', async () => {
    savedBio = 'Перший рядок\nДругий рядок 💻';
    render(<RouterProvider router={createTestRouter(['/u/u1'])} future={providerFuture} />);

    const heading = await screen.findByRole('heading', { level: 2, name: 'Про мене' });
    const text = heading.closest('section')!.querySelector('.bio')!;
    expect(text.textContent).toBe('Перший рядок\nДругий рядок 💻');
  });

  it('US-11 sc.1 a profile without a text has no «Про мене» section', async () => {
    render(<RouterProvider router={createTestRouter(['/u/u1'])} future={providerFuture} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Олена' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Про мене' })).toBeNull();
  });

  it('US-11 sc.2 over 500 characters the error and counter show at once and nothing is sent', async () => {
    const textarea = await openEditor();

    typeBio(textarea, 'а'.repeat(501));
    await save();

    expect(await screen.findByText('Текст «Про мене» перевищує 500 символів')).toBeInTheDocument();
    expect(screen.getByText('501 / 500')).toBeInTheDocument();
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveValue('а'.repeat(501)); // the text is not cut off
    expect(bioPuts).toHaveLength(0);
  });

  it('US-11 sc.2 exactly 500 characters are accepted', async () => {
    const textarea = await openEditor();

    typeBio(textarea, 'а'.repeat(500));
    await save();

    expect(await screen.findByText('Зміни збережено.')).toBeInTheDocument();
    expect(bioPuts).toHaveLength(1);
  });

  it.each([
    ['BIO_TOO_LONG', 400, 'Текст «Про мене» перевищує 500 символів'],
    ['VALIDATION_FAILED', 400, 'Перевірте правильність заповнення полів'],
    ['ROLE_FORBIDDEN', 403, 'Доступ заборонено'],
    ['EMAIL_NOT_CONFIRMED', 403, 'Спершу підтвердіть пошту'],
  ])('US-11 sc.2 the API code %s is shown by its Ukrainian text and the success note stays hidden', async (code, status, text) => {
    putResponse = () => apiError(code, status);
    const textarea = await openEditor();

    typeBio(textarea, 'Текст');
    await save();

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText('Зміни збережено.')).toBeNull();
  });

  it('US-11 sc.3 emoji and punctuation are sent unchanged, and the counter counts characters, not UTF-16 units', async () => {
    const textarea = await openEditor();
    const text = 'Люблю код 💻, дизайн 🎨 і каву ☕! «лапки» 👨‍👩‍👧';

    typeBio(textarea, text);
    expect(screen.getByText(`${Array.from(text).length} / 500`)).toBeInTheDocument();
    await save();

    expect(await screen.findByText('Зміни збережено.')).toBeInTheDocument();
    expect(bioPuts).toEqual([{ bio: text }]);
  });

  it('US-11 sc.3 500 emoji (1000 UTF-16 units) are accepted and 501 are blocked', async () => {
    const textarea = await openEditor();

    typeBio(textarea, '💻'.repeat(500));
    expect(screen.getByText('500 / 500')).toBeInTheDocument();
    expect(screen.queryByText('Текст «Про мене» перевищує 500 символів')).toBeNull();
    await save();
    expect(await screen.findByText('Зміни збережено.')).toBeInTheDocument();

    typeBio(textarea, '💻'.repeat(501));
    expect(screen.getByText('Текст «Про мене» перевищує 500 символів')).toBeInTheDocument();
    await save();
    expect(bioPuts).toHaveLength(1);
  });
});
