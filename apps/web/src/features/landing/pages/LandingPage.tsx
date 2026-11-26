import { Link } from 'react-router-dom';
import { useI18n } from '../../../lib/i18n';
import type { PageConfig } from '../../../routes.config';
import { HowItWorks } from '../components/HowItWorks';

/** Three sample tasks pinned to the board in the hero: decoration, so hidden from a screen reader (the text says the same). */
function TicketStack() {
  const { t } = useI18n();
  const tickets = [
    { title: t('landing.ticket2Title'), meta: t('landing.ticket2Meta'), price: '800' },
    { title: t('landing.ticket3Title'), meta: t('landing.ticket3Meta'), price: '1 500' },
  ];
  return (
    <div className="ticket-stack" aria-hidden="true">
      {tickets.map((ticket, index) => (
        <div key={ticket.title} className={`ticket ticket--back ticket--${index + 1}`}>
          <span className="ticket__meta">{ticket.meta}</span>
          <span className="ticket__title">{ticket.title}</span>
          <span className="ticket__price">{ticket.price} ₴</span>
        </div>
      ))}
      <div className="ticket ticket--front">
        <span className="ticket__label">{t('landing.ticketLabel')}</span>
        <span className="ticket__title">{t('landing.ticketTitle')}</span>
        <span className="ticket__meta">{t('landing.ticketMeta')}</span>
        <span className="ticket__row">
          <span className="ticket__price">{t('landing.ticketPrice')}</span>
          <span className="ticket__stamp">✓ {t('landing.ticketNote')}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * `/`: the landing page. A hero with the promise and two ways in (student, customer), who it is for, the «Як це працює» block (US-02)
 * and a closing call to sign up. The commission is not repeated here: it is on /terms (US-03), linked from the menu.
 */
export function LandingPage({ page }: { page: PageConfig }) {
  const { t } = useI18n();
  return (
    <article aria-labelledby="page-title" className="landing">
      <div className="hero">
        <div className="hero__text">
          <p className="eyebrow">{t('landing.eyebrow')}</p>
          <h1 id="page-title">{page.title}</h1>
          <p className="hero__lead">{t('landing.lead')}</p>
          <p className="hero__actions">
            <Link className="link-pill link-pill--lg" to="/register">
              {t('landing.ctaStudent')}
            </Link>
            <Link className="link-ghost" to="/register">
              {t('landing.ctaCustomer')}
            </Link>
          </p>
          <dl className="hero__facts">
            <div>
              <dt>₴</dt>
              <dd>{t('landing.stat1')}</dd>
            </div>
            <div>
              <dt>⛨</dt>
              <dd>{t('landing.stat2')}</dd>
            </div>
            <div>
              <dt>✓</dt>
              <dd>{t('landing.stat3')}</dd>
            </div>
          </dl>
        </div>
        <TicketStack />
      </div>

      <section className="audience" aria-labelledby="audience-title">
        <h2 id="audience-title" className="section-title">
          {t('landing.forWhomTitle')}
        </h2>
        <div className="audience__grid">
          <div className="audience__card audience__card--student">
            <h3>{t('landing.studentTitle')}</h3>
            <p>{t('landing.studentText')}</p>
          </div>
          <div className="audience__card audience__card--customer">
            <h3>{t('landing.customerTitle')}</h3>
            <p>{t('landing.customerText')}</p>
          </div>
        </div>
      </section>

      <HowItWorks />

      <section className="final-cta" aria-labelledby="final-title">
        <h2 id="final-title">{t('landing.finalTitle')}</h2>
        <p>{t('landing.finalText')}</p>
        <p>
          <Link className="link-ghost link-ghost--light" to="/payment-safety">
            {t('landing.safety')}
          </Link>
        </p>
      </section>
    </article>
  );
}
