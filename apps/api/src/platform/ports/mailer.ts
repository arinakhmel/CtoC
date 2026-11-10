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

/**
 * Real delivery is on when SMTP_HOST is set (integrations.md, ADR-0006). Without it the email only goes
 * to the console and the dev outbox. The outbox and console always record the email first, so a failed
 * delivery still leaves the link visible in the log.
 */
export function createDefaultMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
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
