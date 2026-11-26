import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';

/** A round-cornered «↑» beside the helper: it appears after a screen of scrolling and takes you back to the top. */
export function ScrollTop() {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toTop = () => {
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    document.getElementById('main')?.focus({ preventScroll: true });
  };

  return (
    <button type="button" className={`scroll-top${shown ? ' is-shown' : ''}`} aria-label={t('layout.toTop')} tabIndex={shown ? 0 : -1} aria-hidden={!shown} onClick={toTop}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
