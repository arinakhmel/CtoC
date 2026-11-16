import { LIMITS, MESSAGES_UK, createMessageSchema, type TaskStatus } from '@ctoc/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDeadline } from '../../../lib/money';
import { useMessages, useSendMessage } from '../queries/chat';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

const codeOf = (error: unknown): string => (error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR');

/**
 * US-23. The chat of a task between its customer and its executor. The send button is off while the field is empty (sc.2);
 * the shared schema and the API check it again. The list refreshes every 5 seconds (sc.1, W-18).
 * After the task is done or cancelled the chat is read-only (INV-22): the history stays, the form is replaced by a note.
 * `heading` names the other side: the executor sees «Чат із замовником» (the default), the customer «Чат із виконавцем».
 */
export function ChatPanel({
  taskId,
  status,
  heading = 'Чат із замовником',
  onClosed,
}: {
  taskId: string;
  status?: TaskStatus;
  heading?: string;
  /** Called when the API says the chat is closed (409 CHAT_CLOSED): the page that owns the task status fetches it again. */
  onClosed?: () => void;
}) {
  const readOnly = status === 'done' || status === 'cancelled';
  const navigate = useNavigate();
  const messages = useMessages(taskId);
  const send = useSendMessage(taskId);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<{ body: string }>({ resolver: zodResolver(createMessageSchema), defaultValues: { body: '' } });

  const loadCode = messages.isError ? codeOf(messages.error) : null;
  const sendCode = send.isError && !readOnly ? codeOf(send.error) : null;
  const empty = (watch('body') ?? '').trim().length === 0;

  useEffect(() => {
    if (loadCode === 'AUTH_REQUIRED' || sendCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [loadCode, sendCode, navigate]);

  useEffect(() => {
    if (sendCode === 'CHAT_CLOSED') onClosed?.();
    // `onClosed` is a fresh function on every render of the page; the code is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendCode]);

  const shownError = [loadCode, sendCode].find((code) => code && code !== 'AUTH_REQUIRED');

  return (
    <section aria-labelledby="chat-title">
      <h2 id="chat-title">{heading}</h2>

      {messages.isPending && <p role="status">Завантаження…</p>}

      {messages.isSuccess && messages.data.length === 0 && <p role="status">Повідомлень поки немає.</p>}

      <div role="log" aria-label="Повідомлення чату">
        <ul>
          {(messages.data ?? []).map((message) => (
            <li key={message.id}>
              <strong>{message.mine ? 'Ви' : message.from === 'customer' ? 'Замовник' : 'Студент'}:</strong> {message.body}{' '}
              <time dateTime={message.createdAt}>{formatDeadline(message.createdAt)}</time>
            </li>
          ))}
        </ul>
      </div>

      {shownError && <p role="alert">{messageFor(shownError)}</p>}

      {readOnly ? (
        <p role="status">
          Чат закрито: завдання {status === 'cancelled' ? 'скасоване' : 'завершене'}. Історія повідомлень залишається доступною.
        </p>
      ) : (
        <form
          aria-label="Нове повідомлення"
          noValidate
          onSubmit={handleSubmit((values) => send.mutate(values.body, { onSuccess: () => reset({ body: '' }) }))}
        >
          <label htmlFor="chat-body">Повідомлення</label>
          <textarea
            id="chat-body"
            rows={3}
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={errors.body ? 'chat-body-error' : undefined}
            {...register('body')}
          />
          <p>Не більше {LIMITS.messageMax} символів.</p>
          {errors.body && (
            <p id="chat-body-error" role="alert">
              {messageFor(String(errors.body.message))}
            </p>
          )}
          <button type="submit" disabled={empty || send.isPending}>
            Надіслати
          </button>
        </form>
      )}
    </section>
  );
}
