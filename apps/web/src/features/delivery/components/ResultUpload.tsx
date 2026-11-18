import { checkResultUpload, isResultEditable, MESSAGES_UK, RESULT_FILE_MESSAGES_UK } from '@ctoc/shared';
import { useRef, useState, type FormEvent } from 'react';
import { API_BASE_URL, ApiClientError } from '../../../lib/api';
import { useResult, useUploadResultFile, type ResultFile } from '../queries/result';

const MB = 1024 * 1024;
const sizeLabel = (bytes: number): string => (bytes >= MB ? `${(bytes / MB).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`);

/** Result texts for the two codes that read differently for a document (api.md §3), the common dictionary for the rest. */
const messageFor = (code: string): string => {
  if (code === 'NETWORK_ERROR') return 'Немає зв’язку із сервером. Спробуйте ще раз.';
  if (code === 'FILE_TYPE_NOT_ALLOWED' || code === 'FILE_TOO_LARGE') return RESULT_FILE_MESSAGES_UK[code];
  return (MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR;
};

const FileRow = ({ file }: { file: ResultFile }) => (
  <li>
    <a href={`${API_BASE_URL}/files/${encodeURIComponent(file.id)}`} download={file.name}>
      {file.name}
    </a>{' '}
    <span>({sizeLabel(file.sizeBytes)})</span>
  </li>
);

/**
 * US-27. The upload zone of the executor's card `/work/:taskId`: choose a file, «Зберегти результат», and the list of what is
 * already attached. The browser applies the same rules as the server (shared `checkResultUpload`) so a `.bat` or a file over
 * 50 MB is refused before it is sent; the server checks again, and also the content of the file.
 */
export function ResultUpload({ taskId, status }: { taskId: string; status: string | undefined }) {
  const result = useResult(taskId);
  const upload = useUploadResultFile(taskId);
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

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
  return (
    <section aria-labelledby="result-title">
      <h2 id="result-title">Результат</h2>

      {result.isError && <p role="alert">{messageFor(result.error instanceof ApiClientError ? result.error.code : 'UNKNOWN_ERROR')}</p>}

      {files.length > 0 ? (
        <ul aria-label="Завантажені файли">
          {files.map((item) => (
            <FileRow key={item.id} file={item} />
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
    </section>
  );
}
