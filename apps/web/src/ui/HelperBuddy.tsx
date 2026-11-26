import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { BuddyFigure } from './BuddyFigure';

/**
 * «Лупик», a small helper in the corner of every page. Hover or focus makes it hop; a click opens a short «Як це працює»
 * card with the way to the details. It never opens by itself. Escape or ✕ closes it.
 */
export function HelperBuddy() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // The arrival walk plays once per tab (sessionStorage), not on every page change.
  const [arriving] = useState(() => {
    try {
      if (window.sessionStorage.getItem('ctoc.buddyArrived')) return false;
      window.sessionStorage.setItem('ctoc.buddyArrived', '1');
      return true;
    } catch {
      return false;
    }
  });
  const cardId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`buddy${open ? ' is-open' : ''}${arriving ? ' is-arriving' : ''}`}>
      {open && (
        <div id={cardId} className="buddy__card" role="dialog" aria-label={t('buddy.title')}>
          <button type="button" className="buddy__close" aria-label={t('buddy.close')} onClick={() => setOpen(false)}>
            <span aria-hidden="true">✕</span>
          </button>
          <p className="buddy__title">{t('buddy.title')}</p>
          <ol className="buddy__steps">
            <li>{t('buddy.step1')}</li>
            <li>{t('buddy.step2')}</li>
            <li>{t('buddy.step3')}</li>
          </ol>
          <Link className="buddy__more" to="/payment-safety" onClick={() => setOpen(false)}>
            {t('buddy.more')} →
          </Link>
        </div>
      )}
      <button ref={buttonRef} type="button" className="buddy__button" aria-expanded={open} aria-controls={open ? cardId : undefined} onClick={() => setOpen((value) => !value)}>
        <BuddyFigure />
        <span className="buddy__hint">{t('buddy.hint')}</span>
      </button>
    </div>
  );
}
