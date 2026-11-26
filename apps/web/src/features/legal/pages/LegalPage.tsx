import { marked } from 'marked';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import privacy from '../../../../../../docs/legal/privacy-policy.md?raw';
import safeDeal from '../../../../../../docs/legal/safe-deal-and-commission.md?raw';
import terms from '../../../../../../docs/legal/terms-of-use.md?raw';
import type { PageConfig } from '../../../routes.config';

/** The legal documents live once, in docs/legal/; the site shows the same files. */
const SOURCES: Record<string, string> = {
  '/legal/terms': terms,
  '/legal/privacy': privacy,
  '/legal/safe-deal': safeDeal,
};

/** Links between the documents point at their pages; the link to the repo index (README) is dropped. */
const LINKS: [RegExp, string][] = [
  [/\]\(terms-of-use\.md(#[^)]*)?\)/g, '](/legal/terms$1)'],
  [/\]\(privacy-policy\.md(#[^)]*)?\)/g, '](/legal/privacy$1)'],
  [/\]\(safe-deal-and-commission\.md(#[^)]*)?\)/g, '](/legal/safe-deal$1)'],
  [/\[([^\]]+)\]\(README\.md[^)]*\)/g, '$1'],
];

export const LEGAL_PAGES = Object.keys(SOURCES);

/**
 * /legal/*: a document from docs/legal/ as a readable page. The Markdown is our own text from the repository (not user input),
 * so it is rendered as HTML. Its first heading is the page heading; the page keeps one <h1>.
 */
export function LegalPage({ page }: { page: PageConfig }) {
  const html = useMemo(() => {
    let text = SOURCES[page.path] ?? '';
    for (const [pattern, replacement] of LINKS) text = text.replace(pattern, replacement);
    text = text.replace(/^# .*\n/, ''); // the title comes from the page heading below
    return marked.parse(text, { async: false }) as string;
  }, [page.path]);

  return (
    <article aria-labelledby="page-title" className="legal-page">
      <p className="legal-page__kicker">Документи CtoC</p>
      <h1 id="page-title">{page.title}</h1>
      <nav aria-label="Документи" className="legal-page__tabs">
        <Link to="/legal/terms" aria-current={page.path === '/legal/terms' ? 'page' : undefined}>
          Умови
        </Link>
        <Link to="/legal/privacy" aria-current={page.path === '/legal/privacy' ? 'page' : undefined}>
          Конфіденційність
        </Link>
        <Link to="/legal/safe-deal" aria-current={page.path === '/legal/safe-deal' ? 'page' : undefined}>
          Безпечна угода
        </Link>
      </nav>
      <div className="legal-page__body" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
