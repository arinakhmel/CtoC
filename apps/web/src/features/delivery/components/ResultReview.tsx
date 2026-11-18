import { LIMITS, MESSAGES_UK, returnForRevisionSchema, type TaskStatus } from '@ctoc/shared';
import { useState, type FormEvent } from 'react';
import { API_BASE_URL, ApiClientError } from '../../../lib/api';
import { formatUah } from '../../../lib/money';
import { useAcceptResult, useResult, useReturnResult } from '../queries/result';
import { sizeLabel } from './ResultUpload';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/**
 * The comment is checked in the browser with the schema of the server (shared `returnForRevisionSchema`): empty or only spaces is
 * COMMENT_REQUIRED, over 2000 characters (after trimming) is COMMENT_TOO_LONG. The server checks it again.
 */
const commentErrorOf = (comment: string): string | null => {
  const parsed = returnForRevisionSchema.safeParse({ comment });
  if (parsed.success) return null;
  return messageFor(parsed.error.issues[0]?.message ?? 'VALIDATION_FAILED');
};

/**
 * US-31. The customer's side of the result on `/c/tasks/:id`: the files that the student sent for review, each a download link,
 * and «Прийняти результат». A click opens an inline confirmation, «Підтвердити» or «Скасувати» (the same as the select of a
 * student); only then is the result accepted, the deal closed and the student paid. The button exists only while the task is
 * `in_review`: once it is `done` there is none and the page says the deal is closed (sc.3). The server decides: a 409 is shown
 * and the page fetches the task again. A draft of the student is never shown here (the server does not return it).
 *
 * US-32, US-33. Next to it «На доопрацювання» opens a form with the comment, which is required: a counter «N / 2000», a message
 * when it is empty or too long, and «Надіслати» is off until the comment is valid. The text is never cut. After the return the
 * task is in revision, both buttons are gone, and the page keeps showing the comment that was sent.
 */
export function ResultReview({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const result = useResult(taskId);
  const accept = useAcceptResult(taskId);
  const giveBack = useReturnResult(taskId);
  const [confirming, setConfirming] = useState(false);
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);

  const files = result.data?.files ?? [];
  const acceptErrorCode = accept.isError ? (accept.error instanceof ApiClientError ? accept.error.code : 'UNKNOWN_ERROR') : null;
  const returnErrorCode = giveBack.isError ? (giveBack.error instanceof ApiClientError ? giveBack.error.code : 'UNKNOWN_ERROR') : null;
  const resultError = result.isError ? (result.error instanceof ApiClientError ? result.error.code : 'UNKNOWN_ERROR') : null;

  const length = comment.trim().length;
  const commentError = commentErrorOf(comment);
  const overLimit = length > LIMITS.revisionCommentMax;
  // «Required» is shown once the customer tried to send or typed something; «too long» at once, as the text grows past the limit.
  const shownCommentError = overLimit || touched ? commentError : null;
  const busy = accept.isPending || giveBack.isPending;
  const canDecide = status === 'in_review';

  const openReturn = () => {
    setReturning(true);
    setTouched(false);
    giveBack.reset();
  };
  const closeReturn = () => {
    setReturning(false);
    setComment('');
    setTouched(false);
  };
  const sendReturn = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (commentError) return;
    giveBack.mutate(comment, { onSuccess: closeReturn });
  };

  return (
    <section aria-labelledby="review-title">
      <h2 id="review-title">Результат виконавця</h2>

      {resultError && <p role="alert">{messageFor(resultError)}</p>}

      {files.length > 0 ? (
        <ul aria-label="Файли результату">
          {files.map((file) => (
            <li key={file.id}>
              <a href={`${API_BASE_URL}/files/${encodeURIComponent(file.id)}`} download={file.name}>
                {file.name}
              </a>{' '}
              <span>({sizeLabel(file.sizeBytes)})</span>
            </li>
          ))}
        </ul>
      ) : (
        result.isSuccess && <p>Файлів результату немає.</p>
      )}

      {canDecide && !returning && (
        confirming ? (
          <div role="group" aria-label="Підтвердження прийняття результату">
            <p>Прийняти результат і завершити угоду? Кошти буде розблоковано для виплати студенту, дію не можна скасувати.</p>
            <button type="button" disabled={busy} onClick={() => accept.mutate(undefined, { onSettled: () => setConfirming(false) })}>
              Підтвердити
            </button>{' '}
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
              Скасувати
            </button>
          </div>
        ) : (
          <p>
            <button type="button" disabled={busy} onClick={() => setConfirming(true)}>
              Прийняти результат
            </button>{' '}
            <button type="button" disabled={busy} onClick={openReturn}>
              На доопрацювання
            </button>
          </p>
        )
      )}

      {canDecide && returning && (
        <form onSubmit={sendReturn} noValidate aria-label="Повернення на доопрацювання">
          <p>
            <label htmlFor="return-comment">Коментар до доопрацювання</label>
            <br />
            <textarea
              id="return-comment"
              rows={5}
              value={comment}
              aria-describedby={shownCommentError ? 'return-comment-counter return-comment-error' : 'return-comment-counter'}
              aria-invalid={shownCommentError ? true : undefined}
              onChange={(event) => setComment(event.target.value)}
            />
          </p>
          <p id="return-comment-counter" aria-label="Кількість символів">
            {length} / {LIMITS.revisionCommentMax}
          </p>
          {shownCommentError && (
            <p id="return-comment-error" role="alert">
              {shownCommentError}
            </p>
          )}
          <button type="submit" disabled={busy || overLimit}>
            Надіслати
          </button>{' '}
          <button type="button" disabled={busy} onClick={closeReturn}>
            Скасувати
          </button>
        </form>
      )}

      {status === 'revision' && result.data?.lastReturn && (
        <section aria-labelledby="sent-back-title">
          <h3 id="sent-back-title">Ваш коментар до доопрацювання</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{result.data.lastReturn.comment}</p>
        </section>
      )}

      {status === 'done' && <p role="status">Угоду завершено: результат прийнято, виплату студенту нараховано.</p>}

      {/* Outside the blocks above: the page fetches the task again after a 409 and they go away, the message must stay. */}
      {accept.isSuccess && <p role="status">Результат прийнято. Студенту нараховано {formatUah(accept.data.payout.netKopecks)}.</p>}
      {giveBack.isSuccess && <p role="status">Результат повернуто студенту. Він побачить ваш коментар і зможе завантажити нову версію.</p>}
      {acceptErrorCode && <p role="alert">{messageFor(acceptErrorCode)}</p>}
      {returnErrorCode && <p role="alert">{messageFor(returnErrorCode)}</p>}
    </section>
  );
}
