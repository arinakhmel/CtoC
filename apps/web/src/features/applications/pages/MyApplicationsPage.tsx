import { APPLICATION_STATUS_UK, MESSAGES_UK } from '@ctoc/shared';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { FilterTabs, useFilterTabs, type FilterTab } from '../../../ui/FilterTabs';
import { formatUah } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useMyApplications } from '../queries/myApplications';
import { PageTitle } from '../../../ui/PageTitle';

type Application = NonNullable<ReturnType<typeof useMyApplications>['data']>[number];

/** The tabs of «Мої відгуки», one per status of an application (domain-model.md §3.3). */
const TABS: FilterTab<Application>[] = [
  { id: 'all', label: 'filters.all', test: () => true },
  { id: 'sent', label: 'filters.sent', test: (a) => a.status === 'sent' },
  { id: 'accepted', label: 'filters.accepted', test: (a) => a.status === 'accepted' },
  { id: 'rejected', label: 'filters.rejected', test: (a) => a.status === 'rejected' },
];

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/** /me/applications: US-20. «Мої відгуки» with the current status of each application. The status comes from the API as stored. */
export function MyApplicationsPage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const applications = useMyApplications();
  const { t } = useI18n();
  const all = applications.data ?? [];
  const tabs = useFilterTabs(TABS, all);

  const errorCode = applications.isError ? (applications.error instanceof ApiClientError ? applications.error.code : 'UNKNOWN_ERROR') : null;

  useEffect(() => {
    if (errorCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [errorCode, navigate]);

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title"><PageTitle page={page} /></h1>

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
        <FilterTabs tabs={TABS} items={all} value={tabs.value} onChange={tabs.setValue} />
      )}
      {applications.isSuccess && applications.data.length > 0 && tabs.visible.length === 0 && <p className="empty-filter">{t('filters.empty')}</p>}

      {tabs.visible.length > 0 && (
        <ul aria-label="Мої відгуки">
          {tabs.visible.map((application) => (
            <li key={application.id}>
              <article aria-labelledby={`application-${application.id}`}>
                <h2 id={`application-${application.id}`}>
                  {/* The feed page answers only for an open task: an accepted application goes to the executor's card, a rejected one has no page to open. */}
                  {application.status === 'rejected' ? (
                    application.task.title
                  ) : (
                    <Link to={application.status === 'accepted' ? `/work/${application.task.id}` : `/tasks/${application.task.id}`}>
                      {application.task.title}
                    </Link>
                  )}
                </h2>
                <p>
                  Статус: <strong className="status-pill" data-status={application.status}>{APPLICATION_STATUS_UK[application.status] ?? application.status}</strong>
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
