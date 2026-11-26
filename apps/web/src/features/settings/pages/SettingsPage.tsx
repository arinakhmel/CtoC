import { formatCommission, MESSAGES_UK, percentToBp, updateSettingsSchema } from '@ctoc/shared';
import { useEffect, useState } from 'react';
import { useForm, type Resolver, type ResolverResult } from 'react-hook-form';
import { ApiClientError } from '../../../lib/api';
import type { PageConfig } from '../../../routes.config';
import { useModSettings, useUpdateSettings } from '../queries/settings';
import { PageTitle } from '../../../ui/PageTitle';

const messageFor = (code: string): string =>
  code === 'NETWORK_ERROR' ? 'Немає зв’язку із сервером. Спробуйте ще раз.' : ((MESSAGES_UK as Record<string, string>)[code] ?? MESSAGES_UK.INTERNAL_ERROR);

type FormValues = { percent: string };

/** The form types percent; the rate is the shared rule (`updateSettingsSchema`), applied to the percent turned into basis points. */
const resolver: Resolver<FormValues> = async (values): Promise<ResolverResult<FormValues>> => {
  const parsed = updateSettingsSchema.safeParse({ commissionBp: percentToBp(values.percent) });
  if (parsed.success) return { values, errors: {} };
  return { values: {}, errors: { percent: { type: 'validate', message: 'VALIDATION_FAILED' } } };
};

/** The percent field shows the stored rate as the visitor reads it on /terms, without the % sign. */
const toField = (bp: number): string => formatCommission(bp).replace('%', '').replace(/\s/g, '');

/** /mod/settings: US-03 sc.3. The moderator sets the commission in percent; the form checks it with the shared rule, the server again. */
export function SettingsPage({ page }: { page: PageConfig }) {
  const stored = useModSettings();
  const update = useUpdateSettings();
  const [saved, setSaved] = useState<number | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver, defaultValues: { percent: '' } });

  useEffect(() => {
    if (stored.data) reset({ percent: toField(stored.data.commissionBp) });
  }, [stored.data, reset]);

  const onSubmit = handleSubmit(({ percent }) => {
    setSaved(null);
    update.mutate({ commissionBp: percentToBp(percent) }, { onSuccess: (result) => setSaved(result.commissionBp) });
  });

  const loadError = stored.isError ? (stored.error instanceof ApiClientError ? stored.error.code : 'UNKNOWN_ERROR') : null;
  const saveError = update.isError ? (update.error instanceof ApiClientError ? update.error.code : 'UNKNOWN_ERROR') : null;

  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title"><PageTitle page={page} /></h1>
      {stored.isPending && <p role="status">Завантаження…</p>}
      {loadError && (
        <>
          <p role="alert">{messageFor(loadError)}</p>
          <button type="button" onClick={() => void stored.refetch()} disabled={stored.isFetching}>
            Спробувати ще раз
          </button>
        </>
      )}
      {stored.isSuccess && (
        <form aria-label="Комісія платформи" noValidate onSubmit={onSubmit}>
          <p>
            Зараз діє: <strong>{formatCommission(stored.data.commissionBp)}</strong>. Нова ставка діє для завдань, які будуть опубліковані після зміни;
            опубліковані завдання її не змінюють.
          </p>
          <label htmlFor="commission">Комісія, %</label>
          <input
            id="commission"
            inputMode="decimal"
            aria-invalid={errors.percent ? true : undefined}
            aria-describedby={errors.percent ? 'commission-error' : undefined}
            {...register('percent', {
              // A new edit makes the earlier «Збережено» and the earlier server error stale: remove them.
              onChange: () => {
                setSaved(null);
                update.reset();
              },
            })}
          />
          {errors.percent && (
            <p id="commission-error" role="alert">
              {MESSAGES_UK.VALIDATION_FAILED}
            </p>
          )}
          {saveError && <p role="alert">{messageFor(saveError)}</p>}
          {saved !== null && <p role="status">Збережено: {formatCommission(saved)}</p>}
          <button type="submit" disabled={update.isPending}>
            Зберегти
          </button>
        </form>
      )}
    </article>
  );
}
