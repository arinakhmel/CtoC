import { WITHDRAWAL_STATUS_LABELS_UK } from '@ctoc/shared';
import { formatDate, formatUah } from '../../../lib/money';
import type { MyWithdrawal } from '../queries/withdrawals';

/** US-36. The student's withdrawal requests, newest first: amount, the last four digits of the card, status and, if refused, why. */
export function WithdrawalList({ withdrawals }: { withdrawals: MyWithdrawal[] }) {
  return (
    <section aria-labelledby="withdrawals-title">
      <h2 id="withdrawals-title">Мої заявки на виведення</h2>
      {withdrawals.length === 0 ? (
        <p>Заявок на виведення ще немає.</p>
      ) : (
        <ul aria-label="Мої заявки на виведення" className="finance-list">
          {withdrawals.map((withdrawal) => (
            <li key={withdrawal.id}>
              <p>
                <strong>{formatUah(withdrawal.amountKopecks)}</strong> на картку •••• {withdrawal.cardLast4}
              </p>
              <p>
                Статус: <strong className="status-pill" data-status={withdrawal.status}>{WITHDRAWAL_STATUS_LABELS_UK[withdrawal.status]}</strong>, <time dateTime={withdrawal.createdAt}>{formatDate(withdrawal.createdAt)}</time>
              </p>
              {withdrawal.status === 'rejected' && withdrawal.reason && <p>Причина: {withdrawal.reason}. Гроші повернуто на баланс.</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
