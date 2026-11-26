import { formatCommission, MESSAGES_UK } from '@ctoc/shared';
import { ApiClientError } from '../../../lib/api';
import type { PageConfig } from '../../../routes.config';
import { usePublicSettings } from '../queries/settings';

/**
 * /terms: US-03 sc.1, sc.3. The commission of the platform as digits, for a visitor who has no account. Nothing is shown in its
 * place while the rate is unknown: a guessed number would be worse than an error (sc.2 treats a missing commission as a defect).
 */
export function TermsPage({ page }: { page: PageConfig }) {
  const settings = usePublicSettings();
  const code = settings.error instanceof ApiClientError ? settings.error.code : 'UNKNOWN_ERROR';

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>

      <section aria-labelledby="commission-title">
        <h2 id="commission-title">Комісія платформи</h2>
        {settings.isPending && <p role="status">Завантаження…</p>}
        {settings.isSuccess && (
          <p>
            Комісія CtoC: <strong>{formatCommission(settings.data.commissionBp)}</strong> від ціни завдання. Її утримують із виплати студентові, інших
            прихованих платежів немає.
          </p>
        )}
        {settings.isError && (
          <>
            <p role="alert">{code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : MESSAGES_UK.INTERNAL_ERROR}</p>
            <button type="button" onClick={() => void settings.refetch()} disabled={settings.isFetching}>
              Спробувати ще раз
            </button>
          </>
        )}
      </section>
    </article>
  );
}
