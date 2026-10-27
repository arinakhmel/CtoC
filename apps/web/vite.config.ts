import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// The root .env is shared with the API (see .env.example). Real environment variables win over it.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '');
  const pick = (name: string) => process.env[name] ?? env[name];
  const apiUrl = pick('API_URL') ?? `http://localhost:${pick('PORT') ?? 3001}`;
  const port = Number(pick('WEB_PORT') ?? 5173);

  return {
    plugins: [react()],
    envDir: '../..',
    server: {
      port,
      strictPort: true,
      proxy: { '/api': apiUrl },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
    },
  };
});
