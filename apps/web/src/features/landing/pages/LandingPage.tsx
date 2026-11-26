import type { PageConfig } from '../../../routes.config';
import { HowItWorks } from '../components/HowItWorks';

/**
 * `/`: the landing page. Built so far: the «Як це працює» block (US-02). The beginners-only message (US-01) and the commission line
 * (US-03, as on /terms) are added here when those stories are built.
 */
export function LandingPage({ page }: { page: PageConfig }) {
  return (
    <article aria-labelledby="page-title">
      <h1 id="page-title">{page.title}</h1>
      <HowItWorks />
    </article>
  );
}
