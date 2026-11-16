import { MESSAGES_UK } from '@ctoc/shared';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDeadline } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useMarkRead, useNotifications } from '../queries/notifications';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

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
