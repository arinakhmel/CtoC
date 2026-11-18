import {
  MESSAGES_UK,
  executorSelectedPayloadSchema,
  resultAcceptedPayloadSchema,
  resultReturnedPayloadSchema,
  resultSubmittedPayloadSchema,
} from '@ctoc/shared';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDeadline } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useMarkRead, useNotifications, type AppNotification } from '../queries/notifications';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/**
 * Where a notification leads. «Вас обрано виконавцем» goes to the executor's card of the task (`/work/:id`); «Студент надіслав
 * результат…» goes to the customer's card (`/c/tasks/:id`, US-48). The payload is checked, it is data from the server.
 */
const linkOf = (notification: AppNotification): string | null => {
  if (notification.type === 'executor_selected') {
    const parsed = executorSelectedPayloadSchema.safeParse(notification.payload);
    return parsed.success ? `/work/${parsed.data.taskId}` : null;
  }
  if (notification.type === 'result_submitted') {
    const parsed = resultSubmittedPayloadSchema.safeParse(notification.payload);
    return parsed.success ? `/c/tasks/${parsed.data.taskId}` : null;
  }
  if (notification.type === 'result_returned') {
    // US-33: «Замовник повернув результат…» goes to the executor's card, where the comment of the customer is shown.
    const parsed = resultReturnedPayloadSchema.safeParse(notification.payload);
    return parsed.success ? `/work/${parsed.data.taskId}` : null;
  }
  if (notification.type === 'result_accepted') {
    // US-30: «Ваш результат прийнято…» goes to the executor's card, which still reads a task that is `done`.
    const parsed = resultAcceptedPayloadSchema.safeParse(notification.payload);
    return parsed.success ? `/work/${parsed.data.taskId}` : null;
  }
  return null;
};

/** /notifications: US-21. The notification centre. Unread ones are marked and can be marked as read; old ones stay listed (sc.3). */
export function NotificationsPage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const markRead = useMarkRead();

  const errorCode = notifications.isError ? (notifications.error instanceof ApiClientError ? notifications.error.code : 'UNKNOWN_ERROR') : null;
  const markError = markRead.isError ? (markRead.error instanceof ApiClientError ? markRead.error.code : 'UNKNOWN_ERROR') : null;

  useEffect(() => {
    if (errorCode === 'AUTH_REQUIRED' || markError === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [errorCode, markError, navigate]);

  const shownError = [errorCode, markError].find((code) => code && code !== 'AUTH_REQUIRED');

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>

      {shownError && <p role="alert">{messageFor(shownError)}</p>}

      {notifications.isPending && <p role="status">Завантаження…</p>}

      {notifications.isSuccess && notifications.data.length === 0 && <p role="status">Сповіщень поки немає.</p>}

      {notifications.isSuccess && notifications.data.length > 0 && (
        <ul aria-label="Сповіщення">
          {notifications.data.map((notification) => (
            <li key={notification.id}>
              <article aria-label={notification.text}>
                <p>
                  {!notification.read && <strong>Нове: </strong>}
                  {notification.text}
                </p>
                <p>
                  <time dateTime={notification.createdAt}>{formatDeadline(notification.createdAt)}</time>
                </p>
                {linkOf(notification) && <Link to={linkOf(notification)!}>Відкрити завдання</Link>}
                {!notification.read && (
                  <button type="button" disabled={markRead.isPending} onClick={() => markRead.mutate(notification.id)}>
                    Позначити прочитаним
                  </button>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link to="/feed">До завдань</Link>
      </p>
    </article>
  );
}
