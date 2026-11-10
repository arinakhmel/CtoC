import { checkDocumentUpload, MESSAGES_UK } from '@ctoc/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../../../lib/api';
import type { PageConfig } from '../../../routes.config';
import { getMyVerification, submitVerification, type Verification } from '../queries/verification';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

/** /me/verification: US-08. A student uploads a JPG, PNG or PDF and sees the status of the request. */
export function VerificationPage({ page }: { page: PageConfig }) {
  const [loaded, setLoaded] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getMyVerification().then(
      (result) => {
        if (!active) return;
        setVerification(result.verification);
        setLoaded(true);
      },
      (error: unknown) => {
        if (!active) return;
        setLoadError(messageFor(error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR'));
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!file) {
      setFormError(messageFor('VALIDATION_FAILED'));
      return;
    }
    // The same rules as the server (shared). The server still checks the content of the file.
    const rejected = checkDocumentUpload({ mime: file.type, sizeBytes: file.size, fileName: file.name });
    if (rejected) {
      setFormError(messageFor(rejected));
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitVerification(file);
      setVerification(result.verification);
      setFile(null);
    } catch (error) {
      setFormError(messageFor(error instanceof ApiClientError ? error.code : 'UNKNOWN_ERROR'));
    } finally {
      setSubmitting(false);
    }
  };

  const pending = verification?.status === 'pending';
  const approved = verification?.status === 'approved';

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>

      {loadError && (
        <p role="alert">
          {loadError}{' '}
          <Link to="/login">Увійти</Link>
        </p>
      )}

      {loaded && !loadError && verification && (
        <section aria-labelledby="status-title">
          <h2 id="status-title">Статус запиту</h2>
          <p role="status">{verification.label}</p>
          {verification.status === 'rejected' && verification.reason && <p>Причина: {verification.reason}</p>}
        </section>
      )}

      {loaded && !loadError && !pending && !approved && (
        <form onSubmit={onSubmit} noValidate aria-label="Підтвердження статусу студента">
          <p>
            <label htmlFor="document">Студентський квиток або довідка (JPG, PNG або PDF, до 10 МБ)</label>
            <input
              id="document"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              aria-describedby="document-error"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </p>
          <p id="document-error" role="alert">
            {formError}
          </p>
          <button type="submit" disabled={submitting}>
            Надіслати на перевірку
          </button>
        </form>
      )}

      <p>
        <Link to="/">All pages</Link>
      </p>
    </article>
  );
}
