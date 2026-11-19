import { createWithdrawalSchema, MESSAGES_UK, type CreateWithdrawalInput } from '@ctoc/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiClientError } from '../../../lib/api';
import { formatUah, uahToKopecks } from '../../../lib/money';
import { useRequestWithdrawal } from '../queries/withdrawals';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/**
 * US-36 sc.1–sc.3. The withdrawal form of `/me/finance`: the amount in UAH and a Ukrainian card number. «Вивести кошти» checks the
 * fields with the shared schema (16 digits and Luhn, sc.2) and asks to confirm; «Підтвердити» sends the request. The server checks
 * everything again: a card it refuses is shown at the card field, a balance that is short (sc.3) as a general error. The card
 * number is never kept after the form is sent; the page shows only its last four digits.
 */
export function WithdrawalForm({ availableKopecks }: { availableKopecks: number }) {
  const request = useRequestWithdrawal();
  const [pending, setPending] = useState<CreateWithdrawalInput | null>(null);
  const [created, setCreated] = useState<{ amountKopecks: number; cardLast4: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateWithdrawalInput>({ resolver: zodResolver(createWithdrawalSchema) });

  const serverCode = request.isError ? (request.error instanceof ApiClientError ? request.error.code : 'UNKNOWN_ERROR') : null;
  const cardCode = errors.cardNumber ? String(errors.cardNumber.message) : serverCode === 'CARD_INVALID' ? 'CARD_INVALID' : null;
  const amountCode = errors.amountKopecks ? String(errors.amountKopecks.message) : null;
  const generalCode = serverCode && serverCode !== 'CARD_INVALID' && serverCode !== 'AUTH_REQUIRED' ? serverCode : null;

  const confirm = () => {
    if (!pending) return;
    request.mutate(pending, {
      onSuccess: (body) => {
        setCreated({ amountKopecks: body.withdrawal.amountKopecks, cardLast4: body.withdrawal.cardLast4 });
        setPending(null);
        // Empty texts, not undefined: the amount is registered with setValueAs, and only an empty value clears the input.
        reset({ amountKopecks: '' as unknown as number, cardNumber: '' });
      },
      onError: () => setPending(null),
    });
  };

  return (
    <section aria-labelledby="withdraw-title">
      <h2 id="withdraw-title">Вивести кошти</h2>
      <form
        aria-label="Виведення коштів на картку"
        noValidate
        onSubmit={handleSubmit((values) => {
          setCreated(null);
          request.reset();
          setPending(values);
        })}
      >
        <label htmlFor="withdraw-amount">Сума, грн</label>
        <input
          id="withdraw-amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={amountCode ? true : undefined}
          aria-describedby={amountCode ? 'withdraw-amount-hint withdraw-amount-error' : 'withdraw-amount-hint'}
          disabled={pending !== null || request.isPending}
          {...register('amountKopecks', { setValueAs: uahToKopecks })}
        />
        <p id="withdraw-amount-hint">Доступно до виведення: {formatUah(availableKopecks)}.</p>
        {amountCode && (
          <p id="withdraw-amount-error" role="alert">
            {amountCode === 'VALIDATION_FAILED' ? 'Вкажіть суму в гривнях, наприклад 500 або 250,50' : messageFor(amountCode)}
          </p>
        )}

        <label htmlFor="withdraw-card">Номер української банківської картки</label>
        <input
          id="withdraw-card"
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          aria-invalid={cardCode ? true : undefined}
          aria-describedby={cardCode ? 'withdraw-card-hint withdraw-card-error' : 'withdraw-card-hint'}
          disabled={pending !== null || request.isPending}
          {...register('cardNumber')}
        />
        <p id="withdraw-card-hint">16 цифр, пробіли можна залишити.</p>
        {cardCode && (
          <p id="withdraw-card-error" role="alert">
            {messageFor(cardCode)}
          </p>
        )}

        {pending === null && (
          <button type="submit" disabled={request.isPending}>
            Вивести кошти
          </button>
        )}
      </form>

      {pending !== null && (
        <div role="group" aria-label="Підтвердження виведення">
          <p>
            Вивести {formatUah(pending.amountKopecks)} на картку •••• {pending.cardNumber.slice(-4)}? Сума одразу зникне з доступного балансу, а
            заявку виплатить команда платформи.
          </p>
          <button type="button" onClick={confirm} disabled={request.isPending}>
            Підтвердити
          </button>{' '}
          <button type="button" onClick={() => setPending(null)} disabled={request.isPending}>
            Скасувати
          </button>
        </div>
      )}

      {generalCode && <p role="alert">{messageFor(generalCode)}</p>}
      {created && (
        <p role="status">
          Заявку на виведення {formatUah(created.amountKopecks)} на картку •••• {created.cardLast4} створено. Статус: «Очікує виплати».
        </p>
      )}
    </section>
  );
}
