import { LIMITS, MESSAGES_UK, TASK_STATUS_UK } from '@ctoc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CandidateList } from '../../applications/components/CandidateList';
import { candidatesKey, useCandidates } from '../../applications/queries/candidates';
import { ChatPanel } from '../../chat/components/ChatPanel';
import { ApiClientError } from '../../../lib/api';
import { formatUah } from '../../../lib/money';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/** The chat shows from assignment on, and its history stays, read-only, after the task is done or cancelled (INV-22). */
const CHAT_STATUSES = ['in_progress', 'in_review', 'revision', 'done', 'cancelled'];

/**
 * /c/tasks/:id: US-24. The customer's page of one of their tasks: the applicants with the verified badge, skills and a
 * link to the profile, the select button with its confirmation (US-25), and from assignment on the chat with the executor
 * (US-23). The result and the review come with their own stories.
 */
export function CustomerTaskPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const candidates = useCandidates(id);
  const client = useQueryClient();

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
            {data.truncated && <p role="status">Показано перші {LIMITS.candidatesMax} відгуків, решту поки не видно.</p>}
            <CandidateList taskId={data.task.id} candidates={data.applications} canSelect={data.task.status === 'published'} priceKopecks={data.task.priceKopecks} />
          </section>
          {CHAT_STATUSES.includes(data.task.status) && (
            <ChatPanel
              taskId={data.task.id}
              status={data.task.status}
              heading="Чат із виконавцем"
              // The chat closed since this page was loaded: this page takes its status from the candidate list.
              onClosed={() => void client.invalidateQueries({ queryKey: candidatesKey(id) })}
            />
          )}
        </>
      )}
    </article>
  );
}
