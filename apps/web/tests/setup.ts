import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

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
