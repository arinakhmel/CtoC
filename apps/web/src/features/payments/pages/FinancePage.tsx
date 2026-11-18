import { MESSAGES_UK } from '@ctoc/shared';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDate, formatUah } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useFinance } from '../queries/finance';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/**
 * /me/finance: US-34, US-35. The student's balance «Доступно до виведення» and, for each task they were paid for, the three
 * amounts «Загальна сума / Комісія платформи / До отримання». All numbers come from the API (the snapshot of the task, A-07):
 * nothing is calculated here, and every amount goes through the one formatter of kopecks. Each task is a card whose three
 * amounts stack on a narrow screen (the same `price-block` rows as the task price), so none of them needs a sideways scroll.
 * The withdrawal itself is US-36.
 */
export function FinancePage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const finance = useFinance();

  const errorCode = finance.isError ? (finance.error instanceof ApiClientError ? finance.error.code : 'UNKNOWN_ERROR') : null;

  useEffect(() => {
    if (errorCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [errorCode, navigate]);

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>

      {errorCode && errorCode !== 'AUTH_REQUIRED' && (
        <p role="alert">
          {messageFor(errorCode)}{' '}
          {errorCode === 'STUDENT_NOT_VERIFIED' && <Link to="/me/verification">Пройти верифікацію</Link>}
          {errorCode === 'EMAIL_NOT_CONFIRMED' && <Link to="/confirm-email">Підтвердити пошту</Link>}
        </p>
      )}

      {finance.isPending && <p role="status">Завантаження…</p>}

      {finance.isSuccess && (
        <>
          <section aria-labelledby="finance-balance" className="finance-balance">
            <h2 id="finance-balance">Доступно до виведення</h2>
            <p>
              <strong>{formatUah(finance.data.balance.availableKopecks)}</strong>
            </p>
          </section>

          <section aria-labelledby="finance-tasks">
            <h2 id="finance-tasks">Виплати за завдання</h2>
            {finance.data.tasks.length === 0 ? (
              <p role="status">
                Завершених завдань поки немає. Гроші з’являться тут, коли замовник прийме ваш результат.{' '}
                <Link to="/me/work">До моїх завдань</Link>
              </p>
            ) : (
              <ul className="finance-list" aria-label="Виплати за завдання">
                {finance.data.tasks.map((task) => (
                  <li key={task.taskId}>
                    <article aria-labelledby={`finance-${task.taskId}`}>
                      <h3 id={`finance-${task.taskId}`}>{task.title}</h3>
                      <p>
                        Виплачено: <time dateTime={task.paidAt}>{formatDate(task.paidAt)}</time>
                      </p>
                      <dl className="price-block">
                        <div className="price-block__row">
                          <dt>Загальна сума</dt>
                          <dd>
                            <strong>{formatUah(task.grossKopecks)}</strong>
                          </dd>
                        </div>
                        <div className="price-block__row">
                          <dt>Комісія платформи</dt>
                          <dd>
                            <strong>{formatUah(task.commissionKopecks)}</strong>
                          </dd>
                        </div>
                        <div className="price-block__row price-block__row--net">
                          <dt>До отримання</dt>
                          <dd>
                            <strong>{formatUah(task.netKopecks)}</strong>
                          </dd>
                        </div>
                      </dl>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </article>
  );
}
