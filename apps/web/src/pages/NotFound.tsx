import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';

/** Any address that is not a route: a big «404» stamp, a line of text and the way home. */
export function NotFound() {
  const { t } = useI18n();
  return (
    <article aria-labelledby="not-found-title" className="not-found">
      <p className="not-found__code" aria-hidden="true">
        404
      </p>
      <h1 id="not-found-title">{t('notFound.title')}</h1>
      <p>{t('notFound.text')}</p>
      <p>
        <Link to="/">{t('notFound.home')}</Link>
      </p>
    </article>
  );
}
