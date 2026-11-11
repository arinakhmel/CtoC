import { timingSafeEqual } from 'node:crypto';

/**
 * Telegram Bot API over plain `fetch` (no library). Used only by the verification module to hand a student
 * document to moderators and to receive their decision. This is a plain client, not a port (ADR-0002 keeps
 * three ports). It is switched on only when all three variables are set; otherwise nothing is sent.
 */
export interface TelegramConfig {
  token: string;
  chatId: string;
  webhookSecret: string;
}

export function telegramConfig(env: NodeJS.ProcessEnv = process.env): TelegramConfig | null {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId, TELEGRAM_WEBHOOK_SECRET: webhookSecret } = env;
  return token && chatId && webhookSecret ? { token, chatId, webhookSecret } : null;
}

/** Constant-time comparison of the `X-Telegram-Bot-Api-Secret-Token` header with the configured secret. */
export function secretMatches(header: string | undefined, secret: string): boolean {
  if (header === undefined) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Never put the token or the request URL into the error: it is logged. */
async function call(config: TelegramConfig, method: string, body: FormData | Record<string, unknown>): Promise<void> {
  const isForm = body instanceof FormData;
  const response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
    method: 'POST',
    headers: isForm ? undefined : { 'content-type': 'application/json' },
    body: isForm ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !result?.ok) {
    throw new Error(`Telegram ${method} failed: HTTP ${response.status} ${result?.description ?? ''}`.trim());
  }
}

const decisionButtons = (userId: string) => ({
  inline_keyboard: [
    [
      { text: '✅ Approve', callback_data: `verify:${userId}` },
      { text: '❌ Reject', callback_data: `reject:${userId}` },
    ],
  ],
});

/** Photos go through `sendPhoto`. A PDF cannot, so it goes through `sendDocument`. Both carry the two buttons. */
export function sendReviewRequest(
  config: TelegramConfig,
  doc: { bytes: Buffer; mime: string; fileName: string; caption: string; userId: string },
): Promise<void> {
  const isImage = doc.mime.startsWith('image/');
  const form = new FormData();
  form.set('chat_id', config.chatId);
  form.set('caption', doc.caption);
  form.set('reply_markup', JSON.stringify(decisionButtons(doc.userId)));
  form.set(isImage ? 'photo' : 'document', new Blob([new Uint8Array(doc.bytes)], { type: doc.mime }), doc.fileName);
  return call(config, isImage ? 'sendPhoto' : 'sendDocument', form);
}

/** Replaces the caption and removes the buttons, so the decision cannot be clicked twice. */
export const editCaption = (config: TelegramConfig, chatId: number, messageId: number, caption: string) =>
  call(config, 'editMessageCaption', { chat_id: chatId, message_id: messageId, caption, reply_markup: { inline_keyboard: [] } });

/** Stops the spinner on the button. `text` is shown to the moderator as a toast. */
export const answerCallback = (config: TelegramConfig, callbackQueryId: string, text: string) =>
  call(config, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text });
