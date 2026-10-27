// Infrastructure test: protects overview.md §4. If the page table and the router drift apart,
// the failing assertion names the route.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAGES } from '../src/routes.config';

const overview = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/architecture/overview.md'),
  'utf8',
);
const section = overview.split('## 4. Frontend pages mapped to stories')[1]!.split('## 5.')[0]!;
const rows = [...section.matchAll(/^\| `(\/[^`]*)` \| (.*?) \| (.*?) \| (.*?) \|$/gm)].map((m) => ({
  path: m[1]!,
  title: m[2]!.replace(/"/g, '').trim(),
  access: m[3]!.trim(),
  stories: [...new Set(m[4]!.match(/US-\d\d/g) ?? [])],
}));

describe('overview.md §4: frontend pages mapped to stories', () => {
  it('has the same pages, titles, access codes and stories as routes.config.ts', () => {
    expect(PAGES).toEqual(rows);
  });

  it('covers every story from US-01 to US-50', () => {
    const covered = new Set(PAGES.flatMap((page) => page.stories));
    const missing = Array.from({ length: 50 }, (_, i) => `US-${String(i + 1).padStart(2, '0')}`).filter((id) => !covered.has(id));
    expect(missing).toEqual([]);
  });

  it('has no duplicate routes', () => {
    expect(new Set(PAGES.map((page) => page.path)).size).toBe(PAGES.length);
  });
});
