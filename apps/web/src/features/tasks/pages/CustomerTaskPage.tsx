import { MESSAGES_UK, TASK_STATUS_UK } from '@ctoc/shared';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CandidateList } from '../../applications/components/CandidateList';
import { useCandidates } from '../../applications/queries/candidates';
import { ChatPanel } from '../../chat/components/ChatPanel';
import { ApiClientError } from '../../../lib/api';
import { formatUah } from '../../../lib/money';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/** The chat shows from assignment on, and its history stays, read-only, after the task is done or cancelled (INV-22). */
const CHAT_STATUSES = ['in_progress', 'in_review', 'revision', 'done', 'cancelled'];

/**
 * /c/tasks/:id: US-24. The customer's page of one of their tasks: the applicants with the verified badge, skills and a
 * link to the profile, and from assignment on the chat with the executor (US-23). Selecting an executor, the result and
 * the review come with their own stories.
 */
export function CustomerTaskPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const candidates = useCandidates(id);

  const errorCode = candidates.isError ? (candidates.error instanceof ApiClientError ? candidates.error.code : 'UNKNOWN_ERROR') : null;

  useEffect(() => {
    if (errorCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [errorCode, navigate]);

  const data = candidates.data && !candidates.isError ? candidates.data : null;

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{data ? data.task.title : 'Завдання'}</h1>

      {errorCode && errorCode !== 'AUTH_REQUIRED' && (
        <p role="alert">
          {messageFor(errorCode)}{' '}
          {errorCode === 'EMAIL_NOT_CONFIRMED' && <Link to="/confirm-email">Підтвердити пошту</Link>}
        </p>
      )}

      {candidates.isPending && <p role="status">Завантаження…</p>}

      {data && (
        <>
          <p>
            Статус: <strong>{TASK_STATUS_UK[data.task.status]}</strong>
          </p>
          <p>Фіксована ціна: {formatUah(data.task.priceKopecks)}</p>
          <section aria-labelledby="candidates-title">
            <h2 id="candidates-title">Відгуки студентів</h2>
            <CandidateList taskId={data.task.id} candidates={data.applications} canSelect={data.task.status === 'published'} priceKopecks={data.task.priceKopecks} />
          </section>
          {CHAT_STATUSES.includes(data.task.status) && <ChatPanel taskId={data.task.id} status={data.task.status} heading="Чат із виконавцем" />}
        </>
      )}
    </article>
  );
}
