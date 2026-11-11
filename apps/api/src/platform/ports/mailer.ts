import nodemailer, { type Transporter } from 'nodemailer';

/** Port `Mailer` (ADR-0002, ADR-0006). Local implementation: console plus an in-memory outbox; SMTP when configured. */
export interface Email {
  to: string;
  subject: string;
  text: string;
  /** Confirmation link, shown on the dev outbox page. */
  link?: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

export interface SentEmail extends Email {
  sentAt: string;
}

const outbox: SentEmail[] = [];

export const getOutbox = (): readonly SentEmail[] => outbox;
export const clearOutbox = (): void => {
  outbox.length = 0;
};

export const consoleMailer: Mailer = {
  async send(email) {
    outbox.push({ ...email, sentAt: new Date().toISOString() });
    if (process.env.NODE_ENV !== 'test') console.log(`[mail] to=${email.to} subject="${email.subject}" ${email.link ?? ''}`);
  },
};

/** Delivers through any nodemailer transport. `from` is the sender address. */
export function createSmtpMailer(transport: Transporter, from: string): Mailer {
  return {
    async send(email) {
      await transport.sendMail({ from, to: email.to, subject: email.subject, text: email.text });
    },
  };
}

/** Delivers through the Brevo HTTPS API (hosts such as Railway block outbound SMTP). Uses the global fetch. */
export function createBrevoMailer(options: { apiKey: string; fromEmail: string; fromName: string }): Mailer {
  return {
    async send(email) {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': options.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: options.fromName, email: options.fromEmail },
          to: [{ email: email.to }],
          subject: email.subject,
          textContent: email.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Brevo send failed: HTTP ${response.status} ${await response.text()}`);
      }
    },
  };
}

/**
 * Real delivery: Brevo when BREVO_API_KEY is set, else SMTP when SMTP_HOST is set (integrations.md,
 * ADR-0006), else only the console and the dev outbox. The outbox and console always record the email
 * first, so a failed delivery still leaves the link visible in the log.
 */
export function createDefaultMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.BREVO_API_KEY) {
    if (!env.MAIL_FROM) throw new Error('MAIL_FROM (a sender verified in Brevo) is required when BREVO_API_KEY is set');
    const brevo = createBrevoMailer({
      apiKey: env.BREVO_API_KEY,
      fromEmail: env.MAIL_FROM,
      fromName: env.MAIL_FROM_NAME || 'CtoC',
    });
    return {
      async send(email) {
        await consoleMailer.send(email);
        await brevo.send(email);
      },
    };
  }
  const host = env.SMTP_HOST;
  if (!host) return consoleMailer;
  const port = Number(env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    // A blocked port or a wrong host must not hang the request that sends the email (about 10 s at most).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } } : {}),
  });
  const smtp = createSmtpMailer(transport, env.SMTP_FROM ?? env.SMTP_USER ?? 'CtoC <no-reply@ctoc.local>');
  return {
    async send(email) {
      await consoleMailer.send(email);
      await smtp.send(email);
    },
  };
}

let current: Mailer = createDefaultMailer();
export const getMailer = (): Mailer => current;
/** For tests of a failing provider. */
export const setMailer = (next: Mailer): void => {
  current = next;
};
