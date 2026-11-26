import { normalizeSteps, type HowItWorksStep } from '../steps';

/**
 * US-02: the «Як це працює» block, a numbered list of 3 or 4 steps from sign-up to the first payment. `steps` is optional: without it
 * the default steps are shown. Whatever is passed goes through `normalizeSteps`, so a wrong count or an empty text never reaches the page.
 */
export function HowItWorks({ steps }: { steps?: readonly Partial<HowItWorksStep>[] }) {
  const shown = normalizeSteps(steps ?? undefined);

  return (
    <section aria-labelledby="how-it-works-title">
      <h2 id="how-it-works-title">Як це працює</h2>
      <ol>
        {shown.map((step, index) => (
          <li key={`${step.id}-${index}`}>
            <span aria-hidden="true">{step.icon}</span> <strong>{step.title}</strong>
            <p>{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
