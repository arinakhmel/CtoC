import { QueryClientProvider } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { isAnonymous, ME_KEY, useLogout, useMe } from '../features/identity/queries/session';
import { createQueryClient } from '../lib/queryClient';
import { useApiHealth } from '../lib/useApiHealth';
import { PAGES } from '../routes.config';

/** Layout: skip link, header with the page index, the page, and the API status. Styles are in index.css. */
export const hrefFor = (path: string) => path.replace(/:\w+/g, 'example');

const STATUS_TEXT = { checking: 'API: checking…', ok: 'API: ok', unavailable: 'API: unavailable' } as const;

/** The header actions: «Вийти» for a logged-in user (US-46), the login and sign-up links for a visitor. */
function HeaderActions() {
  const navigate = useNavigate();
  const me = useMe();
  // `flushSync`: the old page is gone before the guard looks at the 401 of `GET /api/me` again.
  const logout = useLogout(() => navigate('/', { flushSync: true }));
  // After a 401 the query keeps its last data, so a session that has ended is told apart by the error.
  if (me.data?.user && !isAnonymous(me.error)) {
    return (
      <div className="header-actions">
        <button type="button" className="link-pill" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Вийти
        </button>
        {logout.isError && <span role="alert">Не вдалося вийти. Спробуйте ще раз.</span>}
      </div>
    );
  }
  return (
    <div className="header-actions">
      <Link className="link-plain" to="/login">
        Вхід
      </Link>
      <Link className="link-pill" to="/register">
        Почати безкоштовно
      </Link>
    </div>
  );
}

export function Layout() {
  const health = useApiHealth();
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
      <a className="skip-link" href="#main">
        Перейти до змісту
      </a>
      <header className="site-header">
        <div className="container header-bar">
          <Link className="brand" to="/" aria-label="CtoC, на головну">
            Cto<span>C</span>
          </Link>
          <HeaderActions />
        </div>
        <nav className="site-nav" aria-label="Pages">
          <ul>
            {PAGES.map((page) => (
              <li key={page.path}>
                <NavLink to={hrefFor(page.path)} end>
                  {page.path}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">
          <p role="status">{STATUS_TEXT[health]}</p>
        </div>
      </footer>
    </QueryClientProvider>
  );
}
