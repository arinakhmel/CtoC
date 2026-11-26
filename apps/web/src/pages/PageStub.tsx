import { Link } from 'react-router-dom';
import { storiesUrl } from '../lib/docs';
import type { PageConfig } from '../routes.config';
import { PageTitle } from '../ui/PageTitle';

/** Placeholder for a page that is not built yet: its title, a short note, the stories it will implement and the way home. */
export function PageStub({ page }: { page: PageConfig }) {
  return (
    <article aria-labelledby="page-title" className="page-stub">
      <h1 id="page-title">
        <PageTitle page={page} />
      </h1>
      <p className="page-lead">Ця сторінка ще в роботі. Скоро тут з’явиться все, що потрібно.</p>
      <section aria-labelledby="stories-title">
        <h2 id="stories-title">Що тут буде</h2>
        {page.stories.length > 0 ? (
          <ul className="story-tags">
            {page.stories.map((id) => (
              <li key={id}>
                <a href={storiesUrl()} target="_blank" rel="noreferrer">
                  {id}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>Для цієї сторінки ще немає історії (див. «Open questions» у docs/architecture/overview.md).</p>
        )}
      </section>
      <p>
        <Link to="/">← На головну</Link>
      </p>
    </article>
  );
}
