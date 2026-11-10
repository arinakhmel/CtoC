import { render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const profileBody = (verified: boolean) => json({ profile: { id: 'u1', displayName: 'Олена Коваль', verified } });

let profileResponse: () => Response;
let profileCalls: string[];

beforeEach(() => {
  profileCalls = [];
  profileResponse = () => profileBody(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/profiles/')) {
        profileCalls.push(url);
        return profileResponse();
      }
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/u/u1'])} future={providerFuture} />);

describe('/u/:userId public profile (US-09)', () => {
  it('US-09 sc.1 a verified student shows the «Верифікований студент» badge in the profile header', async () => {
    open();

    const header = within((await screen.findByRole('heading', { level: 1, name: 'Олена Коваль' })).closest('header')!);
    expect(header.getByText('Верифікований студент')).toBeInTheDocument();
    expect(profileCalls).toEqual(['/api/profiles/u1']);
  });

  it('US-09 sc.2 an unverified student has no badge', async () => {
    profileResponse = () => profileBody(false);
    open();

    expect(await screen.findByRole('heading', { level: 1, name: 'Олена Коваль' })).toBeInTheDocument();
    expect(screen.queryByText(/верифікований студент/i)).toBeNull();
  });

  it('US-09 sc.2 an unknown or non-student profile shows «Профіль не знайдено»', async () => {
    profileResponse = () => json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
    open();

    expect(await screen.findByRole('heading', { level: 1, name: 'Профіль не знайдено' })).toBeInTheDocument();
    expect(screen.queryByText(/верифікований студент/i)).toBeNull();
  });

  it('US-09 sc.3 after a reload the badge is back, because it is read from the API again', async () => {
    const first = open();
    expect(await screen.findByText('Верифікований студент')).toBeInTheDocument();
    first.unmount();

    open();

    expect(await screen.findByText('Верифікований студент')).toBeInTheDocument();
    expect(profileCalls).toHaveLength(2);
  });
});
