/** Port `Mailer` (ADR-0002, ADR-0006). Local implementation: console plus an in-memory outbox. */
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

let current: Mailer = consoleMailer;
export const getMailer = (): Mailer => current;
/** For tests of a failing provider. */
export const setMailer = (next: Mailer): void => {
  current = next;
};
