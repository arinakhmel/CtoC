import { LIMITS, MESSAGES_UK, TASK_STATUS_UK } from '@ctoc/shared';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDeadline, formatUah } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useDecideTask, useTaskQueue, type ModTask } from '../queries/tasks';
import { PageTitle } from '../../../ui/PageTitle';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);
const codeOf = (error: unknown): string => (error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR');

/** One task of the queue. «Відхилити» asks for the reason the customer will read. A past deadline is marked (OQ-43 d): the task would not reach the feed. */
function TaskItem({ item, decide }: { item: ModTask; decide: ReturnType<typeof useDecideTask> }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const busy = decide.isPending;
  const titleId = `task-${item.id}`;
  const expired = new Date(item.deadlineAt).getTime() <= Date.now();

  return (
    <article aria-labelledby={titleId}>
      <h2 id={titleId}>{item.title}</h2>
      <p>Статус: {TASK_STATUS_UK[item.status]}</p>
      <p>{item.description}</p>
      <p>Ціна: {formatUah(item.priceKopecks)}</p>
      <p>
        Дедлайн: <time dateTime={item.deadlineAt}>{formatDeadline(item.deadlineAt)}</time>
        {expired && (
          <strong className="deadline-expired" data-expired="true">
            {' '}
            · дедлайн минув
          </strong>
        )}
      </p>
      <p>Замовник: {item.customer.displayName}</p>

      {!rejecting && (
        <p>
          <button type="button" disabled={busy} onClick={() => decide.mutate({ id: item.id, action: 'publish' })}>
            Опублікувати
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => setRejecting(true)}>
            Відхилити
          </button>
        </p>
      )}

      {rejecting && (
        <form
          aria-label="Відхилення завдання"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim() === '') {
              setReasonError(MESSAGES_UK.REASON_REQUIRED);
              return;
            }
            decide.mutate({ id: item.id, action: 'reject', reason: reason.trim() });
          }}
        >
          <label htmlFor={`${titleId}-reason`}>Причина для замовника</label>
          <textarea
            id={`${titleId}-reason`}
            value={reason}
            maxLength={LIMITS.moderationReasonMax}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? `${titleId}-reason-error` : undefined}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(null);
            }}
          />
          {reasonError && (
            <p id={`${titleId}-reason-error`} role="alert">
              {reasonError}
            </p>
          )}
          <button type="submit" disabled={busy}>
            Підтвердити відхилення
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => setRejecting(false)}>
            Скасувати
          </button>
        </form>
      )}
    </article>
  );
}

/**
 * /mod/tasks: US-40. The queue of new tasks. The moderator checks that the task is a real commercial order, not homework, then publishes
 * (the task enters the feed) or rejects with a reason the customer reads. A task someone else already decided, or the owner cancelled,
 * is 409 ALREADY_DECIDED: the message is shown and the queue is fetched again, so the row leaves it.
 */
export function TasksQueuePage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const queue = useTaskQueue();
  const decide = useDecideTask();

  const loadCode = queue.isError ? codeOf(queue.error) : null;
  const decideCode = decide.isError ? codeOf(decide.error) : null;

  useEffect(() => {
    if (loadCode === 'AUTH_REQUIRED' || decideCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [loadCode, decideCode, navigate]);

  const shownError = [decideCode, loadCode].find((code) => code && code !== 'AUTH_REQUIRED');

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title"><PageTitle page={page} /></h1>
      <p>Статус {TASK_STATUS_UK.pending_moderation}: перевірте, що це справжнє замовлення, а не домашнє завдання.</p>

      {shownError && <p role="alert">{messageFor(shownError)}</p>}
      {decide.isSuccess && <p role="status">{decide.data.task.status === 'published' ? 'Завдання опубліковано.' : 'Завдання відхилено, замовник отримає причину.'}</p>}

      {queue.isPending && <p>Завантаження…</p>}
      {queue.isSuccess && queue.data.length === 0 && <p>Завдань на перевірку немає.</p>}
      {queue.isSuccess && queue.data.length > 0 && (
        <ul aria-label="Завдання на перевірку">
          {queue.data.map((item) => (
            <li key={item.id}>
              <TaskItem item={item} decide={decide} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
