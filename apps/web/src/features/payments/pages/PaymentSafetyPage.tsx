import { Link } from 'react-router-dom';
import type { PageConfig } from '../../../routes.config';
import { PageTitle } from '../../../ui/PageTitle';

/** The stages of a deal in the order they happen (US-04 sc.1). Each one is a block of the list; the CSS puts them in one column on a phone (sc.3). */
const STAGES = [
  {
    id: 'reserve',
    title: 'Резервування коштів замовником',
    text: 'Коли замовник обирає виконавця, він резервує всю ціну завдання ще до початку роботи. Ці гроші вже зарезервовані, замовник не може їх витратити на інше, і ви бачите, що оплата є.',
  },
  {
    id: 'work',
    title: 'Виконання завдання',
    text: 'Ви виконуєте завдання за умовами та завантажуєте результат на платформу.',
  },
  {
    id: 'review',
    title: 'Перевірка результату',
    text: 'Замовник перевіряє роботу: приймає її або повертає на доопрацювання з коментарем. Поки результат не прийнято, зарезервована сума лишається на утриманні.',
  },
  {
    id: 'payout',
    title: 'Виплата на картку',
    text: 'Після того як замовник підтвердив результат, сума за мінусом комісії платформи зараховується на ваш баланс. Звідти ви подаєте заявку на виведення на банківську картку.',
  },
] as const;

/**
 * /payment-safety: US-04. A public page (no sign-in) that explains the whole safe deal before registration: the customer reserves the
 * money, the student works, the customer checks the result, the student is paid to a card. The commission is not repeated here: its
 * value is on /terms (US-03), so it is written once. The note on the MVP is the honest part (OQ-48): the money is simulated.
 */
export function PaymentSafetyPage({ page }: { page: PageConfig }) {
  return (
    <article aria-labelledby="page-title" className="payment-safety">
      <h1 id="page-title"><PageTitle page={page} /></h1>
      <p>Ви отримаєте гроші за свою роботу: оплата зарезервована ще до того, як ви почнете. Ось як проходить безпечна угода від початку до кінця.</p>

      <section aria-labelledby="stages-title">
        <h2 id="stages-title">Як проходить угода</h2>
        <ol className="payment-stages">
          {STAGES.map((stage) => (
            <li key={stage.id}>
              <h3>{stage.title}</h3>
              <p>{stage.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="guarantees-title">
        <h2 id="guarantees-title">Що це означає для вас</h2>
        <ul>
          <li>Замовник резервує кошти до початку роботи, тому ви не працюєте безкоштовно.</li>
          <li>Виплата на картку відбувається після підтвердження результату замовником.</li>
        </ul>
        <p>
          Розмір комісії платформи вказано на сторінці <Link to="/terms">«Умови та поточна комісія»</Link>.
        </p>
      </section>

      <section aria-labelledby="demo-title">
        <h2 id="demo-title">Про демонстраційну версію</h2>
        <p>У демонстраційній версії кошти умовні, а виплату на картку підтверджує модератор вручну.</p>
      </section>
    </article>
  );
}
