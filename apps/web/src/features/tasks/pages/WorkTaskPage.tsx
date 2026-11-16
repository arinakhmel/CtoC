import { MESSAGES_UK, TASK_STATUS_UK, type TaskStatus } from '@ctoc/shared';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDeadline } from '../../../lib/money';
import { ChatPanel } from '../../chat/components/ChatPanel';
import { PriceBlock } from '../components/PriceBlock';
import { useTask } from '../queries/task';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/**
 * /work/:taskId: US-22. The executor's card of the active task: the full terms, the deadline in the browser's local time
 * zone (sc.3) and the agreed price, and the chat with the customer (US-23). The result upload and the revision comment come
 * with their own stories.
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
            Статус: <strong>{TASK_STATUS_UK[shown.status as TaskStatus]}</strong>
          </p>
          <h2>Умови завдання</h2>
          <p>{shown.description}</p>
          <PriceBlock priceKopecks={shown.priceKopecks} netKopecks={shown.netKopecks} grossLabel="Узгоджена ціна" />
          <p>
            Виконати до: <time dateTime={shown.deadlineAt}>{formatDeadline(shown.deadlineAt)}</time>
          </p>
          <ChatPanel taskId={shown.id} status={shown.status} />
        </>
      )}

      <p>
        <Link to="/me/work">До моїх активних завдань</Link>
      </p>
    </article>
  );
}
