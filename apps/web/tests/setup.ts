import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// The default 1 s of `findBy*` and `waitFor` is too short when the whole suite runs in parallel: a page that waits for the
// session and then the task sometimes renders after it, and a different test fails each run. The test timeout in
// vite.config.ts is raised above it, so a slow query still fails with its own message.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});

// React Router creates `new Request(url, { signal })` on every navigation. Under jsdom the signal is jsdom's
// AbortSignal, which Node's Request rejects ("Expected signal to be an instance of AbortSignal"). Tests that
// navigate (for example after login) need a Request that ignores it. Test-only, the app is not affected.
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal) {
      const { signal: _signal, ...rest } = init;
      super(input, rest);
    } else {
      super(input, init);
    }
  }
} as typeof Request;
