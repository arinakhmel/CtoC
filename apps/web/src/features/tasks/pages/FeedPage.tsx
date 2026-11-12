import { MESSAGES_UK } from '@ctoc/shared';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDeadline, formatUah } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useFeed } from '../queries/feed';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/** /feed: US-12. Cards with description, fixed price and deadline. No price input anywhere (US-13). */
export function FeedPage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const feed = useFeed();

  // The alert shows whenever the query is in error, also when pages are cached. Loaded cards stay visible, so a
  // failed "Показати ще" does not wipe what the student already read.
  const errorCode = feed.isError ? (feed.error instanceof ApiClientError ? feed.error.code : 'UNKNOWN_ERROR') : null;
  const tasks = feed.data?.pages.flatMap((result) => result.tasks) ?? [];

  useEffect(() => {
    if (errorCode === 'AUTH_REQUIRED') navigate('/login', { replace: true }); // US-12 sc.3
  }, [errorCode, navigate]);

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>

      {errorCode && errorCode !== 'AUTH_REQUIRED' && (
        <p role="alert">
          {messageFor(errorCode)}{' '}
          {errorCode === 'EMAIL_NOT_CONFIRMED' && <Link to="/confirm-email">Підтвердити пошту</Link>}
        </p>
      )}

      {feed.isPending && <p role="status">Завантаження…</p>}

      {feed.isSuccess && tasks.length === 0 && <p role="status">Поки що немає доступних завдань.</p>}

      {tasks.length > 0 && (
        <ul aria-label="Доступні завдання">
          {tasks.map((task) => (
            <li key={task.id}>
              <article aria-labelledby={`task-${task.id}`}>
                <h2 id={`task-${task.id}`}>
                  <Link to={`/tasks/${task.id}`}>{task.title}</Link>
                </h2>
                <p>{task.description}</p>
                <p>
                  Ціна: <strong>{formatUah(task.priceKopecks)}</strong>
                </p>
                <p>
                  Виконати до: <time dateTime={task.deadlineAt}>{formatDeadline(task.deadlineAt)}</time>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}

      {feed.hasNextPage && (
        <button type="button" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
          Показати ще
        </button>
      )}
    </article>
  );
}
