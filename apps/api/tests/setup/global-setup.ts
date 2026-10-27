import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = resolve(apiRoot, 'data');

/**
 * Runs once before all API test files: creates a fresh SQLite test database from the committed
 * migrations, so the CHECK constraints and partial indexes are the real ones (testing.md §3).
 */
export default function setup() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(resolve(dataDir, `test.db${suffix}`), { force: true });

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:../data/test.db?connection_limit=1', NODE_ENV: 'test' },
  });
}
