import { z } from 'zod';

/**
 * The part of a Telegram `Update` that `POST /api/webhooks/telegram` reads (inline-button clicks).
 * Everything is optional at the top level, because the bot may also receive updates we ignore.
 */
export const telegramUpdateSchema = z.object({
  callback_query: z
    .object({
      id: z.string(),
      from: z.object({
        id: z.number(),
        username: z.string().optional(),
        first_name: z.string().optional(),
      }),
      data: z.string().optional(),
      message: z
        .object({
          message_id: z.number(),
          chat: z.object({ id: z.number() }),
          caption: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
