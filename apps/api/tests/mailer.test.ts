import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearOutbox, consoleMailer, createDefaultMailer, createSmtpMailer, getOutbox } from '../src/platform/ports/mailer';

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

describe('Mailer port: Brevo HTTPS delivery', () => {
  const email = { to: 'user@university.edu.ua', subject: 'Тема', text: 'Текст з посиланням', link: 'http://x' };
  const env = { BREVO_API_KEY: 'test-key', MAIL_FROM: 'sender@example.com' };

  afterEach(() => {
    vi.unstubAllGlobals();
    clearOutbox();
  });

  it('is chosen when BREVO_API_KEY is set and posts the documented request', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const mailer = createDefaultMailer({ ...env, SMTP_HOST: 'smtp.example.com' });
    expect(mailer).not.toBe(consoleMailer);
    await mailer.send(email);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'api-key': 'test-key', 'content-type': 'application/json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'CtoC', email: 'sender@example.com' },
      to: [{ email: 'user@university.edu.ua' }],
      subject: 'Тема',
      textContent: 'Текст з посиланням',
    });
  });

  it('uses MAIL_FROM_NAME as the sender name', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await createDefaultMailer({ ...env, MAIL_FROM_NAME: 'CtoC Платформа' }).send(email);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).sender.name).toBe('CtoC Платформа');
  });

  it('is console-only without BREVO_API_KEY and SMTP_HOST, and never calls fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const mailer = createDefaultMailer({});
    expect(mailer).toBe(consoleMailer);
    await mailer.send(email);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getOutbox()).toHaveLength(1);
  });

  it('a non-2xx response is an error with the status and body, but without the API key; the outbox keeps the email', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Sender not valid"}', { status: 400 })));

    const failure = await createDefaultMailer(env)
      .send(email)
      .then(
        () => null,
        (error: Error) => error,
      );

    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toContain('400');
    expect(failure?.message).toContain('Sender not valid');
    expect(failure?.message).not.toContain('test-key');
    expect(getOutbox()).toHaveLength(1);
  });

  it('refuses to start without MAIL_FROM', () => {
    expect(() => createDefaultMailer({ BREVO_API_KEY: 'test-key' })).toThrow(/MAIL_FROM/);
  });
});
