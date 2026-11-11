import { ensureModerator } from './seed/moderator';
import { prisma } from './platform/db';

/** `pnpm db:seed`: development data. Reads SEED_MODERATOR_EMAIL and SEED_MODERATOR_PASSWORD from .env. */
async function main() {
  const email = process.env.SEED_MODERATOR_EMAIL ?? 'moderator@ctoc.local';
  const password = process.env.SEED_MODERATOR_PASSWORD;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !password) throw new Error('SEED_MODERATOR_PASSWORD is required in production');
  const effectivePassword = password ?? 'moderator-pass';

  const created = await ensureModerator(prisma, { email, password: effectivePassword });
  console.log(
    created
      ? `Moderator created: ${email}${password ? '' : ' (default development password "moderator-pass", change it in .env)'}`
      : `Moderator already exists: ${email} (not changed)`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
