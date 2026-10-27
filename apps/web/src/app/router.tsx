import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { NotFound } from '../pages/NotFound';
import { PageStub } from '../pages/PageStub';
import { PAGES } from '../routes.config';
import { Layout } from './Layout';

/** One stub per page in overview.md §4, plus the not-found page. Replace a stub when its story is built. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      ...PAGES.map((page) =>
        page.path === '/'
          ? { index: true, element: <PageStub page={page} /> }
          : { path: page.path.slice(1), element: <PageStub page={page} /> },
      ),
      { path: '*', element: <NotFound /> },
    ],
  },
];

// Opt in to the React Router v7 behaviour now, so upgrading later is not a surprise.
const future = {
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_skipActionErrorRevalidation: true,
} as const;

/** Pass to `<RouterProvider future={providerFuture} />`. */
export const providerFuture = { v7_startTransition: true } as const;

export const createAppRouter = () => createBrowserRouter(routes, { future });
export const createTestRouter = (initialEntries: string[]) => createMemoryRouter(routes, { initialEntries, future });
