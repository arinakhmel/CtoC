import { MESSAGES_UK, TASK_STATUS_UK, type TaskStatus } from '@ctoc/shared';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDeadline } from '../../../lib/money';
import { ChatPanel } from '../../chat/components/ChatPanel';
import { ResultUpload } from '../../delivery/components/ResultUpload';
import { PayoutBreakdown } from '../../payments/components/PayoutBreakdown';
import { PriceBlock } from '../components/PriceBlock';
import { useTask } from '../queries/task';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/**
 * /work/:taskId: US-22. The executor's card of the active task: the full terms, the deadline in the browser's local time
 * zone (sc.3) and the agreed price (for a done task, the payout breakdown of US-35), and the chat with the customer (US-23), and the result upload (US-27). The submit (US-28),
 * the lock in review (US-29) and the revision comment (US-32, US-33) come with their own stories.
 */
export function WorkTaskPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const task = useTask(taskId);

  const errorCode = task.isError ? (task.error instanceof ApiClientError ? task.error.code : 'UNKNOWN_ERROR') : null;

  useEffect(() => {
    if (errorCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [errorCode, navigate]);

  // Only the executor's view carries `status` (api.md §4.13a). A task a student merely sees in the feed has none, and is
  // not shown as an agreed task here.
  const loaded = task.data && !task.isError ? task.data : null;
  const shown = loaded?.status ? loaded : null;
  const notMine = loaded !== null && shown === null;

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{shown ? shown.title : 'Завдання'}</h1>

      {errorCode && errorCode !== 'AUTH_REQUIRED' && (
        <p role="alert">
          {messageFor(errorCode)}{' '}
          {errorCode === 'EMAIL_NOT_CONFIRMED' && <Link to="/confirm-email">Підтвердити пошту</Link>}
        </p>
      )}

      {task.isPending && <p role="status">Завантаження…</p>}

      {notMine && <p role="alert">{MESSAGES_UK.NOT_FOUND}</p>}

      {shown && (
        <>
          <p>
            Статус: <strong className="status-pill" data-status={shown.status}>{TASK_STATUS_UK[shown.status as TaskStatus]}</strong>
          </p>
          <h2>Умови завдання</h2>
          <p>{shown.description}</p>
          {shown.status === 'done' && shown.commissionKopecks !== null && shown.netKopecks !== null ? (
            // US-35 sc.1: a finished task shows the payout breakdown, from the snapshot of the task (A-07), never recalculated.
            <section aria-labelledby="payout-title">
              <h2 id="payout-title">Виплата</h2>
              <PayoutBreakdown grossKopecks={shown.priceKopecks} commissionKopecks={shown.commissionKopecks} netKopecks={shown.netKopecks} />
            </section>
          ) : (
            <PriceBlock priceKopecks={shown.priceKopecks} netKopecks={shown.netKopecks} grossLabel="Узгоджена ціна" />
          )}
          <p>
            Виконати до: <time dateTime={shown.deadlineAt}>{formatDeadline(shown.deadlineAt)}</time>
          </p>
          <ResultUpload taskId={shown.id} status={shown.status} />
          <ChatPanel taskId={shown.id} status={shown.status} />
        </>
      )}

      <p>
        <Link to="/me/work">До моїх активних завдань</Link>
      </p>
    </article>
  );
}
