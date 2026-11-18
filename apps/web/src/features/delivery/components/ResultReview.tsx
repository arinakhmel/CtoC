import { MESSAGES_UK, type TaskStatus } from '@ctoc/shared';
import { useState } from 'react';
import { API_BASE_URL, ApiClientError } from '../../../lib/api';
import { formatUah } from '../../../lib/money';
import { useAcceptResult, useResult } from '../queries/result';
import { sizeLabel } from './ResultUpload';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/**
 * US-31. The customer's side of the result on `/c/tasks/:id`: the files that the student sent for review, each a download link,
 * and «Прийняти результат». A click opens an inline confirmation, «Підтвердити» or «Скасувати» (the same as the select of a
 * student); only then is the result accepted, the deal closed and the student paid. The button exists only while the task is
 * `in_review`: once it is `done` there is none and the page says the deal is closed (sc.3). The server decides: a 409 is shown
 * and the page fetches the task again. A draft of the student is never shown here (the server does not return it).
 */
export function ResultReview({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const result = useResult(taskId);
  const accept = useAcceptResult(taskId);
  const [confirming, setConfirming] = useState(false);

  const files = result.data?.files ?? [];
  const errorCode = accept.isError ? (accept.error instanceof ApiClientError ? accept.error.code : 'UNKNOWN_ERROR') : null;
  const resultError = result.isError ? (result.error instanceof ApiClientError ? result.error.code : 'UNKNOWN_ERROR') : null;

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

      {status === 'in_review' &&
        (confirming ? (
          <div role="group" aria-label="Підтвердження прийняття результату">
            <p>Прийняти результат і завершити угоду? Кошти буде розблоковано для виплати студенту, дію не можна скасувати.</p>
            <button type="button" disabled={accept.isPending} onClick={() => accept.mutate(undefined, { onSettled: () => setConfirming(false) })}>
              Підтвердити
            </button>{' '}
            <button type="button" disabled={accept.isPending} onClick={() => setConfirming(false)}>
              Скасувати
            </button>
          </div>
        ) : (
          <button type="button" disabled={accept.isPending} onClick={() => setConfirming(true)}>
            Прийняти результат
          </button>
        ))}

      {status === 'done' && <p role="status">Угоду завершено: результат прийнято, виплату студенту нараховано.</p>}

      {/* Outside the blocks above: the page fetches the task again after a 409 and they go away, the message must stay. */}
      {accept.isSuccess && <p role="status">Результат прийнято. Студенту нараховано {formatUah(accept.data.payout.netKopecks)}.</p>}
      {errorCode && <p role="alert">{messageFor(errorCode)}</p>}
    </section>
  );
}
