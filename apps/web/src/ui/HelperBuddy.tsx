import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';

/** The character: a soft paper square with a magnifying glass. Drawn inline, decorative. */
function Buddy() {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" className="buddy__svg">
      {/* body */}
      <rect x="8" y="14" width="40" height="40" rx="12" className="buddy__body" />
      {/* cheeks */}
      <rect x="14" y="38" width="6" height="3" rx="1.5" className="buddy__cheek" />
      <rect x="34" y="38" width="6" height="3" rx="1.5" className="buddy__cheek" />
      {/* eyes */}
      <rect x="19" y="28" width="4" height="7" rx="2" className="buddy__ink" />
      <rect x="33" y="28" width="4" height="7" rx="2" className="buddy__ink" />
      {/* smile */}
      <path d="M24 42 q4 3 8 0" className="buddy__line" />
      {/* tuft */}
      <path d="M26 14 q2 -6 6 -5" className="buddy__line" />
      {/* magnifying glass */}
      <g className="buddy__glass">
        <line x1="50" y1="44" x2="58" y2="54" className="buddy__handle" />
        <circle cx="46" cy="38" r="9" className="buddy__lens" />
        <path d="M41 35 q2 -3 5 -3" className="buddy__shine" />
      </g>
    </svg>
  );
}

/**
 * «Лупик», a small helper in the corner of every page. Hover or focus makes it hop; a click opens a short «Як це працює»
 * card with the way to the details. It never opens by itself. Escape or ✕ closes it.
 */
export function HelperBuddy() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
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
    <div className={`buddy${open ? ' is-open' : ''}`}>
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
        <Buddy />
        <span className="buddy__hint">{t('buddy.hint')}</span>
      </button>
    </div>
  );
}
