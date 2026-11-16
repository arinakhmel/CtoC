import { APPLICATION_STATUS_UK, MESSAGES_UK } from '@ctoc/shared';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatUah } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useMyApplications } from '../queries/myApplications';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/** /me/applications: US-20. «Мої відгуки» with the current status of each application. The status comes from the API as stored. */
export function MyApplicationsPage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const applications = useMyApplications();

  const errorCode = applications.isError ? (applications.error instanceof ApiClientError ? applications.error.code : 'UNKNOWN_ERROR') : null;

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

      {applications.isPending && <p role="status">Завантаження…</p>}

      {applications.isSuccess && applications.data.length === 0 && (
        <p role="status">
          Ви ще не подавали відгуків. <Link to="/feed">Знайти завдання</Link>
        </p>
      )}

      {applications.isSuccess && applications.data.length > 0 && (
        <ul aria-label="Мої відгуки">
          {applications.data.map((application) => (
            <li key={application.id}>
              <article aria-labelledby={`application-${application.id}`}>
                <h2 id={`application-${application.id}`}>
                  <Link to={`/tasks/${application.task.id}`}>{application.task.title}</Link>
                </h2>
                <p>
                  Статус: <strong>{APPLICATION_STATUS_UK[application.status] ?? application.status}</strong>
                </p>
                <p>Ціна замовника: {formatUah(application.task.priceKopecks)}</p>
                {application.note && <p>Записка: {application.note}</p>}
              </article>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
