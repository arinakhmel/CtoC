import { QueryClientProvider } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { isAnonymous, ME_KEY, useLogout, useMe } from '../features/identity/queries/session';
import { I18nProvider, useI18n } from '../lib/i18n';
import { createQueryClient } from '../lib/queryClient';
import { useApiHealth } from '../lib/useApiHealth';
import { Preferences } from '../ui/Preferences';
import { menuFor } from './navigation';
import { PagesMenu } from './PagesMenu';

/** Layout: skip link, ticker, header with the role menu, the page index, preferences and account actions, the page, and the footer. */
export { hrefFor } from './PagesMenu';

const STATUS_TEXT = { checking: 'API: checking…', ok: 'API: ok', unavailable: 'API: unavailable' } as const;

/** The current user, or null for a visitor. After a 401 the query keeps its last data, so an ended session is told apart by the error. */
function useCurrentUser() {
  const me = useMe();
  return me.data?.user && !isAnonymous(me.error) ? me.data.user : null;
}

/** The header actions: «Вийти» for a logged-in user (US-46), the login and sign-up links for a visitor. */
function HeaderActions() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const { t } = useI18n();
  // `flushSync`: the old page is gone before the guard looks at the 401 of `GET /api/me` again.
  const logout = useLogout(() => navigate('/', { flushSync: true }));
  if (user) {
    return (
      <div className="header-actions">
        <button type="button" className="link-pill" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {t('layout.logout')}
        </button>
        {logout.isError && <span role="alert">{t('layout.logoutError')}</span>}
      </div>
    );
  }
  return (
    <div className="header-actions">
      <Link className="link-plain" to="/login">
        {t('layout.login')}
      </Link>
      <Link className="link-pill" to="/register">
        {t('layout.start')}
      </Link>
    </div>
  );
}

/** The main menu, filtered by the role of the user (navigation.ts). */
function MainMenu() {
  const user = useCurrentUser();
  const { t } = useI18n();
  return (
    <nav className="main-nav" aria-label={t('layout.menu')}>
      <ul>
        {menuFor(user).map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end}>
              {t(item.label)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Footer() {
  const health = useApiHealth();
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <p className="brand" aria-hidden="true">
              Cto<span>C</span>
            </p>
            <p>{t('layout.footerAbout')}</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>{t('layout.footerMade')}</p>
          <p role="status" className="api-status" data-health={health}>
            {STATUS_TEXT[health]}
          </p>
        </div>
      </div>
    </footer>
  );
}

function Shell() {
  const { t } = useI18n();
  return (
    <>
      <a className="skip-link" href="#main">
        {t('layout.skip')}
      </a>
      <div className="ticker">
        <div className="container">
          <p>
            {t('layout.ticker')
              .split('|')
              .map((part) => (
                <span key={part}>{part}</span>
              ))}
          </p>
        </div>
      </div>
      <header className="site-header">
        <div className="container header-bar">
          <PagesMenu />
          <Link className="brand" to="/" aria-label={t('layout.home')}>
            Cto<span>C</span>
          </Link>
          <MainMenu />
          <Preferences />
          <HeaderActions />
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

export function Layout() {
  const navigate = useNavigate();
  // The client is made once, so its handler reads the latest `navigate` through a ref.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // Inside the router, so the real app and every test router get their own client (no cache shared between tests).
  // US-46/S3: a 401 AUTH_REQUIRED from any call means the session is over: forget the user, open /login with the message.
  const [queryClient] = useState(() =>
    createQueryClient((client) => {
      void client.invalidateQueries({ queryKey: ME_KEY });
      navigateRef.current('/login', { replace: true, state: { notice: 'AUTH_REQUIRED' } });
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <Shell />
      </I18nProvider>
    </QueryClientProvider>
  );
}
