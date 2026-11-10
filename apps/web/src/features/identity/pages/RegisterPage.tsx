import { zodResolver } from '@hookform/resolvers/zod';
import { MESSAGES_UK, registerSchema, type RegisterInput } from '@ctoc/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import type { PageConfig } from '../../../routes.config';
import { registerAccount } from '../queries/register';

type FormValues = RegisterInput;

/** Message for a validation code coming from the shared schema (its zod messages are error codes). */
const messageFor = (code: string | undefined): string | undefined =>
  code ? (MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.VALIDATION_FAILED : undefined;

/** /register: US-06 (student, university email), US-43 (customer), US-44 (display name). */
export function RegisterPage({ page }: { page: PageConfig }) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'student', email: '', displayName: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerAccount(values);
      setDone(true);
    } catch (error) {
      if (error instanceof ApiClientError && (error.code === 'EMAIL_DOMAIN_NOT_ALLOWED' || error.code === 'EMAIL_TAKEN')) {
        setError('email', { type: 'server', message: MESSAGES_UK[error.code] });
      } else if (error instanceof ApiClientError) {
        setFormError(error.code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : (messageFor(error.code) ?? MESSAGES_UK.INTERNAL_ERROR));
      } else {
        setFormError(MESSAGES_UK.INTERNAL_ERROR);
      }
    }
  });

  if (done) {
    return (
      <article aria-labelledby="page-title">
        <h1 id="page-title">{page.title}</h1>
        <p role="status">Акаунт створено. Ми надіслали лист для підтвердження електронної пошти.</p>
        <p>
          <Link to="/login">Увійти</Link>
        </p>
      </article>
    );
  }

  const fieldMessage = (name: keyof FormValues) => {
    const error = errors[name];
    return error?.type === 'server' ? error.message : messageFor(error?.message);
  };

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>
      <form onSubmit={onSubmit} noValidate aria-label="Реєстрація">
        <fieldset>
          <legend>Я реєструюся як</legend>
          <label>
            <input type="radio" value="student" {...register('role')} /> Студент
          </label>
          <label>
            <input type="radio" value="customer" {...register('role')} /> Замовник
          </label>
        </fieldset>

        <p>
          <label htmlFor="email">Електронна пошта</label>
          <input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby="email-error" {...register('email')} />
          <span id="email-error" role="alert">
            {fieldMessage('email')}
          </span>
        </p>
        <p>
          <label htmlFor="displayName">Ім’я для відображення</label>
          <input id="displayName" autoComplete="name" aria-invalid={!!errors.displayName} aria-describedby="displayName-error" {...register('displayName')} />
          <span id="displayName-error" role="alert">
            {fieldMessage('displayName')}
          </span>
        </p>
        <p>
          <label htmlFor="password">Пароль</label>
          <input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby="password-error" {...register('password')} />
          <span id="password-error" role="alert">
            {fieldMessage('password')}
          </span>
        </p>

        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={isSubmitting}>
          Зареєструватися
        </button>
      </form>
      <p>
        <Link to="/">All pages</Link>
      </p>
    </article>
  );
}
