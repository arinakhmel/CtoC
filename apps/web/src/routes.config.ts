// Generated from docs/architecture/overview.md §4 (frontend pages mapped to stories).
// A test compares this list with the document, so edit the document and regenerate, or edit both.

export interface PageConfig {
  /** Route path, for example `/tasks/:id`. */
  path: string;
  title: string;
  /** Access code from overview.md §4: P public, A any user, S- / S+ student, C customer, M moderator. */
  access: string;
  /** Stories implemented on this page. Empty when the page has no story yet (see overview.md §7). */
  stories: string[];
}

export const PAGES: PageConfig[] = [
  {
    path: "/",
    title: "Landing: beginners-only message, Як це працює, commission",
    access: "P",
    stories: ["US-01", "US-02", "US-03"],
  },
  {
    path: "/payment-safety",
    title: "Оплата та безпека",
    access: "P",
    stories: ["US-04"],
  },
  {
    path: "/resume-info",
    title: "How experience records are confirmed, with an example",
    access: "P",
    stories: ["US-05"],
  },
  {
    path: "/terms",
    title: "Terms and current commission",
    access: "P",
    stories: ["US-03"],
  },
  {
    path: "/register",
    title: "Sign-up, choosing student or customer, with display name",
    access: "P",
    stories: ["US-06", "US-43", "US-44"],
  },
  {
    path: "/login",
    title: "Login. Logout is a button in the header of every page.",
    access: "P",
    stories: ["US-45", "US-46"],
  },
  {
    path: "/confirm-email",
    title: "Result of the confirmation link, resend",
    access: "P",
    stories: ["US-07"],
  },
  {
    path: "/u/:userId",
    title: "Public student profile: badge, skills, bio, experience",
    access: "P",
    stories: ["US-09", "US-10", "US-11", "US-24", "US-37", "US-38"],
  },
  {
    path: "/me/profile",
    title: "Edit skills and bio",
    access: "S- / S+",
    stories: ["US-10", "US-11", "US-38"],
  },
  {
    path: "/me/verification",
    title: "Upload a student document and see its status",
    access: "S-",
    stories: ["US-08", "US-39"],
  },
  {
    path: "/feed",
    title: "Task feed",
    access: "S-",
    stories: ["US-12", "US-13", "US-14", "US-15"],
  },
  {
    path: "/tasks/:id",
    title: "Task details and apply dialog with note. Applying needs S+. A non-verified student is prompted to verify.",
    access: "S- (apply: S+)",
    stories: ["US-13", "US-15", "US-18", "US-19", "US-42"],
  },
  {
    path: "/me/applications",
    title: "Мої відгуки with statuses",
    access: "S- / S+",
    stories: ["US-20"],
  },
  {
    path: "/me/work",
    title: "Мої активні завдання",
    access: "S+",
    stories: ["US-22", "US-29"],
  },
  {
    path: "/work/:taskId",
    title: "Workspace: terms, chat, result upload and submit, revision comment",
    access: "S+ (executor)",
    stories: ["US-22", "US-23", "US-27", "US-28", "US-29", "US-32", "US-33"],
  },
  {
    path: "/me/finance",
    title: "Balance, per-task breakdown, withdrawal",
    access: "S+",
    stories: ["US-34", "US-35", "US-36"],
  },
  {
    path: "/notifications",
    title: "Notification centre",
    access: "A",
    stories: ["US-21", "US-30", "US-39", "US-47", "US-48", "US-49"],
  },
  {
    path: "/c/tasks/new",
    title: "Task form",
    access: "C",
    stories: ["US-16", "US-17"],
  },
  {
    path: "/c/tasks",
    title: "My tasks with statuses",
    access: "C",
    stories: ["US-50"],
  },
  {
    path: "/c/tasks/:id",
    title: "Task management: candidates, select and reserve, review result, chat",
    access: "C (owner)",
    stories: ["US-23", "US-24", "US-25", "US-26", "US-31", "US-32", "US-33"],
  },
  {
    path: "/c/balance",
    title: "Sandbox balance top-up",
    access: "C",
    stories: ["US-26"],
  },
  {
    path: "/mod/verifications",
    title: "Student document queue",
    access: "M",
    stories: ["US-39", "US-41"],
  },
  {
    path: "/mod/tasks",
    title: "Task moderation queue, deal resolution",
    access: "M",
    stories: ["US-40", "US-14", "US-15"],
  },
  {
    path: "/mod/withdrawals",
    title: "Withdrawal requests",
    access: "M",
    stories: [],
  },
  {
    path: "/mod/settings",
    title: "Commission, price limits, university domains",
    access: "M",
    stories: ["US-03"],
  },
];
