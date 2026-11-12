import type { ReactElement } from 'react';
import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { NotFound } from '../pages/NotFound';
import { ConfirmEmailPage } from '../features/identity/pages/ConfirmEmailPage';
import { LoginPage } from '../features/identity/pages/LoginPage';
import { MyProfilePage } from '../features/identity/pages/MyProfilePage';
import { ProfilePage } from '../features/identity/pages/ProfilePage';
import { FeedPage } from '../features/tasks/pages/FeedPage';
import { TaskPage } from '../features/tasks/pages/TaskPage';
import { VerificationPage } from '../features/verification/pages/VerificationPage';
import { RegisterPage } from '../features/identity/pages/RegisterPage';
import { PageStub } from '../pages/PageStub';
import { PAGES, type PageConfig } from '../routes.config';
import { Layout } from './Layout';

/** Pages that are built. Every other page in overview.md §4 is still a stub. */
const IMPLEMENTED: Record<string, (page: PageConfig) => ReactElement> = {
  '/register': (page) => <RegisterPage page={page} />,
  '/login': (page) => <LoginPage page={page} />,
  '/u/:userId': (page) => <ProfilePage page={page} />,
  '/me/profile': (page) => <MyProfilePage page={page} />,
  '/me/verification': (page) => <VerificationPage page={page} />,
  '/confirm-email': (page) => <ConfirmEmailPage page={page} />,
  '/feed': (page) => <FeedPage page={page} />,
  '/tasks/:id': (page) => <TaskPage page={page} />,
};
const renderPage = (page: PageConfig) => IMPLEMENTED[page.path]?.(page) ?? <PageStub page={page} />;

/** One stub per page in overview.md §4, plus the not-found page. Replace a stub when its story is built. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      ...PAGES.map((page) =>
        page.path === '/'
          ? { index: true, element: <PageStub page={page} /> }
          : { path: page.path.slice(1), element: renderPage(page) },
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
