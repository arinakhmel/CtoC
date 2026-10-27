import { Link } from 'react-router-dom';
import { storiesUrl } from '../lib/docs';
import type { PageConfig } from '../routes.config';

/** Placeholder for a page that is not built yet: its title, the stories it implements and a way back. */
export function PageStub({ page }: { page: PageConfig }) {
  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>
      <p>
        Route <code>{page.path}</code>. Access: {page.access}. Not implemented yet.
      </p>
      <section aria-labelledby="stories-title">
        <h2 id="stories-title">Stories</h2>
        {page.stories.length > 0 ? (
          <ul>
            {page.stories.map((id) => (
              <li key={id}>
                <a href={storiesUrl()} target="_blank" rel="noreferrer">
                  {id}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No story yet (see Open questions in docs/architecture/overview.md).</p>
        )}
      </section>
      <p>
        <Link to="/">All pages</Link>
      </p>
    </article>
  );
}
