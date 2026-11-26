import { LIMITS, MESSAGES_UK, WITHDRAWAL_STATUS_LABELS_UK, WITHDRAWAL_STATUSES, type WithdrawalStatus } from '@ctoc/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatDate, formatUah } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useDecideWithdrawal, useWithdrawalQueue, type ModWithdrawal } from '../queries/withdrawals';
import { PageTitle } from '../../../ui/PageTitle';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);
const codeOf = (error: unknown): string => (error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR');

/** «4111 1111 1111 1111»: easier to copy into a banking app without a mistake. */
const groupCard = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, '$1 ');

/** One request of the queue, with the moderator's two decisions. «Відхилити» asks for the reason the student will see. */
function WithdrawalItem({ withdrawal, decide }: { withdrawal: ModWithdrawal; decide: ReturnType<typeof useDecideWithdrawal> }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const busy = decide.isPending && decide.variables?.id === withdrawal.id;
  const titleId = `withdrawal-${withdrawal.id}`;

  return (
    <article aria-labelledby={titleId}>
      <h2 id={titleId}>
        {formatUah(withdrawal.amountKopecks)} для <Link to={`/u/${withdrawal.student.id}`}>{withdrawal.student.displayName}</Link>
      </h2>
      <p>
        Картка: {withdrawal.cardNumber ? <strong>{groupCard(withdrawal.cardNumber)}</strong> : <>•••• {withdrawal.cardLast4}</>}
      </p>
      <p>
        Статус: {WITHDRAWAL_STATUS_LABELS_UK[withdrawal.status]} · подано <time dateTime={withdrawal.createdAt}>{formatDate(withdrawal.createdAt)}</time>
      </p>
      {withdrawal.reason && <p>Причина відхилення: {withdrawal.reason}</p>}

      {withdrawal.status === 'requested' && !rejecting && (
        <p>
          <button type="button" disabled={busy} onClick={() => decide.mutate({ id: withdrawal.id, action: 'mark-paid' })}>
            Позначити виплаченою
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => setRejecting(true)}>
            Відхилити
          </button>
        </p>
      )}

      {withdrawal.status === 'requested' && rejecting && (
        <form
          aria-label="Відхилення заявки"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim() === '') {
              setReasonError(MESSAGES_UK.REASON_REQUIRED);
              return;
            }
            decide.mutate({ id: withdrawal.id, action: 'reject', reason: reason.trim() });
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
 * /mod/withdrawals: US-36, A-10 (OQ-10, OQ-42). The moderator's queue of withdrawal requests. The money is sent by hand outside
 * the platform, so a `requested` item shows the full card number; then the moderator marks it paid, or rejects it with a reason
 * and the money goes back to the student's balance. A decision someone else already made is 409 ALREADY_DECIDED: the message is
 * shown and the queue is fetched again.
 */
export function WithdrawalsQueuePage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<WithdrawalStatus>('requested');
  const queue = useWithdrawalQueue(status);
  const decide = useDecideWithdrawal();

  const loadCode = queue.isError ? codeOf(queue.error) : null;
  const decideCode = decide.isError ? codeOf(decide.error) : null;

  useEffect(() => {
    if (loadCode === 'AUTH_REQUIRED' || decideCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [loadCode, decideCode, navigate]);

  const shownError = [decideCode, loadCode].find((code) => code && code !== 'AUTH_REQUIRED');

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title"><PageTitle page={page} /></h1>
      <p>Виплата робиться вручну: переказ на картку студента, потім позначка тут. Повний номер картки видно лише до рішення.</p>

      <label htmlFor="withdrawal-status">Показати</label>
      <select id="withdrawal-status" value={status} onChange={(event) => setStatus(event.target.value as WithdrawalStatus)}>
        {WITHDRAWAL_STATUSES.map((value) => (
          <option key={value} value={value}>
            {WITHDRAWAL_STATUS_LABELS_UK[value]}
          </option>
        ))}
      </select>

      {shownError && <p role="alert">{messageFor(shownError)}</p>}
      {decide.isSuccess && (
        <p role="status">
          Заявку {decide.data.withdrawal.status === 'paid' ? 'позначено виплаченою' : 'відхилено, гроші повернуто на баланс студента'}.
        </p>
      )}

      {queue.isPending && <p>Завантаження…</p>}
      {queue.isSuccess && queue.data.length === 0 && <p>Заявок зі статусом «{WITHDRAWAL_STATUS_LABELS_UK[status]}» немає.</p>}
      {queue.isSuccess && queue.data.length > 0 && (
        <ul aria-label="Заявки на виведення" className="finance-list">
          {queue.data.map((withdrawal) => (
            <li key={withdrawal.id}>
              <WithdrawalItem withdrawal={withdrawal} decide={decide} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
