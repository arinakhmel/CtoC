import { render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hrefFor } from '../src/app/Layout';
import { createTestRouter, providerFuture } from '../src/app/router';
import { PAGES } from '../src/routes.config';

beforeEach(() => {
  // The layout calls GET /api/health; these tests are about the pages, so the API is "up".
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })));
});

const renderAt = (path: string) => render(<RouterProvider router={createTestRouter([path])} future={providerFuture} />);

describe('overview.md §4: every page stub renders what the router promises', () => {
  it.each(PAGES.map((page) => [page.path, page] as const))('%s shows its title, its stories and the link to all pages', async (_path, page) => {
    renderAt(hrefFor(page.path));

    const main = within(screen.getByRole('main'));
    expect(await main.findByRole('heading', { level: 1, name: page.title })).toBeInTheDocument();

    for (const story of page.stories) {
      expect(main.getByRole('link', { name: story })).toHaveAttribute('href', expect.stringContaining('requirements.md'));
    }
    if (page.stories.length === 0) expect(main.getByText(/no story yet/i)).toBeInTheDocument();

    expect(main.getByRole('link', { name: 'All pages' })).toHaveAttribute('href', '/');
  });

  it('overview.md §4: the landing page is served at /', async () => {
    renderAt('/');
    const landing = PAGES.find((page) => page.path === '/')!;
    expect(await screen.findByRole('heading', { level: 1, name: landing.title })).toBeInTheDocument();
  });
});

describe('overview.md §4: unknown addresses', () => {
  it('show the not-found page with a link to all pages', async () => {
    renderAt('/no/such/page');
    const main = within(screen.getByRole('main'));
    expect(await main.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(main.getByRole('link', { name: 'All pages' })).toHaveAttribute('href', '/');
  });

  it('keep the layout: the navigation lists every page', async () => {
    renderAt('/no/such/page');
    const nav = within(await screen.findByRole('navigation', { name: 'Pages' }));
    expect(nav.getAllByRole('link')).toHaveLength(PAGES.length);
  });
});
