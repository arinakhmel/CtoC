import { LIMITS, MESSAGES_UK, createApplicationSchema } from '@ctoc/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import { useApply } from '../queries/apply';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/**
 * US-18. The «Відгукнутися» button of /tasks/:id. It is visible to every student (decision OQ-19): the API answers
 * 403 STUDENT_NOT_VERIFIED to an unverified one and the page links to /me/verification (sc.3).
 * There is no endpoint yet that says "you already applied" (US-20), so the button is disabled for the session after a 201
 * or a 409 ALREADY_APPLIED (sc.2). On a fresh page load it is enabled and the first press answers 409 (decided with the product team).
 *
 * US-19 (OQ-25): two ways to apply. «Відгукнутися» stays the one-press apply with no note (US-18 sc.1, US-19 sc.3).
 * «Відгукнутися із запискою» opens a block with the optional note and «Підтвердити» (US-19 sc.1). The note is checked
 * with the shared schema before sending (sc.2); the API checks it again.
 */
export function ApplyButton({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const apply = useApply(taskId);
  const [noteOpen, setNoteOpen] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<{ note?: string }>({ resolver: zodResolver(createApplicationSchema), defaultValues: { note: '' } });
  const noteLength = (watch('note') ?? '').length;

  const errorCode = apply.isError ? (apply.error instanceof ApiClientError ? apply.error.code : 'UNKNOWN_ERROR') : null;
  const done = apply.isSuccess || errorCode === 'ALREADY_APPLIED';

  useEffect(() => {
    if (errorCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [errorCode, navigate]);

  return (
    <section aria-labelledby="apply-title">
      <h2 id="apply-title">Відгук на завдання</h2>
      <button type="button" disabled={apply.isPending || done} onClick={() => apply.mutate(undefined)}>
        Відгукнутися
      </button>{' '}
      <button type="button" disabled={apply.isPending || done} aria-expanded={noteOpen} onClick={() => setNoteOpen((open) => !open)}>
        Відгукнутися із запискою
      </button>

      {noteOpen && !done && (
        <form aria-label="Відгук із запискою" noValidate onSubmit={handleSubmit((values) => apply.mutate(values.note))}>
          <label htmlFor="apply-note">Записка замовнику (необов’язково)</label>
          <textarea id="apply-note" rows={4} aria-invalid={errors.note ? true : undefined} aria-describedby="apply-note-count" {...register('note')} />
          <p id="apply-note-count">
            {noteLength} / {LIMITS.applicationNoteMax}
          </p>
          {errors.note && <p role="alert">{messageFor(String(errors.note.message))}</p>}
          <button type="submit" disabled={apply.isPending}>
            Підтвердити
          </button>
        </form>
      )}

      {apply.isSuccess && <p role="status">Відгук надіслано</p>}

      {errorCode && errorCode !== 'AUTH_REQUIRED' && (
        <p role={errorCode === 'ALREADY_APPLIED' ? 'status' : 'alert'}>
          {messageFor(errorCode)}{' '}
          {errorCode === 'STUDENT_NOT_VERIFIED' && <Link to="/me/verification">Пройти верифікацію</Link>}
          {errorCode === 'EMAIL_NOT_CONFIRMED' && <Link to="/confirm-email">Підтвердити пошту</Link>}
        </p>
      )}
    </section>
  );
}
