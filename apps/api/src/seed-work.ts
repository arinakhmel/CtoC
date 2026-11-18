import { prisma } from './platform/db';
import { assertSafeTarget, planWorkData, seedWorkData } from './seed/dev-work';

/**
 * `pnpm db:seed:work`: development data for trying Epic 5 in the browser (see `seed/dev-work.ts`).
 * Without `--apply` it only shows what it would do. Passwords come from SEED_STUDENT_PASSWORD and SEED_CUSTOMER_PASSWORD
 * in your local .env, are needed only to create an account that does not exist yet, and are never printed.
 * `--new-task` also adds one more numbered, assigned test task, to repeat a manual check after the earlier task has moved on
 * (for example it is in review). An existing task is left as it is; the only change to existing data is a sandbox top-up of the
 * test customer's balance. It refuses production, Railway and any database that is not a local file.
 */
async function main() {
  const databaseFile = assertSafeTarget();
  const apply = process.argv.includes('--apply');
  const newTask = process.argv.includes('--new-task');
  const passwords = { student: process.env.SEED_STUDENT_PASSWORD, customer: process.env.SEED_CUSTOMER_PASSWORD };

  console.log(`mode: ${apply ? 'APPLY' : 'dry-run (nothing is written; add --apply to write)'}${newTask ? ', with a new task' : ''}`);
  console.log(`database file: ${databaseFile}`);
  console.log(`SEED_STUDENT_PASSWORD: ${passwords.student ? 'set' : 'not set'}, SEED_CUSTOMER_PASSWORD: ${passwords.customer ? 'set' : 'not set'} (values are never printed)`);

  if (!apply) {
    for (const line of await planWorkData(prisma, { newTask })) console.log(`- ${line}`);
    return;
  }
  const report = await seedWorkData(prisma, passwords, { newTask });
  for (const line of report.lines) console.log(`- ${line}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
