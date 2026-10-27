import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <article aria-labelledby="not-found-title">
      <h1 id="not-found-title">Page not found</h1>
      <p>There is no page at this address.</p>
      <p>
        <Link to="/">All pages</Link>
      </p>
    </article>
  );
}
