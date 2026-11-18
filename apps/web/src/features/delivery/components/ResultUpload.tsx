import { checkResultUpload, isResultEditable, MESSAGES_UK, RESULT_FILE_MESSAGES_UK } from '@ctoc/shared';
import { useRef, useState, type FormEvent } from 'react';
import { API_BASE_URL, ApiClientError } from '../../../lib/api';
import { useDeleteResultFile, useResult, useSubmitResult, useUploadResultFile, type ResultFile } from '../queries/result';

const MB = 1024 * 1024;
const sizeLabel = (bytes: number): string => (bytes >= MB ? `${(bytes / MB).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`);

/** Result texts for the two codes that read differently for a document (api.md §3), the common dictionary for the rest. */
const messageFor = (code: string): string => {
  if (code === 'NETWORK_ERROR') return 'Немає зв’язку із сервером. Спробуйте ще раз.';
  if (code === 'FILE_TYPE_NOT_ALLOWED' || code === 'FILE_TOO_LARGE') return RESULT_FILE_MESSAGES_UK[code];
  return (MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR;
};

const FileRow = ({ file, onDelete, deleteDisabled }: { file: ResultFile; onDelete?: () => void; deleteDisabled?: boolean }) => (
  <li>
    <a href={`${API_BASE_URL}/files/${encodeURIComponent(file.id)}`} download={file.name}>
      {file.name}
    </a>{' '}
    <span>({sizeLabel(file.sizeBytes)})</span>
    {onDelete && (
      <>
        {' '}
        <button type="button" disabled={deleteDisabled} aria-label={`Видалити файл ${file.name}`} onClick={onDelete}>
          Видалити
        </button>
      </>
    )}
  </li>
);

/**
 * US-27. The upload zone of the executor's card `/work/:taskId`: choose a file, «Зберегти результат», and the list of what is
 * already attached. The browser applies the same rules as the server (shared `checkResultUpload`) so a `.bat` or a file over
 * 50 MB is refused before it is sent; the server checks again, and also the content of the file.
 *
 * US-28. «Надіслати на перевірку» sends the saved files to the customer. It is disabled while there is no file (sc.2) and while
 * a request runs (a double click, sc.3); if the server still refuses, its code is shown. After success the task is `in_review`,
 * so the form and the button go away and the page shows the new status.
 *
 * US-29. A file of the draft can be deleted while the task is editable. In review nothing can be changed (sc.3): there is no
 * form, no «Видалити» and no send button, and a note says why. The server decides: a 409 is shown and the page fetches the task
 * again. A returned or submitted version has no «Видалити» either (its files are fixed, INV-16).
 */
export function ResultUpload({ taskId, status }: { taskId: string; status: string | undefined }) {
  const result = useResult(taskId);
  const upload = useUploadResultFile(taskId);
  const submit = useSubmitResult(taskId);
  const remove = useDeleteResultFile(taskId);
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const onDelete = async (fileId: string) => {
    setRemoveError(null);
    try {
      await remove.mutateAsync(fileId);
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR';
      if (code !== 'NOT_FOUND') setRemoveError(messageFor(code)); // a file that is already gone needs no message: the list is fetched again
    }
  };

  const onSendForReview = async () => {
    setSubmitError(null);
    try {
      await submit.mutateAsync();
    } catch (error) {
      setSubmitError(messageFor(error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR'));
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!file) {
      setFormError('Оберіть файл результату');
      return;
    }
    const rejected = checkResultUpload({ mime: file.type, sizeBytes: file.size, fileName: file.name });
    if (rejected) {
      setFormError(messageFor(rejected));
      return;
    }
    try {
      await upload.mutateAsync(file);
      setFile(null);
      if (input.current) input.current.value = '';
    } catch (error) {
      setFormError(messageFor(error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR'));
    }
  };

  const files = result.data?.files ?? [];
  const canDelete = isResultEditable(status) && result.data?.status === 'draft';
  return (
    <section aria-labelledby="result-title">
      <h2 id="result-title">Результат</h2>

      {result.isError && <p role="alert">{messageFor(result.error instanceof ApiClientError ? result.error.code : 'UNKNOWN_ERROR')}</p>}

      {files.length > 0 ? (
        <ul aria-label="Завантажені файли">
          {files.map((item) => (
            <FileRow key={item.id} file={item} deleteDisabled={remove.isPending || submit.isPending} {...(canDelete ? { onDelete: () => void onDelete(item.id) } : {})} />
          ))}
        </ul>
      ) : (
        result.isSuccess && <p>Файлів результату ще немає.</p>
      )}

      {isResultEditable(status) && (
        <form onSubmit={onSubmit} noValidate aria-label="Завантаження результату">
          <p>
            <label htmlFor="result-file">Файл результату (до 50 МБ)</label>
            <input
              id="result-file"
              ref={input}
              type="file"
              aria-describedby={formError ? 'result-file-error' : undefined}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </p>
          {formError && (
            <p id="result-file-error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" disabled={upload.isPending}>
            Зберегти результат
          </button>
        </form>
      )}

      {isResultEditable(status) && (
        <div>
          <p>
            <button
              type="button"
              disabled={files.length === 0 || upload.isPending || submit.isPending}
              aria-describedby={files.length === 0 ? 'submit-hint' : undefined}
              onClick={onSendForReview}
            >
              Надіслати на перевірку
            </button>
          </p>
          {files.length === 0 && <p id="submit-hint">Щоб надіслати результат, спочатку збережіть хоча б один файл.</p>}
        </div>
      )}

      {status === 'in_review' && <p role="status">Результат на перевірці, редагування заблоковано до рішення замовника.</p>}

      {/* Outside the blocks above: after a 409 the page fetches the task again and they go away, the message must stay. */}
      {submitError && <p role="alert">{submitError}</p>}
      {removeError && <p role="alert">{removeError}</p>}

      {submit.isSuccess && <p role="status">Результат надіслано на перевірку. Замовник отримав сповіщення.</p>}
    </section>
  );
}
