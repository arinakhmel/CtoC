import type { ReactElement } from 'react';
import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { NotFound } from '../pages/NotFound';
import { ConfirmEmailPage } from '../features/identity/pages/ConfirmEmailPage';
import { LoginPage } from '../features/identity/pages/LoginPage';
import { MyProfilePage } from '../features/identity/pages/MyProfilePage';
import { ProfilePage } from '../features/identity/pages/ProfilePage';
import { MyApplicationsPage } from '../features/applications/pages/MyApplicationsPage';
import { NotificationsPage } from '../features/notifications/pages/NotificationsPage';
import { MyWorkPage } from '../features/tasks/pages/MyWorkPage';
import { WorkTaskPage } from '../features/tasks/pages/WorkTaskPage';
import { CustomerTaskPage } from '../features/tasks/pages/CustomerTaskPage';
import { BalancePage } from '../features/payments/pages/BalancePage';
import { FinancePage } from '../features/payments/pages/FinancePage';
import { VerificationsQueuePage } from '../features/admin/pages/VerificationsQueuePage';
import { WithdrawalsQueuePage } from '../features/admin/pages/WithdrawalsQueuePage';
import { FeedPage } from '../features/tasks/pages/FeedPage';
import { NewTaskPage } from '../features/tasks/pages/NewTaskPage';
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
  '/me/applications': (page) => <MyApplicationsPage page={page} />,
  '/me/work': (page) => <MyWorkPage page={page} />,
  '/c/tasks/:id': () => <CustomerTaskPage />,
  '/c/balance': (page) => <BalancePage page={page} />,
  '/me/finance': (page) => <FinancePage page={page} />,
  '/mod/verifications': (page) => <VerificationsQueuePage page={page} />,
  '/mod/withdrawals': (page) => <WithdrawalsQueuePage page={page} />,
  '/work/:taskId': () => <WorkTaskPage />,
  '/notifications': (page) => <NotificationsPage page={page} />,
  '/c/tasks/new': (page) => <NewTaskPage page={page} />,
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
