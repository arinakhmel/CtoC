import { MESSAGES_UK, TASK_STATUS_UK, type TaskStatus } from '@ctoc/shared';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDeadline, formatUah } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useMyWork } from '../queries/work';
import { PageTitle } from '../../../ui/PageTitle';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/** /me/work: US-22. «Мої активні завдання»: the tasks the student is the executor of, with status, price and deadline. */
export function MyWorkPage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const work = useMyWork();

  const errorCode = work.isError ? (work.error instanceof ApiClientError ? work.error.code : 'UNKNOWN_ERROR') : null;

  useEffect(() => {
    if (errorCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [errorCode, navigate]);

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title"><PageTitle page={page} /></h1>

      {errorCode && errorCode !== 'AUTH_REQUIRED' && (
        <p role="alert">
          {messageFor(errorCode)}{' '}
          {errorCode === 'STUDENT_NOT_VERIFIED' && <Link to="/me/verification">Пройти верифікацію</Link>}
          {errorCode === 'EMAIL_NOT_CONFIRMED' && <Link to="/confirm-email">Підтвердити пошту</Link>}
        </p>
      )}

      {work.isPending && <p role="status">Завантаження…</p>}

      {work.isSuccess && work.data.length === 0 && (
        <p role="status">
          Активних завдань поки немає. <Link to="/feed">Знайти завдання</Link>
        </p>
      )}

      {work.isSuccess && work.data.length > 0 && (
        <ul aria-label="Мої активні завдання">
          {work.data.map((task) => (
            <li key={task.id}>
              <article aria-labelledby={`work-${task.id}`}>
                <h2 id={`work-${task.id}`}>
                  <Link to={`/work/${task.id}`}>{task.title}</Link>
                </h2>
                <p>
                  Статус: <strong>{task.status ? TASK_STATUS_UK[task.status as TaskStatus] : ''}</strong>
                </p>
                <p>Узгоджена ціна: {formatUah(task.priceKopecks)}</p>
                <p>
                  Виконати до: <time dateTime={task.deadlineAt}>{formatDeadline(task.deadlineAt)}</time>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
