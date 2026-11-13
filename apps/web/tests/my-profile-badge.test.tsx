import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function stubApi(verified: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/me') return json({ user: { id: 'u1', role: 'student', displayName: 'Олена', emailConfirmed: true, studentVerified: verified } });
      if (url === '/api/profiles/u1') return json({ profile: { id: 'u1', displayName: 'Олена', verified, skills: [], bio: '' } });
      if (url.startsWith('/api/skills')) return json({ skills: [] });
      return json({ status: 'ok' });
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('/me/profile badge (US-09)', () => {
  it('US-09 sc.1 a verified student sees the «Верифікований студент» badge on their own profile page', async () => {
    stubApi(true);
    render(<RouterProvider router={createTestRouter(['/me/profile'])} future={providerFuture} />);
    expect(await screen.findByText('Верифікований студент')).toBeInTheDocument();
  });

  it('US-09 sc.2 a student without verification has no badge, although their role is «student»', async () => {
    stubApi(false);
    render(<RouterProvider router={createTestRouter(['/me/profile'])} future={providerFuture} />);
    await screen.findByLabelText('Навичка');
    expect(screen.queryByText('Верифікований студент')).not.toBeInTheDocument();
  });
});
