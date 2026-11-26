import type { SessionUser } from '../features/identity/queries/login';
import type { Lang, MessageKey } from '../lib/i18n';

export interface NavItem {
  to: string;
  label: MessageKey;
  /** Match only the exact path (the landing page, the list that has child pages). */
  end?: boolean;
}

type User = SessionUser['user'];

/**
 * The main menu shows only what the current user can open (overview.md §4 access codes): a visitor sees the public pages,
 * a student the feed and their work, a customer their orders, a moderator the queues. The full index stays in the footer.
 */
export function menuFor(user: User | null | undefined): NavItem[] {
  if (!user) {
    return [
      { to: '/', label: 'nav.home', end: true },
      { to: '/payment-safety', label: 'nav.safety' },
      { to: '/terms', label: 'nav.terms' },
    ];
  }
  if (user.role === 'student') {
    return [
      { to: '/feed', label: 'nav.feed' },
      { to: '/me/applications', label: 'nav.applications' },
      ...(user.studentVerified
        ? [
            { to: '/me/work', label: 'nav.work' } as NavItem,
            { to: '/me/finance', label: 'nav.finance' } as NavItem,
          ]
        : [{ to: '/me/verification', label: 'nav.verification' } as NavItem]),
      { to: '/me/profile', label: 'nav.profile' },
      { to: '/notifications', label: 'nav.notifications' },
    ];
  }
  if (user.role === 'customer') {
    return [
      { to: '/c/tasks', label: 'nav.myTasks', end: true },
      { to: '/c/tasks/new', label: 'nav.newTask' },
      { to: '/c/balance', label: 'nav.balance' },
      { to: '/notifications', label: 'nav.notifications' },
    ];
  }
  return [
    { to: '/mod/tasks', label: 'nav.modTasks' },
    { to: '/mod/verifications', label: 'nav.modVerifications' },
    { to: '/mod/withdrawals', label: 'nav.modWithdrawals' },
    { to: '/mod/settings', label: 'nav.modSettings' },
  ];
}

/** Short human names of the routes, for the page index in the footer. */
export const PAGE_NAMES: Record<string, Record<Lang, string>> = {
  '/': { uk: 'Головна', en: 'Home' },
  '/payment-safety': { uk: 'Оплата та безпека', en: 'Payment safety' },
  '/resume-info': { uk: 'Як підтверджуємо досвід', en: 'How experience is confirmed' },
  '/terms': { uk: 'Умови та комісія', en: 'Terms and commission' },
  '/legal/terms': { uk: 'Умови користування', en: 'Terms of use' },
  '/legal/privacy': { uk: 'Політика конфіденційності', en: 'Privacy policy' },
  '/legal/safe-deal': { uk: 'Безпечна угода та комісія', en: 'Safe deal and commission' },
  '/register': { uk: 'Реєстрація', en: 'Sign up' },
  '/login': { uk: 'Вхід', en: 'Log in' },
  '/confirm-email': { uk: 'Підтвердження пошти', en: 'Email confirmation' },
  '/u/:userId': { uk: 'Публічний профіль', en: 'Public profile' },
  '/me/profile': { uk: 'Мій профіль', en: 'My profile' },
  '/me/verification': { uk: 'Верифікація студента', en: 'Student verification' },
  '/feed': { uk: 'Стрічка завдань', en: 'Task feed' },
  '/tasks/:id': { uk: 'Картка завдання', en: 'Task details' },
  '/me/applications': { uk: 'Мої відгуки', en: 'My applications' },
  '/me/work': { uk: 'Активні завдання', en: 'Active tasks' },
  '/work/:taskId': { uk: 'Робочий простір', en: 'Workspace' },
  '/me/finance': { uk: 'Фінанси студента', en: 'Student finance' },
  '/notifications': { uk: 'Сповіщення', en: 'Notifications' },
  '/c/tasks/new': { uk: 'Нове замовлення', en: 'New task' },
  '/c/tasks': { uk: 'Замовлення', en: 'Orders' },
  '/c/tasks/:id': { uk: 'Керування замовленням', en: 'Manage a task' },
  '/c/balance': { uk: 'Баланс замовника', en: 'Customer balance' },
  '/mod/verifications': { uk: 'Перевірка документів', en: 'Document checks' },
  '/mod/tasks': { uk: 'Модерація завдань', en: 'Task moderation' },
  '/mod/withdrawals': { uk: 'Заявки на виведення', en: 'Withdrawal requests' },
  '/mod/settings': { uk: 'Налаштування комісії', en: 'Platform commission' },
};
