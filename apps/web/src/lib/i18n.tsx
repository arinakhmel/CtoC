import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * The UI dictionary. Ukrainian is the language of the product (CLAUDE.md) and the default; English is offered for
 * international students and guests. Texts that come from the API or from MESSAGES_UK stay as they are.
 * Keys are flat and grouped by prefix: `layout.*`, `nav.*`, `landing.*`, `feed.*`, `filters.*`.
 */
const uk = {
  'layout.skip': 'Перейти до змісту',
  'layout.home': 'CtoC, на головну',
  'layout.ticker': 'Тільки для студентів-початківців|Ціна відома наперед|Оплату зарезервовано до старту',
  'layout.login': 'Вхід',
  'layout.start': 'Почати безкоштовно',
  'layout.logout': 'Вийти',
  'layout.logoutError': 'Не вдалося вийти. Спробуйте ще раз.',
  'layout.menu': 'Головне меню',
  'layout.prefs': 'Налаштування вигляду',
  'layout.language': 'Мова',
  'layout.theme': 'Тема',
  'layout.footerAbout': 'Перші оплачувані завдання для студентів. Малий бізнес отримує свіжий погляд, студенти — досвід, підтверджений платформою.',
  'layout.footerIndex': 'Усі сторінки проєкту',
  'layout.footerMade': 'Зроблено студентами НаУКМА, 2026',
  'theme.paper': 'Папір',
  'theme.graphite': 'Графіт',
  'theme.blueprint': 'Синька',
  'lang.uk': 'Українська',
  'lang.en': 'English',

  'nav.home': 'Головна',
  'nav.safety': 'Безпека оплати',
  'nav.terms': 'Комісія',
  'nav.feed': 'Стрічка',
  'nav.applications': 'Мої відгуки',
  'nav.work': 'Активні',
  'nav.finance': 'Фінанси',
  'nav.profile': 'Профіль',
  'nav.verification': 'Верифікація',
  'nav.notifications': 'Сповіщення',
  'nav.myTasks': 'Мої замовлення',
  'nav.newTask': 'Розмістити',
  'nav.balance': 'Баланс',
  'nav.modTasks': 'Черга завдань',
  'nav.modVerifications': 'Документи',
  'nav.modWithdrawals': 'Виплати',
  'nav.modSettings': 'Комісія',

  'landing.lead': 'Малий бізнес публікує невеликі завдання з чесною фіксованою ціною. Ви відгукуєтесь, виконуєте і отримуєте гроші та запис досвіду, який підтверджує сама платформа.',
  'landing.ctaStudent': 'Я студент — шукаю завдання',
  'landing.ctaCustomer': 'Я замовник — маю задачу',
  'landing.safety': 'Як захищено оплату',
  'landing.stat1': 'ціна фіксована заздалегідь',
  'landing.stat2': 'гроші зарезервовано до старту',
  'landing.stat3': 'кожен виконавець — перевірений студент',
  'landing.ticketLabel': 'Приклад завдання',
  'landing.ticketTitle': 'Telegram-бот для запису в барбершоп',
  'landing.ticketMeta': 'Python, aiogram|4 дні',
  'landing.ticketPrice': '1 800 грн',
  'landing.ticketNote': 'Оплату зарезервовано',
  'landing.ticket2Title': 'Парсер цін конкурентів у Google Sheets',
  'landing.ticket2Meta': 'Python|2 дні',
  'landing.ticket3Title': 'Звіт продажів із бази PostgreSQL',
  'landing.ticket3Meta': 'SQL|1 день',
  'landing.dragHint': 'Їх можна потягати і кинути',
  'landing.forWhomTitle': 'Кому це підходить',
  'landing.studentTitle': 'Студентам',
  'landing.studentText': 'Перший реальний досвід без конкуренції з профі: завдання тільки для початківців, а в резюме — підтверджений запис.',
  'landing.customerTitle': 'Малому бізнесу',
  'landing.customerText': 'Невелика задача за зрозумілу ціну. Модератор перевіряє, що це справжня робота, а ви обираєте виконавця сами.',
  'landing.howTitle': 'Як це працює',
  'landing.finalTitle': 'Перше завдання ближче, ніж здається',
  'landing.finalText': 'Реєстрація займає дві хвилини. Потрібна лише студентська пошта.',

  'feed.toolbar': 'Фільтри стрічки',
  'feed.search': 'Пошук',
  'feed.searchPlaceholder': 'Бот, парсер, SQL, верстка…',
  'feed.reward': 'Винагорода',
  'feed.rewardAny': 'Будь-яка',
  'feed.rewardLow': 'до 500 грн',
  'feed.rewardMid': '500–1500 грн',
  'feed.rewardHigh': 'від 1500 грн',
  'feed.sort': 'Сортування',
  'feed.sortNew': 'Спершу нові',
  'feed.sortDeadline': 'Найближчий дедлайн',
  'feed.sortReward': 'Найвища винагорода',
  'feed.shown': 'Показано {shown} з {total} завантажених',
  'feed.nothing': 'Нічого не знайдено за цими фільтрами.',
  'feed.reset': 'Скинути фільтри',

  'filters.label': 'Фільтр списку',
  'filters.all': 'Усі',
  'filters.waiting': 'Очікують',
  'filters.active': 'У процесі',
  'filters.finished': 'Завершені',
  'filters.closed': 'Закриті',
  'filters.sent': 'Очікують відповіді',
  'filters.accepted': 'Мене обрали',
  'filters.rejected': 'Не обрали',
  'filters.unread': 'Непрочитані',
  'filters.read': 'Прочитані',
  'filters.empty': 'У цій вкладці поки порожньо.',

  'pages.button': 'Усі сторінки',
  'pages.title': 'Усі сторінки проєкту',
  'pages.hint': 'Бліді пункти відкриваються з картки конкретного завдання чи профілю.',
  'pages.public': 'Для всіх',
  'pages.student': 'Студент',
  'pages.customer': 'Замовник',
  'pages.moderator': 'Модератор',
  'pages.account': 'Будь-який акаунт',

  'notFound.title': 'Сторінку не знайдено',
  'notFound.text': 'За цією адресою нічого немає. Можливо, посилання застаріло.',
  'notFound.home': 'На головну',
};

export type MessageKey = keyof typeof uk;

const en: Record<MessageKey, string> = {
  'layout.skip': 'Skip to content',
  'layout.home': 'CtoC, home',
  'layout.ticker': 'Beginner students only|Fixed price, no haggling|Payment reserved before work starts',
  'layout.login': 'Log in',
  'layout.start': 'Start for free',
  'layout.logout': 'Log out',
  'layout.logoutError': 'Could not log out. Please try again.',
  'layout.menu': 'Main menu',
  'layout.prefs': 'Display settings',
  'layout.language': 'Language',
  'layout.theme': 'Theme',
  'layout.footerAbout': 'First paid tasks for students. Small businesses get a fresh pair of hands, students get experience confirmed by the platform.',
  'layout.footerIndex': 'Every page of the project',
  'layout.footerMade': 'Made by NaUKMA students, 2026',
  'theme.paper': 'Paper',
  'theme.graphite': 'Graphite',
  'theme.blueprint': 'Blueprint',
  'lang.uk': 'Українська',
  'lang.en': 'English',

  'nav.home': 'Home',
  'nav.safety': 'Payment safety',
  'nav.terms': 'Commission',
  'nav.feed': 'Feed',
  'nav.applications': 'My applications',
  'nav.work': 'In progress',
  'nav.finance': 'Finance',
  'nav.profile': 'Profile',
  'nav.verification': 'Verification',
  'nav.notifications': 'Notifications',
  'nav.myTasks': 'My orders',
  'nav.newTask': 'Post a task',
  'nav.balance': 'Balance',
  'nav.modTasks': 'Task queue',
  'nav.modVerifications': 'Documents',
  'nav.modWithdrawals': 'Payouts',
  'nav.modSettings': 'Commission',

  'landing.lead': 'Small businesses post small tasks at an honest fixed price. You apply, do the work and get paid, plus an experience record confirmed by the platform itself.',
  'landing.ctaStudent': 'I’m a student — find tasks',
  'landing.ctaCustomer': 'I’m a business — post a task',
  'landing.safety': 'How payment is protected',
  'landing.stat1': 'fixed price, no haggling',
  'landing.stat2': 'money reserved before work starts',
  'landing.stat3': 'every executor is a verified student',
  'landing.ticketLabel': 'Sample task',
  'landing.ticketTitle': 'Telegram bot for barbershop bookings',
  'landing.ticketMeta': 'Python, aiogram|4 days',
  'landing.ticketPrice': '1,800 UAH',
  'landing.ticketNote': 'Payment reserved',
  'landing.ticket2Title': 'Competitor price scraper into Google Sheets',
  'landing.ticket2Meta': 'Python|2 days',
  'landing.ticket3Title': 'Sales report from a PostgreSQL database',
  'landing.ticket3Meta': 'SQL|1 day',
  'landing.dragHint': 'Go on, grab one and toss it',
  'landing.forWhomTitle': 'Who it is for',
  'landing.studentTitle': 'Students',
  'landing.studentText': 'Real first experience without competing with pros: tasks are for beginners only, and your CV gets a confirmed record.',
  'landing.customerTitle': 'Small businesses',
  'landing.customerText': 'A small job at a clear price. A moderator checks that it is real work, and you pick the executor yourself.',
  'landing.howTitle': 'How it works',
  'landing.finalTitle': 'Your first task is closer than you think',
  'landing.finalText': 'Signing up takes two minutes. All you need is a student email.',

  'feed.toolbar': 'Feed filters',
  'feed.search': 'Search',
  'feed.searchPlaceholder': 'Bot, scraper, SQL, layout…',
  'feed.reward': 'Reward',
  'feed.rewardAny': 'Any',
  'feed.rewardLow': 'under 500 UAH',
  'feed.rewardMid': '500–1500 UAH',
  'feed.rewardHigh': 'over 1500 UAH',
  'feed.sort': 'Sort by',
  'feed.sortNew': 'Newest first',
  'feed.sortDeadline': 'Closest deadline',
  'feed.sortReward': 'Highest reward',
  'feed.shown': 'Showing {shown} of {total} loaded',
  'feed.nothing': 'Nothing matches these filters.',
  'feed.reset': 'Reset filters',

  'filters.label': 'List filter',
  'filters.all': 'All',
  'filters.waiting': 'Waiting',
  'filters.active': 'In progress',
  'filters.finished': 'Finished',
  'filters.closed': 'Closed',
  'filters.sent': 'Awaiting reply',
  'filters.accepted': 'I was chosen',
  'filters.rejected': 'Not chosen',
  'filters.unread': 'Unread',
  'filters.read': 'Read',
  'filters.empty': 'Nothing in this tab yet.',

  'pages.button': 'All pages',
  'pages.title': 'Every page of the project',
  'pages.hint': 'Greyed-out pages open from the card of a specific task or profile.',
  'pages.public': 'Everyone',
  'pages.student': 'Student',
  'pages.customer': 'Customer',
  'pages.moderator': 'Moderator',
  'pages.account': 'Any account',

  'notFound.title': 'Page not found',
  'notFound.text': 'There is nothing at this address. The link may be out of date.',
  'notFound.home': 'Back to home',
};

export const LANGS = ['uk', 'en'] as const;
export type Lang = (typeof LANGS)[number];
const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { uk, en };
export const LANG_STORAGE_KEY = 'ctoc.lang';

/** Replaces `{name}` in a text with the value of `vars.name`. */
const fill = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;

export const translate = (lang: Lang, key: MessageKey, vars?: Record<string, string | number>) => fill(DICTIONARIES[lang][key] ?? uk[key], vars);

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

// Without a provider (a component rendered on its own) the UI is Ukrainian.
const I18nContext = createContext<I18nValue>({ lang: 'uk', setLang: () => {}, t: (key, vars) => translate('uk', key, vars) });

function initialLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'uk' || saved === 'en') return saved;
  } catch {
    /* storage is not available */
  }
  return 'uk';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* the choice lasts for this visit only */
    }
  }, []);

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
