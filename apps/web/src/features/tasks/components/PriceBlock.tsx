import { formatUah } from '../../../lib/money';

interface PriceBlockProps {
  priceKopecks: number;
  netKopecks: number | null;
  /** The gross label differs between the card and the details page. */
  grossLabel: string;
}

/**
 * US-15. The customer's price and, separately, what the student receives after the commission. The net amount comes
 * from the API (the snapshot of publication) and is never calculated here. Each amount is its own label and value, and
 * the pairs stack on a narrow screen, so the net never runs into the gross (sc.3). No net line without a snapshot.
 */
export function PriceBlock({ priceKopecks, netKopecks, grossLabel }: PriceBlockProps) {
  return (
    <dl className="price-block">
      <div className="price-block__row">
        <dt>{grossLabel}</dt>
        <dd>
          <strong>{formatUah(priceKopecks)}</strong>
        </dd>
      </div>
      {typeof netKopecks === 'number' && (
        <div className="price-block__row price-block__row--net">
          <dt>Ви отримаєте (після комісії)</dt>
          <dd>
            <strong>{formatUah(netKopecks)}</strong>
          </dd>
        </div>
      )}
    </dl>
  );
}
