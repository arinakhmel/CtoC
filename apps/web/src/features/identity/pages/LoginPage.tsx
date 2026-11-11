import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, MESSAGES_UK, type LoginInput } from '@ctoc/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import type { PageConfig } from '../../../routes.config';
import { login, type SessionUser } from '../queries/login';
import { ResendForm } from './ConfirmEmailPage';

/** Start page by role (US-45 checklist): student → feed, customer → «Мої завдання», moderator → verification queue. */
const HOME_BY_ROLE: Record<SessionUser['user']['role'], string> = {
  student: '/feed',
  customer: '/c/tasks',
  moderator: '/mod/verifications',
};

const messageFor = (code: string | undefined): string | undefined =>
  code ? (MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR : undefined;

/** /login: US-45. An unconfirmed user may log in but can only resend the confirmation email. */
export function LoginPage({ page }: { page: PageConfig }) {
  const navigate = useNavigate();
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(null);
    try {
      const { user } = await login(email, password);
      if (!user.emailConfirmed) {
        setUnconfirmedEmail(email);
        return;
      }
      navigate(HOME_BY_ROLE[user.role]);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(error.code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : (messageFor(error.code) ?? MESSAGES_UK.INTERNAL_ERROR));
      } else {
        setFormError(MESSAGES_UK.INTERNAL_ERROR);
      }
    }
  });

  if (unconfirmedEmail !== null) {
    return (
      <article aria-labelledby="page-title">
        <h1 id="page-title">{page.title}</h1>
        <p role="alert">{MESSAGES_UK.EMAIL_NOT_CONFIRMED}. Ми можемо надіслати лист підтвердження ще раз.</p>
        <ResendForm defaultEmail={unconfirmedEmail} />
        <p>
          <Link to="/">All pages</Link>
        </p>
      </article>
    );
  }

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>
      <form onSubmit={onSubmit} noValidate aria-label="Вхід">
        <p>
          <label htmlFor="login-email">Електронна пошта</label>
          <input id="login-email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby="login-email-error" {...register('email')} />
          <span id="login-email-error" role="alert">
            {messageFor(errors.email?.message)}
          </span>
        </p>
        <p>
          <label htmlFor="login-password">Пароль</label>
          <input id="login-password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby="login-password-error" {...register('password')} />
          <span id="login-password-error" role="alert">
            {messageFor(errors.password?.message)}
          </span>
        </p>
        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={isSubmitting}>
          Увійти
        </button>
      </form>
      <p>
        <Link to="/register">Створити акаунт</Link>
      </p>
      <p>
        <Link to="/">All pages</Link>
      </p>
    </article>
  );
}
