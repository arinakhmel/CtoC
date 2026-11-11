import { Link, NavLink, Outlet } from 'react-router-dom';
import { useApiHealth } from '../lib/useApiHealth';
import { PAGES } from '../routes.config';

/** Layout: skip link, header with the page index, the page, and the API status. Styles are in index.css. */
export const hrefFor = (path: string) => path.replace(/:\w+/g, 'example');

const STATUS_TEXT = { checking: 'API: checking…', ok: 'API: ok', unavailable: 'API: unavailable' } as const;

export function Layout() {
  const health = useApiHealth();
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти до змісту
      </a>
      <header className="site-header">
        <div className="container header-bar">
          <Link className="brand" to="/" aria-label="CtoC, на головну">
            Cto<span>C</span>
          </Link>
          <div className="header-actions">
            <Link className="link-plain" to="/login">
              Вхід
            </Link>
            <Link className="link-pill" to="/register">
              Почати безкоштовно
            </Link>
          </div>
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
    </>
  );
}
