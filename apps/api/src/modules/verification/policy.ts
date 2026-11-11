import { ApiError } from '../../errors';
import { secretMatches, telegramConfig } from '../../platform/telegram';
/** INV-02: only a student with a confirmed email can submit a document or see its status (api.md access S-). */
export { assertStudentWithConfirmedEmail } from '../../http/access';

/**
 * The Telegram webhook is public but must prove it is Telegram: the `X-Telegram-Bot-Api-Secret-Token` header has
 * to equal TELEGRAM_WEBHOOK_SECRET. Not configured or wrong: 404, so the URL does not reveal that it exists.
 */
export function assertTelegramWebhook(secretHeader: string | undefined): void {
  const config = telegramConfig();
  if (!config || !secretMatches(secretHeader, config.webhookSecret)) throw new ApiError('NOT_FOUND');
}
