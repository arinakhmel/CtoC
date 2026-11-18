import { LIMITS, MESSAGES_UK, TASK_STATUS_UK } from '@ctoc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CandidateList } from '../../applications/components/CandidateList';
import { candidatesKey, useCandidates } from '../../applications/queries/candidates';
import { ResultReview } from '../../delivery/components/ResultReview';
import { ChatPanel } from '../../chat/components/ChatPanel';
import { ApiClientError } from '../../../lib/api';
import { formatUah } from '../../../lib/money';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/** The chat shows from assignment on, and its history stays, read-only, after the task is done or cancelled (INV-22). */
const CHAT_STATUSES = ['in_progress', 'in_review', 'revision', 'done', 'cancelled'];

/**
 * The result block shows once a result was sent for review, and stays after it was accepted or sent back (the customer then sees
 * the version that was decided). Only `in_review` has the accept button. It also keeps a message on the page when a 409 moves the
 * task on while the customer is looking at it.
 */
const RESULT_STATUSES = ['in_review', 'done', 'revision'];

/**
 * /c/tasks/:id: US-24. The customer's page of one of their tasks: the applicants with the verified badge, skills and a
 * link to the profile, the select button with its confirmation (US-25), and from assignment on the chat with the executor
 * (US-23). From review on, the files the student sent and «Прийняти результат» with its confirmation (US-31). The return for
 * revision comes with its own story.
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
  // A published task past its deadline cannot be selected for (409 TASK_NOT_OPEN), so the buttons are off and the page says why.
  const deadlinePassed = data?.task.deadlineAt !== undefined && new Date(data.task.deadlineAt).getTime() <= Date.now();
  const canSelect = data?.task.status === 'published' && !deadlinePassed;
  // A task cancelled before an executor was chosen never had a chat. `hasExecutor` is absent in older answers: then show it.
  const showChat = data !== null && CHAT_STATUSES.includes(data.task.status) && !(data.task.status === 'cancelled' && data.task.hasExecutor === false);

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
            {data.task.status === 'published' && deadlinePassed && (
              <p role="status">Строк виконання завдання минув, тому обрати виконавця вже не можна.</p>
            )}
            {data.truncated && <p role="status">Показано перші {LIMITS.candidatesMax} відгуків, решту поки не видно.</p>}
            <CandidateList taskId={data.task.id} candidates={data.applications} canSelect={canSelect} priceKopecks={data.task.priceKopecks} />
          </section>
          {RESULT_STATUSES.includes(data.task.status) && <ResultReview taskId={data.task.id} status={data.task.status} />}
          {showChat && (
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
