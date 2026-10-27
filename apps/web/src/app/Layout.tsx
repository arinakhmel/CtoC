import { Link, Outlet } from 'react-router-dom';
import { useApiHealth } from '../lib/useApiHealth';
import { PAGES } from '../routes.config';

/** Minimal layout: header with the page index, the page, and the API status. No styling beyond index.css. */
export const hrefFor = (path: string) => path.replace(/:\w+/g, 'example');

const STATUS_TEXT = { checking: 'API: checking…', ok: 'API: ok', unavailable: 'API: unavailable' } as const;

export function Layout() {
  const health = useApiHealth();
  return (
    <>
      <header>
        <strong>CtoC</strong>
        <nav aria-label="Pages">
          <ul>
            {PAGES.map((page) => (
              <li key={page.path}>
                <Link to={hrefFor(page.path)}>{page.path}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer>
        <p role="status">{STATUS_TEXT[health]}</p>
      </footer>
    </>
  );
}
