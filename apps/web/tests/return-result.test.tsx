import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const file = (id: string, name: string) => ({ id, name, mime: 'application/pdf', sizeBytes: 2048, createdAt: '2026-11-12T10:00:00.000Z' });
const result = (status: string, comment: string | null, lastReturn: { version: number; comment: string; returnedAt: string | null } | null = null) => ({
  result: { version: 1, status, revisionComment: comment, submittedAt: '2026-11-13T10:00:00.000Z', lastReturn, files: [file('f1', 'logo.pdf')] },
});
const COMMENT = 'Додайте висновки та виправте шапку';
const LIMIT_TEXT = 'Коментар перевищує допустиму довжину';
const REQUIRED_TEXT = "Коментар до доопрацювання є обов'язковим";

let taskStatus: string;
let current: { result: unknown };
let returnAnswer: (body: { comment: string }) => Response | Promise<Response>;
let returns: { comment: string }[];

beforeEach(() => {
  taskStatus = 'in_review';
  current = result('submitted', null);
  returns = [];
  returnAnswer = ({ comment }) => {
    taskStatus = 'revision';
    current = result('returned', comment, { version: 1, comment, returnedAt: '2026-11-14T10:00:00.000Z' });
    return json({ task: { id: 't1', status: 'revision' }, ...current });
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/tasks/t1/applications') {
        return json({
          task: { id: 't1', title: 'Логотип для кав’ярні', status: taskStatus, priceKopecks: 50_000, deadlineAt: '2030-05-20T15:30:00.000Z', hasExecutor: true },
          applications: [],
        });
      }
      if (url === '/api/tasks/t1/return' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { comment: string };
        returns.push(body);
        return returnAnswer(body);
      }
      if (url === '/api/tasks/t1/result') return json(current);
      if (url === '/api/tasks/t1/messages') return json({ messages: [] });
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const openPage = () => render(<RouterProvider router={createTestRouter(['/c/tasks/t1'])} future={providerFuture} />);
const returnButton = () => screen.findByRole('button', { name: 'На доопрацювання' });
const openForm = async () => {
  await userEvent.click(await returnButton());
  return screen.findByRole('textbox', { name: 'Коментар до доопрацювання' });
};
/** The send button of the return form. The chat of the same page has its own «Надіслати», so the search is scoped to the form. */
const sendButton = () => within(screen.getByRole('form', { name: 'Повернення на доопрацювання' })).getByRole('button', { name: 'Надіслати' });
const type = async (box: HTMLElement, text: string) => {
  await userEvent.click(box);
  await userEvent.paste(text); // a long text is pasted, not typed key by key
};

describe('/c/tasks/:id «На доопрацювання» (US-32 sc.1)', () => {
  it('US-32 sc.1 a task in review has «На доопрацювання» next to «Прийняти результат»', async () => {
    openPage();

    expect(await returnButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Прийняти результат' })).toBeEnabled();
  });

  it('US-32 sc.1 pressing it opens the form with the counter «0 / 2000», «Надіслати» and «Скасувати»; nothing is sent, and accept is out of the way', async () => {
    openPage();

    const box = await openForm();

    expect(box).toHaveValue('');
    expect(screen.getByLabelText('Кількість символів')).toHaveTextContent('0 / 2000');
    expect(sendButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Скасувати' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Прийняти результат' })).not.toBeInTheDocument();
    expect(returns).toHaveLength(0);
  });

  it('US-33 sc.1 a comment and «Надіслати»: one request with that comment, then the status «На доопрацюванні», the message, no buttons, and the comment stays on the page', async () => {
    openPage();
    const box = await openForm();
    await type(box, COMMENT);
    expect(screen.getByLabelText('Кількість символів')).toHaveTextContent(`${COMMENT.length} / 2000`);

    await userEvent.click(sendButton());

    expect(await screen.findByText(/Результат повернуто студенту/)).toHaveAttribute('role', 'status');
    expect(returns).toEqual([{ comment: COMMENT }]);
    expect(await screen.findByText('На доопрацюванні')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'На доопрацювання' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Прийняти результат' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Повернення на доопрацювання' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Ваш коментар до доопрацювання' })).toBeInTheDocument();
    expect(screen.getByText(COMMENT)).toBeInTheDocument();
  });

  it('«Скасувати» closes the form, forgets the text, sends nothing, and both buttons are back', async () => {
    openPage();
    const box = await openForm();
    await type(box, COMMENT);

    await userEvent.click(screen.getByRole('button', { name: 'Скасувати' }));

    expect(screen.queryByRole('form', { name: 'Повернення на доопрацювання' })).not.toBeInTheDocument();
    expect(returns).toHaveLength(0);
    expect(await returnButton()).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Прийняти результат' })).toBeInTheDocument();
    expect(await openForm()).toHaveValue('');
  });
});

describe('The comment is required (US-32 sc.3, US-33 sc.2)', () => {
  it('US-32 sc.3 / US-33 sc.2 «Надіслати» with an empty comment shows «Коментар до доопрацювання є обов\'язковим» and sends nothing', async () => {
    openPage();
    await openForm();

    await userEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(REQUIRED_TEXT);
    expect(screen.getByRole('textbox', { name: 'Коментар до доопрацювання' })).toHaveAttribute('aria-invalid', 'true');
    expect(returns).toHaveLength(0);
    expect(taskStatusShown('На перевірці')).toBe(true);
  });

  it('only spaces and a line break are the same as empty: the message, and no request', async () => {
    openPage();
    const box = await openForm();
    await type(box, '   \n  ');

    await userEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(REQUIRED_TEXT);
    expect(screen.getByLabelText('Кількість символів')).toHaveTextContent('0 / 2000'); // the spaces are not counted
    expect(returns).toHaveLength(0);
  });

  it('the message goes away when a comment is typed, and then it is sent', async () => {
    openPage();
    const box = await openForm();
    await userEvent.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(REQUIRED_TEXT);

    await type(box, COMMENT);

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await userEvent.click(sendButton());
    await waitFor(() => expect(returns).toHaveLength(1));
  });

  it('if the server still says COMMENT_REQUIRED its text is shown and the form keeps the text', async () => {
    returnAnswer = () => apiError('COMMENT_REQUIRED', 400);
    openPage();
    const box = await openForm();
    await type(box, COMMENT);

    await userEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(REQUIRED_TEXT);
    expect(screen.getByRole('textbox', { name: 'Коментар до доопрацювання' })).toHaveValue(COMMENT);
  });
});

describe('The comment is limited to 2000 characters (US-33 sc.3)', () => {
  it('US-33 sc.3 a comment of exactly 2000 characters has no message and can be sent', async () => {
    openPage();
    const box = await openForm();
    await type(box, 'а'.repeat(2000));

    expect(screen.getByLabelText('Кількість символів')).toHaveTextContent('2000 / 2000');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  it('US-33 sc.3 one more character shows «Коментар перевищує допустиму довжину», «Надіслати» is off, nothing is sent, and the text is not cut', async () => {
    openPage();
    const box = await openForm();
    await type(box, 'а'.repeat(2001));

    expect(await screen.findByRole('alert')).toHaveTextContent(LIMIT_TEXT);
    expect(screen.getByLabelText('Кількість символів')).toHaveTextContent('2001 / 2000');
    expect(sendButton()).toBeDisabled();
    expect((box as HTMLTextAreaElement).value).toHaveLength(2001); // not cut automatically
    await userEvent.click(sendButton());
    expect(returns).toHaveLength(0);
  });

  it('US-33 sc.3 the limit counts the text without the spaces around it: 2000 characters in 2100 are fine', async () => {
    openPage();
    const box = await openForm();
    fireEvent.change(box, { target: { value: `   ${'б'.repeat(2000)}${' '.repeat(97)}` } });

    expect(screen.getByLabelText('Кількість символів')).toHaveTextContent('2000 / 2000');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  it('after the text is cut back to the limit by the customer the message goes and «Надіслати» is on again', async () => {
    openPage();
    const box = await openForm();
    await type(box, 'а'.repeat(2005));
    expect(await screen.findByRole('alert')).toHaveTextContent(LIMIT_TEXT);

    fireEvent.change(box, { target: { value: 'а'.repeat(1990) } });

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(sendButton()).toBeEnabled();
  });

  it('if the server says COMMENT_TOO_LONG its text is shown too', async () => {
    returnAnswer = () => apiError('COMMENT_TOO_LONG', 400);
    openPage();
    const box = await openForm();
    await type(box, COMMENT);

    await userEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(LIMIT_TEXT);
  });
});

describe('Other answers and states', () => {
  it('US-32 sc.2 a deal that is already done: 409 TASK_ALREADY_DONE shows «Угоду вже завершено» and the page shows the real status, with no buttons', async () => {
    returnAnswer = () => {
      taskStatus = 'done'; // accepted in another tab
      return apiError('TASK_ALREADY_DONE', 409);
    };
    openPage();
    const box = await openForm();
    await type(box, COMMENT);

    await userEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Угоду вже завершено');
    expect(await screen.findByText('Виконано')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'На доопрацювання' })).not.toBeInTheDocument());
  });

  it('a 409 TASK_NOT_IN_REVIEW (it was already sent back in another tab) is shown and the page fetches the task again', async () => {
    returnAnswer = () => {
      taskStatus = 'revision';
      current = result('returned', 'Коментар з іншої вкладки', { version: 1, comment: 'Коментар з іншої вкладки', returnedAt: null });
      return apiError('TASK_NOT_IN_REVIEW', 409);
    };
    openPage();
    const box = await openForm();
    await type(box, COMMENT);

    await userEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Немає результату на перевірці');
    expect(await screen.findByText('На доопрацюванні')).toBeInTheDocument();
    expect(await screen.findByText('Коментар з іншої вкладки')).toBeInTheDocument();
  });

  it('a 403 NOT_TASK_OWNER is shown as «Доступ заборонено»', async () => {
    returnAnswer = () => apiError('NOT_TASK_OWNER', 403);
    openPage();
    const box = await openForm();
    await type(box, COMMENT);

    await userEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Доступ заборонено');
  });

  it('a lost connection is shown and the form keeps the text to try again', async () => {
    returnAnswer = () => {
      throw new TypeError('network down');
    };
    openPage();
    const box = await openForm();
    await type(box, COMMENT);

    await userEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Немає зв’язку із сервером');
    expect(screen.getByRole('textbox', { name: 'Коментар до доопрацювання' })).toHaveValue(COMMENT);
  });

  it('a double click on «Надіслати» sends one request: the buttons are off while it runs', async () => {
    let release: (response: Response) => void = () => undefined;
    returnAnswer = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    openPage();
    const box = await openForm();
    await type(box, COMMENT);
    const send = sendButton();

    await userEvent.click(send);
    await waitFor(() => expect(send).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Скасувати' })).toBeDisabled();
    await userEvent.click(send);
    expect(returns).toHaveLength(1);

    taskStatus = 'revision';
    current = result('returned', COMMENT, { version: 1, comment: COMMENT, returnedAt: null });
    release(json({ task: { id: 't1', status: 'revision' }, ...current }));
    expect(await screen.findByText('На доопрацюванні')).toBeInTheDocument();
    expect(returns).toHaveLength(1);
  });

  it.each(['published', 'in_progress', 'done'])('a task in %s has no «На доопрацювання»', async (status) => {
    taskStatus = status;
    openPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Логотип для кав’ярні' })).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Відгуки студентів' });
    expect(screen.queryByRole('button', { name: 'На доопрацювання' })).not.toBeInTheDocument();
  });

  it('a task in revision shows the comment that was sent and has neither «На доопрацювання» nor «Прийняти результат»', async () => {
    taskStatus = 'revision';
    current = result('returned', COMMENT, { version: 1, comment: COMMENT, returnedAt: null });
    openPage();

    expect(await screen.findByRole('heading', { name: 'Ваш коментар до доопрацювання' })).toBeInTheDocument();
    expect(screen.getByText(COMMENT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'На доопрацювання' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Прийняти результат' })).not.toBeInTheDocument();
  });
});

/** The status label of the card, read from the page (the footer has its own role="status", so the text is searched). */
function taskStatusShown(label: string): boolean {
  return within(document.body).queryAllByText(label).length > 0;
}
