import { formatUah } from '../../../lib/money';

interface PayoutBreakdownProps {
  grossKopecks: number;
  commissionKopecks: number;
  netKopecks: number;
}

/**
 * US-35. «Загальна сума / Комісія платформи / До отримання» of one paid task. The three amounts are the snapshot of the task
 * (A-07) and are never calculated here; each goes through the one formatter of kopecks. The rows are the `price-block` rows of
 * US-15, which stack on a narrow screen, so none of the three needs a sideways scroll. Used on `/me/finance` and on the card
 * of a done task (`/work/:taskId`).
 */
export function PayoutBreakdown({ grossKopecks, commissionKopecks, netKopecks }: PayoutBreakdownProps) {
  return (
    <dl className="price-block">
      <div className="price-block__row">
        <dt>Загальна сума</dt>
        <dd>
          <strong>{formatUah(grossKopecks)}</strong>
        </dd>
      </div>
      <div className="price-block__row">
        <dt>Комісія платформи</dt>
        <dd>
          <strong>{formatUah(commissionKopecks)}</strong>
        </dd>
      </div>
      <div className="price-block__row price-block__row--net">
        <dt>До отримання</dt>
        <dd>
          <strong>{formatUah(netKopecks)}</strong>
        </dd>
      </div>
    </dl>
  );
}
