import { Link } from 'react-router-dom';
import { useI18n } from '../../../lib/i18n';
import type { PageConfig } from '../../../routes.config';
import { HowItWorks } from '../components/HowItWorks';
import { StickerStack } from '../components/StickerStack';
import { PageTitle } from '../../../ui/PageTitle';

/** A text made of parts separated by `|`, shown as separate words with space between them (no separator dots). */
function Parts({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {text.split('|').map((part) => (
        <span key={part}>{part}</span>
      ))}
    </span>
  );
}

/** Three sample tasks pinned to the board in the hero: stickers the visitor can grab and toss (StickerStack). */
function TicketStack() {
  const { t } = useI18n();
  return (
    <StickerStack
      hint={t('landing.dragHint')}
      stickers={[
        {
          id: 'excel',
          className: 'ticket--back ticket--1',
          x: -24,
          y: 0,
          rotate: -5,
          content: (
            <>
              <Parts className="ticket__meta" text={t('landing.ticket2Meta')} />
              <span className="ticket__title">{t('landing.ticket2Title')}</span>
              <span className="ticket__price">800 ₴</span>
            </>
          ),
        },
        {
          id: 'smm',
          className: 'ticket--back ticket--2',
          x: 28,
          y: 44,
          rotate: 4,
          content: (
            <>
              <Parts className="ticket__meta" text={t('landing.ticket3Meta')} />
              <span className="ticket__title">{t('landing.ticket3Title')}</span>
              <span className="ticket__price">1 500 ₴</span>
            </>
          ),
        },
        {
          id: 'logo',
          className: 'ticket--front',
          x: 0,
          y: 110,
          rotate: -1.5,
          content: (
            <>
              <span className="ticket__label">{t('landing.ticketLabel')}</span>
              <span className="ticket__title">{t('landing.ticketTitle')}</span>
              <Parts className="ticket__meta" text={t('landing.ticketMeta')} />
              <span className="ticket__row">
                <span className="ticket__price">{t('landing.ticketPrice')}</span>
                <span className="ticket__stamp">✓ {t('landing.ticketNote')}</span>
              </span>
            </>
          ),
        },
      ]}
    />
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
          <h1 id="page-title"><PageTitle page={page} /></h1>
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
