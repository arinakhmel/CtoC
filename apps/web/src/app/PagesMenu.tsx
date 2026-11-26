import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { useI18n, type MessageKey } from '../lib/i18n';
import { PAGES, type PageConfig } from '../routes.config';
import { PAGE_NAMES } from './navigation';

export const hrefFor = (path: string) => path.replace(/:\w+/g, 'example');

/** Groups of the index by the access code of overview.md §4 (its first letter). */
const GROUPS: {
  id: string;
  label: MessageKey;
  test: (page: PageConfig) => boolean;
}[] = [
  {
    id: 'public',
    label: 'pages.public',
    test: (page) => page.access.startsWith('P'),
  },
  {
    id: 'student',
    label: 'pages.student',
    test: (page) => page.access.startsWith('S'),
  },
  {
    id: 'customer',
    label: 'pages.customer',
    test: (page) => page.access.startsWith('C'),
  },
  {
    id: 'moderator',
    label: 'pages.moderator',
    test: (page) => page.access.startsWith('M'),
  },
  {
    id: 'account',
    label: 'pages.account',
    test: (page) => page.access.startsWith('A'),
  },
];

/**
 * «Усі сторінки»: the index of every route (a development aid for the team), behind a button with three bars in the header.
 * The panel is a disclosure: Escape, the backdrop or opening a page closes it, and the focus goes back to the button.
 * Each link is the human name of the page; the route itself is not shown.
 */
export function PagesMenu() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
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
    <>
      <button ref={buttonRef} type="button" className="menu-button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <span className="menu-button__bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="menu-button__text">{t('pages.button')}</span>
      </button>
      {/* In a portal: the sticky header blurs its background, and that would trap a fixed panel inside it. */}
      {createPortal(
        <>
          <div className="pages-backdrop" hidden={!open} onClick={() => setOpen(false)} />
          <div ref={panelRef} id={panelId} className="pages-panel" hidden={!open} tabIndex={-1}>
            <nav className="site-nav" aria-label="Pages">
              <p className="pages-panel__title">{t('pages.title')}</p>
              <p className="pages-panel__hint">{t('pages.hint')}</p>
              {GROUPS.map((group) => {
                const pages = PAGES.filter(group.test);
                if (pages.length === 0) return null;
                return (
                  <section key={group.id} aria-label={t(group.label)}>
                    <h2 className="pages-panel__group">{t(group.label)}</h2>
                    <ul>
                      {pages.map((page) => (
                        <li key={page.path} className={page.path.includes(':') ? 'is-template' : undefined}>
                          <NavLink to={hrefFor(page.path)} end>
                            {PAGE_NAMES[page.path]?.[lang] ?? page.title}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </nav>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
