import { MESSAGES_UK } from '@ctoc/shared';
import { useEffect } from 'react';
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
 */
export function ApplyButton({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const apply = useApply(taskId);

  const errorCode = apply.isError ? (apply.error instanceof ApiClientError ? apply.error.code : 'UNKNOWN_ERROR') : null;
  const done = apply.isSuccess || errorCode === 'ALREADY_APPLIED';

  useEffect(() => {
    if (errorCode === 'AUTH_REQUIRED') navigate('/login', { replace: true });
  }, [errorCode, navigate]);

  return (
    <section aria-labelledby="apply-title">
      <h2 id="apply-title">Відгук на завдання</h2>
      <button type="button" disabled={apply.isPending || done} onClick={() => apply.mutate()}>
        Відгукнутися
      </button>

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
