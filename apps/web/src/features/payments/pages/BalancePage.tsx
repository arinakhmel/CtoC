import { LIMITS, MESSAGES_UK, sandboxTopUpSchema } from '@ctoc/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { formatUah, uahToKopecks } from '../../../lib/money';
import type { PageConfig } from '../../../routes.config';
import { useBalance, useTopUp } from '../queries/balance';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

const codeOf = (error: unknown): string => (error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR');

/**
 * /c/balance: US-26 (OQ-09, A-06). The customer's available balance and the SANDBOX top-up: a test amount that is added with
 * no real money, so a task can be reserved (US-25). Marked as a test mode on the page. The amount is checked here with the
 * shared schema and again by the API.
 */
export function BalancePage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const balance = useBalance();
  const topUp = useTopUp();
  const [added, setAdded] = useState<number | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ amountKopecks: number }>({ resolver: zodResolver(sandboxTopUpSchema) });

  const loadCode = balance.isError ? codeOf(balance.error) : null;
  const sendCode = topUp.isError ? codeOf(topUp.error) : null;

  useEffect(() => {
    if (loadCode === 'AUTH_REQUIRED' || sendCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [loadCode, sendCode, navigate]);

  const shownError = [loadCode, sendCode].find((code) => code && code !== 'AUTH_REQUIRED');

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>

      <p role="note" className="sandbox-note">
        Тестовий режим: це поповнення не списує реальні гроші. Гроші з’являються лише на вашому тестовому балансі.
      </p>

      {shownError && (
        <p role="alert">
          {messageFor(shownError)} {shownError === 'EMAIL_NOT_CONFIRMED' && <Link to="/confirm-email">Підтвердити пошту</Link>}
        </p>
      )}

      {balance.isPending && <p role="status">Завантаження…</p>}
      {balance.isSuccess && (
        <p>
          Доступно: <strong>{formatUah(balance.data)}</strong>
        </p>
      )}

      <form
        aria-label="Тестове поповнення балансу"
        noValidate
        onSubmit={handleSubmit((values) => {
          setAdded(null);
          topUp.mutate(values.amountKopecks, {
            onSuccess: () => {
              setAdded(values.amountKopecks);
              // An empty text, not undefined: the field is registered with setValueAs, and only an empty value clears the input.
              reset({ amountKopecks: '' as unknown as number });
            },
          });
        })}
      >
        <label htmlFor="topup-amount">Сума, грн</label>
        <input
          id="topup-amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={errors.amountKopecks ? true : undefined}
          aria-describedby="topup-hint"
          {...register('amountKopecks', { setValueAs: uahToKopecks })}
        />
        <p id="topup-hint">
          Від {formatUah(LIMITS.sandboxTopUp.min)} до {formatUah(LIMITS.sandboxTopUp.max)} за один раз.
        </p>
        {errors.amountKopecks && <p role="alert">{messageFor(String(errors.amountKopecks.message))}</p>}
        <button type="submit" disabled={topUp.isPending}>
          Поповнити (тест)
        </button>
      </form>

      {added !== null && <p role="status">Баланс поповнено на {formatUah(added)}.</p>}

      <p>
        <Link to="/c/tasks">До моїх завдань</Link>
      </p>
    </article>
  );
}
