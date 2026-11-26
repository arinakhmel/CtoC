import { PAGE_NAMES } from '../app/navigation';
import { useI18n } from '../lib/i18n';
import type { PageConfig } from '../routes.config';

/** English titles that differ from the short menu names (the landing page has a full sentence). */
const EN_TITLES: Record<string, string> = {
  '/': 'CtoC: micro-tasks for beginner students',
};

const CYRILLIC = /[а-яіїєґ]/i;

/**
 * The title of a page. Ukrainian: the title from overview.md §4, or the short Ukrainian name when that title is still an English
 * description written for the team. English: an English name.
 */
export function PageTitle({ page }: { page: PageConfig }) {
  const { lang } = useI18n();
  if (lang === 'uk') return <>{CYRILLIC.test(page.title) ? page.title : (PAGE_NAMES[page.path]?.uk ?? page.title)}</>;
  return <>{EN_TITLES[page.path] ?? PAGE_NAMES[page.path]?.en ?? page.title}</>;
}
