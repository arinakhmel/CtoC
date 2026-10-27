// Infrastructure tests: each one protects a section of the design documents. If a document and the
// code drift apart, the test name tells you which section to look at.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ERROR_STATUS, MESSAGES_UK, NOTIFICATION_TYPES, TASK_STATUSES, APPLICATION_STATUSES, VERIFICATION_STATUSES } from '../src';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const doc = (name: string) => readFileSync(resolve(repoRoot, 'docs/architecture', name), 'utf8');

describe('api.md §3 error code dictionary', () => {
  const section = doc('api.md').split('## 3. Error code dictionary')[1]!.split('## 4.')[0]!;
  const rows = [...section.matchAll(/^\| (\d{3}) \| `([A-Z_]+)` \|/gm)].map((m) => [m[2]!, Number(m[1])] as const);

  it('lists every code of ERROR_STATUS with the same HTTP status', () => {
    expect(Object.fromEntries(rows)).toEqual(ERROR_STATUS);
  });

  it('has a default Ukrainian message for every code, equal to the first quoted text of the row', () => {
    expect(Object.keys(MESSAGES_UK).sort()).toEqual(Object.keys(ERROR_STATUS).sort());
    for (const [code, message] of Object.entries(MESSAGES_UK)) {
      const row = section.split('\n').find((line) => line.includes(`\`${code}\``))!;
      expect(row, code).toContain(message);
    }
  });

  it('uses only the statuses 400, 401, 403, 404, 409, 422, 429 and 500', () => {
    expect(new Set(Object.values(ERROR_STATUS))).toEqual(new Set([400, 401, 403, 404, 409, 422, 429, 500]));
  });
});

describe('domain-model.md §3 state machines', () => {
  const domain = doc('domain-model.md');

  it('§3.1 names every task status in the state table', () => {
    for (const status of TASK_STATUSES) expect(domain).toContain(`| \`${status}\` |`);
  });

  it('§3.2 names every verification status', () => {
    for (const status of VERIFICATION_STATUSES) expect(domain).toContain(`\`${status}\``);
  });

  it('§3.3 names every application status', () => {
    for (const status of APPLICATION_STATUSES) expect(domain).toContain(`\`${status}\``);
  });
});

describe('domain-model.md §1 notification types', () => {
  it('mentions every notification type', () => {
    const domain = doc('domain-model.md');
    for (const type of NOTIFICATION_TYPES) expect(domain).toContain(`\`${type}\``);
  });
});
