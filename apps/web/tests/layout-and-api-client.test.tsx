import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';
import { ApiClientError, apiFetch } from '../src/lib/api';

afterEach(() => vi.unstubAllGlobals());

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('layout: API status (ADR-0009 health check)', () => {
  it('shows "API: ok" when GET /api/health answers {"status":"ok"}', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<RouterProvider router={createTestRouter(['/'])} future={providerFuture} />);
    expect(await screen.findByRole('status')).toHaveTextContent('API: ok');
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('shows "API: unavailable" when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    render(<RouterProvider router={createTestRouter(['/'])} future={providerFuture} />);
    expect(await screen.findByText('API: unavailable')).toBeInTheDocument();
  });
});

describe('api.md §2: the api client turns error bodies into ApiClientError', () => {
  it('keeps status, code, message and details of the documented error format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { error: { code: 'COMMENT_REQUIRED', message: "Коментар до доопрацювання є обов'язковим", details: [{ field: 'comment', code: 'COMMENT_REQUIRED' }] } },
          400,
        ),
      ),
    );
    await expect(apiFetch('/tasks/1/return', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 400,
      code: 'COMMENT_REQUIRED',
      details: [{ field: 'comment', code: 'COMMENT_REQUIRED' }],
    });
  });

  it('reports UNKNOWN_ERROR for a failure that is not in the documented format', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' })));
    await expect(apiFetch('/health')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' });
  });

  it('reports NETWORK_ERROR when the request itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const error = await apiFetch('/health').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('sends JSON bodies with a JSON content type', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/anything', { method: 'POST', body: '{"a":1}' });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});
