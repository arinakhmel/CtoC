import { useI18n } from '../../../lib/i18n';
import { BuddyFigure, type BuddyProp } from '../../../ui/BuddyFigure';
import { HOW_IT_WORKS_STEPS_EN, normalizeSteps, type HowItWorksStep } from '../steps';

/**
 * US-02: the «Як це працює» block, a numbered list of 3 or 4 steps from sign-up to the first payment. `steps` is optional: without it
 * the default steps are shown (in English when the UI is English). Whatever is passed goes through `normalizeSteps`, so a wrong count
 * or an empty text never reaches the page. The decorative mark of a step is its number, hidden from a screen reader (the list is numbered).
 */
/** What «Лупик» holds when it peeks out of each step: sign up with a pen, look for a task, work in glasses, get a coin. */
const PROPS: BuddyProp[] = ['pen', 'magnifier', 'glasses', 'coin'];

export function HowItWorks({ steps }: { steps?: readonly Partial<HowItWorksStep>[] }) {
  const { lang, t } = useI18n();
  const shown = normalizeSteps(steps ?? (lang === 'en' ? HOW_IT_WORKS_STEPS_EN : undefined));

  return (
    <section aria-labelledby="how-it-works-title" className="how-it-works">
      <h2 id="how-it-works-title">{t('landing.howTitle')}</h2>
      <ol>
        {shown.map((step, index) => (
          <li key={`${step.id}-${index}`}>
            <span aria-hidden="true" className="how-it-works__num">
              {String(index + 1).padStart(2, '0')}
            </span>{' '}
            <strong>{step.title}</strong>
            <p>{step.description}</p>
            <span className="peek" aria-hidden="true">
              <BuddyFigure prop={PROPS[index % PROPS.length]} size={56} />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
