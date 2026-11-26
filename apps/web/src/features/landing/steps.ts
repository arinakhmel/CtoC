/** One step of the «Як це працює» block (US-02). `icon` is decorative. */
export interface HowItWorksStep {
  id: string;
  icon: string;
  title: string;
  description: string;
}

/** What the block shows (US-02 sc.1) and falls back to (sc.2, sc.3): the path from sign-up to the first payment (requirements.md §1). */
export const HOW_IT_WORKS_STEPS: readonly HowItWorksStep[] = [
  { id: 'register', icon: '📝', title: 'Зареєструйтесь', description: 'Вкажіть пошту університету й підтвердіть, що ви студент: так замовники знають, що ви початківець.' },
  { id: 'apply', icon: '🔍', title: 'Знайдіть завдання і відгукніться', description: 'Оберіть завдання з фіксованою ціною та надішліть відгук. Замовник сам обирає виконавця.' },
  { id: 'deliver', icon: '💻', title: 'Виконайте роботу', description: 'Коли замовник зарезервував оплату, виконайте завдання й завантажте результат.' },
  { id: 'paid', icon: '💰', title: 'Отримайте оплату', description: 'Після прийняття роботи ви отримаєте гроші за мінусом комісії й підтверджений запис досвіду в резюме.' },
];

export const HOW_IT_WORKS_MIN = 3;
export const HOW_IT_WORKS_MAX = 4;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * US-02 sc.2, sc.3 (W-11, OQ-16: the content is static, so these are guards of the component, not runtime loading).
 * 1. A step with no description gets the template description of the step with the same `id`; with no template it is hidden,
 *    so there is never an empty element in the page (sc.3). The same for a missing title.
 * 2. If fewer than 3 or more than 4 steps are left, the default four are shown (sc.2). 3 and 4 pass as they are.
 */
export function normalizeSteps(steps: readonly Partial<HowItWorksStep>[] | null | undefined): readonly HowItWorksStep[] {
  const prepared: HowItWorksStep[] = [];
  for (const step of steps ?? []) {
    const template = HOW_IT_WORKS_STEPS.find((candidate) => candidate.id === step?.id);
    const title = text(step?.title) || template?.title || '';
    const description = text(step?.description) || template?.description || '';
    if (!title || !description) continue;
    prepared.push({ id: text(step?.id) || title, icon: text(step?.icon) || template?.icon || '•', title, description });
  }
  return prepared.length >= HOW_IT_WORKS_MIN && prepared.length <= HOW_IT_WORKS_MAX ? prepared : HOW_IT_WORKS_STEPS;
}

/** The same steps in English, for the English UI. Same ids, so `normalizeSteps` treats them as the template steps. */
export const HOW_IT_WORKS_STEPS_EN: readonly HowItWorksStep[] = [
  { id: 'register', icon: '📝', title: 'Sign up', description: 'Use your university email and confirm you are a student, so customers know you are a beginner.' },
  { id: 'apply', icon: '🔍', title: 'Find a task and apply', description: 'Pick a task with a fixed price and send an application. The customer chooses the executor.' },
  { id: 'deliver', icon: '💻', title: 'Do the work', description: 'Once the customer has reserved the payment, do the task and upload the result.' },
  { id: 'paid', icon: '💰', title: 'Get paid', description: 'When the work is accepted you get the money minus the commission, plus a confirmed experience record for your CV.' },
];
