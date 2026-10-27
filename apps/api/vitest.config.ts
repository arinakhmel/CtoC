import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Tests share one SQLite file, so test files run one after another (docs/architecture/testing.md).
    fileParallelism: false,
    globalSetup: ['tests/setup/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      // Relative to prisma/, like the development database.
      DATABASE_URL: 'file:../data/test.db?connection_limit=1',
    },
    testTimeout: 15_000,
  },
});
