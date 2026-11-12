import { MESSAGES_UK } from '@ctoc/shared';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDeadline, formatUah } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useTask } from '../queries/task';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/** /tasks/:id: US-13. The price is a fixed amount set by the customer. There is no field or button to offer another one. */
export function TaskPage({ page }: { page: PageConfig }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const task = useTask(id);

  const errorCode = task.error ? (task.error instanceof ApiClientError ? task.error.code : 'UNKNOWN_ERROR') : null;

  useEffect(() => {
    if (errorCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
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

      {task.isPending && <p role="status">Завантаження…</p>}

      {task.data && (
        <>
          <h2>{task.data.title}</h2>
          <p>{task.data.description}</p>
          <p>
            Фіксована ціна: <strong>{formatUah(task.data.priceKopecks)}</strong>
          </p>
          <p>
            Виконати до: <time dateTime={task.data.deadlineAt}>{formatDeadline(task.data.deadlineAt)}</time>
          </p>
        </>
      )}

      <p>
        <Link to="/feed">До стрічки завдань</Link>
      </p>
    </article>
  );
}
