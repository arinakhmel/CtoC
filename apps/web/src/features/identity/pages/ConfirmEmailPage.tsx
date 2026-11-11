import { zodResolver } from '@hookform/resolvers/zod';
import { MESSAGES_UK, resendConfirmationSchema, type ErrorCode, type ResendConfirmationInput } from '@ctoc/shared';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import type { PageConfig } from '../../../routes.config';
import { confirmEmail, resendConfirmation } from '../queries/confirmEmail';

type State = { kind: 'checking' } | { kind: 'confirmed' } | { kind: 'failed'; code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN_ERROR' };

const messageFor = (code: string | undefined): string | undefined =>
  code ? (MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR : undefined;

/** /confirm-email: US-07. The emailed link opens this page with ?token=…; an expired link offers a resend. */
export function ConfirmEmailPage({ page }: { page: PageConfig }) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>(token ? { kind: 'checking' } : { kind: 'failed', code: 'TOKEN_INVALID' });
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return; // a token is single use: never send it twice
    started.current = true;
    confirmEmail(token).then(
      () => setState({ kind: 'confirmed' }),
      (error: unknown) => setState({ kind: 'failed', code: error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR' }),
    );
  }, [token]);

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>
      {state.kind === 'checking' && <p role="status">Перевіряємо посилання…</p>}
      {state.kind === 'confirmed' && (
        <>
          <p role="status">Пошту підтверджено. Тепер ви можете увійти.</p>
          <p>
            <Link to="/login">Увійти</Link>
          </p>
        </>
      )}
      {state.kind === 'failed' && (
        <>
          <p role="alert">{state.code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : messageFor(state.code)}</p>
          {(state.code === 'TOKEN_EXPIRED' || state.code === 'TOKEN_INVALID') && <ResendForm />}
        </>
      )}
      <p>
        <Link to="/">All pages</Link>
      </p>
    </article>
  );
}

/** Also used on /login for a user whose email is not confirmed yet (US-45, US-07/S3). */
export function ResendForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendConfirmationInput>({ resolver: zodResolver(resendConfirmationSchema), defaultValues: { email: defaultEmail } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await resendConfirmation(email);
      setSent(true);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : (messageFor(error.code) ?? MESSAGES_UK.INTERNAL_ERROR));
      } else {
        setFormError(MESSAGES_UK.INTERNAL_ERROR);
      }
    }
  });

  if (sent) return <p role="status">Ми надіслали новий лист. Перевірте пошту.</p>;

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Повторна відправка листа">
      <p>
        <label htmlFor="resend-email">Електронна пошта</label>
        <input id="resend-email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby="resend-email-error" {...register('email')} />
        <span id="resend-email-error" role="alert">
          {messageFor(errors.email?.message)}
        </span>
      </p>
      {formError && <p role="alert">{formError}</p>}
      <button type="submit" disabled={isSubmitting}>
        Надіслати лист повторно
      </button>
    </form>
  );
}
