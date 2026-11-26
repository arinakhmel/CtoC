import { LIMITS, MESSAGES_UK, VERIFICATION_STATUS_LABELS_UK } from '@ctoc/shared';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, ApiClientError } from '../../../lib/api';
import { formatDate } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useDecideVerification, useVerificationQueue, type ModVerification } from '../queries/verifications';
import { PageTitle } from '../../../ui/PageTitle';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);
const codeOf = (error: unknown): string => (error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR');

/** One document of the queue. «Відхилити» asks for the reason the student will read. */
function VerificationItem({ item, decide }: { item: ModVerification; decide: ReturnType<typeof useDecideVerification> }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const busy = decide.isPending && decide.variables?.id === item.id;
  const titleId = `verification-${item.id}`;

  return (
    <article aria-labelledby={titleId}>
      <h2 id={titleId}>{item.student.displayName}</h2>
      <p>
        {item.student.email}, подано <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
      </p>
      <p>Статус: {VERIFICATION_STATUS_LABELS_UK[item.status]}</p>
      <p>
        <a href={`${API_BASE_URL}/files/${encodeURIComponent(item.file.id)}`} target="_blank" rel="noreferrer">
          Переглянути документ
        </a>{' '}
        ({item.file.originalName})
      </p>

      {!rejecting && (
        <p>
          <button type="button" disabled={busy} onClick={() => decide.mutate({ id: item.id, action: 'approve' })}>
            Схвалити
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => setRejecting(true)}>
            Відхилити
          </button>
        </p>
      )}

      {rejecting && (
        <form
          aria-label="Відхилення документа"
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
          <label htmlFor={`${titleId}-reason`}>Причина для студента</label>
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
 * /mod/verifications: US-39. The moderator's queue of student documents (Telegram stays an additional way, OQ-21). The moderator opens
 * the document, then approves (the student gets the badge) or rejects with a reason the student reads. A document someone else
 * already decided is 409 ALREADY_DECIDED: the message is shown and the queue is fetched again, so the row leaves it.
 */
export function VerificationsQueuePage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const queue = useVerificationQueue();
  const decide = useDecideVerification();

  const loadCode = queue.isError ? codeOf(queue.error) : null;
  const decideCode = decide.isError ? codeOf(decide.error) : null;

  useEffect(() => {
    if (loadCode === 'AUTH_REQUIRED' || decideCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [loadCode, decideCode, navigate]);

  const shownError = [decideCode, loadCode].find((code) => code && code !== 'AUTH_REQUIRED');

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title"><PageTitle page={page} /></h1>
      <p>Статус {VERIFICATION_STATUS_LABELS_UK.pending}: відкрийте документ і перевірте, що його надіслав справжній студент.</p>

      {shownError && <p role="alert">{messageFor(shownError)}</p>}
      {decide.isSuccess && (
        <p role="status">{decide.data.verification.status === 'approved' ? 'Студента підтверджено.' : 'Документ відхилено, студент отримає причину.'}</p>
      )}

      {queue.isPending && <p>Завантаження…</p>}
      {queue.isSuccess && queue.data.length === 0 && <p>Документів на перевірку немає.</p>}
      {queue.isSuccess && queue.data.length > 0 && (
        <ul aria-label="Документи на перевірку">
          {queue.data.map((item) => (
            <li key={item.id}>
              <VerificationItem item={item} decide={decide} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
