import { describe, expect, it } from 'vitest';
import { consoleMailer, createDefaultMailer, createSmtpMailer } from '../src/platform/ports/mailer';

describe('Mailer port: SMTP delivery', () => {
  it('passes the sender, recipient, subject and text to the transport', async () => {
    const received: Array<Record<string, unknown>> = [];
    const transport = { sendMail: async (message: Record<string, unknown>) => void received.push(message) } as never;
    const mailer = createSmtpMailer(transport, 'CtoC <no-reply@example.com>');

    await mailer.send({ to: 'user@university.edu.ua', subject: 'Тема', text: 'Текст з посиланням', link: 'http://x' });

    expect(received).toEqual([
      { from: 'CtoC <no-reply@example.com>', to: 'user@university.edu.ua', subject: 'Тема', text: 'Текст з посиланням' },
    ]);
  });

  it('uses only the console and outbox when SMTP_HOST is not set', () => {
    expect(createDefaultMailer({})).toBe(consoleMailer);
  });

  it('uses real delivery when SMTP_HOST is set', () => {
    expect(createDefaultMailer({ SMTP_HOST: 'smtp.example.com', SMTP_USER: 'a@example.com', SMTP_PASS: 'x' })).not.toBe(consoleMailer);
  });
});
