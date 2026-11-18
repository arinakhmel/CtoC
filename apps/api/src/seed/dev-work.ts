import { resolve } from 'node:path';
import { LIMITS, splitPrice } from '@ctoc/shared';
import type { PrismaClient, Task, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { assignExecutor, createApplication, resolveOwnedTask } from '../modules/applications/service';
import { getMyBalance, topUpBalance } from '../modules/payments/service';
import { createTask } from '../modules/tasks/service';

/**
 * `pnpm db:seed:work`: DEVELOPMENT ONLY. A verified test student and a customer with a task assigned to that student
 * (`in_progress`), so the executor's side of Epic 5 (US-27 and later) can be tried in the browser.
 *
 * It never changes or deletes an existing account, so a real local account and its pending verification request are untouched.
 * It creates what is missing. Without `--new-task` it also finishes an interrupted first test task (publishes it, adds the
 * application, assigns the student); with `--new-task` an existing task is left exactly as it is and one more is added. The only
 * change to existing data is a sandbox top-up of the test customer's balance when it is below the task price. It goes through
 * the real services wherever one exists: the balance top-up
 * (US-26), the task (US-16), the application (US-18) and the assignment with the escrow (US-25). Two steps are written
 * directly because the code for them is not built yet: the accounts themselves (a student can be approved only through
 * Telegram, there is no moderator screen), and the publication of the task (US-40).
 */
export const SEED_STUDENT_EMAIL = 'seed.student@ctoc.local';
export const SEED_CUSTOMER_EMAIL = 'seed.customer@ctoc.local';
export const SEED_TASK_TITLE = '[Тест] Логотип для кав’ярні (US-27)';
const SEED_TASK_DESCRIPTION =
  'Потрібен логотип у двох кольорах. Файли у форматі SVG і PNG. Це тестове завдання для ручної перевірки завантаження результату.';
const SEED_PRICE_KOPECKS = 50_000; // 500 UAH
const SEED_TOPUP_KOPECKS = 100_000; // 1000 UAH, sandbox money
/** A development-only commission of 10 %. The real rate comes from the settings (US-03), which are not built yet (OQ-22). */
export const SEED_COMMISSION_BP = 1000;
const SEED_DEADLINE_DAYS = 14;

/**
 * Refuses to run anywhere that looks like production or a server: NODE_ENV=production, any Railway variable, a database that
 * is not a SQLite `file:` URL, or an absolute Unix path (the Railway volume is `/data`). Returns the file the seeder would use.
 */
export function assertSafeTarget(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === 'production') throw new Error('Refusing to run: NODE_ENV is production');
  const railway = Object.keys(env).find((key) => key.startsWith('RAILWAY_'));
  if (railway) throw new Error('Refusing to run: this looks like a Railway environment');
  const url = env.DATABASE_URL ?? '';
  if (!url.startsWith('file:')) throw new Error('Refusing to run: DATABASE_URL is not a local SQLite file');
  const path = url.slice('file:'.length).split('?')[0] ?? '';
  if (path.startsWith('/')) throw new Error('Refusing to run: DATABASE_URL is an absolute server path');
  return resolve(process.cwd(), 'prisma', path); // relative paths are relative to apps/api/prisma, like Prisma reads them
}

export interface SeedPasswords {
  student?: string | undefined;
  customer?: string | undefined;
}

export interface SeedReport {
  lines: string[];
  taskId: string | null;
}

const taskOf = (prisma: PrismaClient, customerId: string) => prisma.task.findFirst({ where: { customerId, title: SEED_TASK_TITLE } });

/** What `--apply` would do (with `--new-task`, also the numbered task), read from the database. Writes nothing. */
export async function planWorkData(prisma: PrismaClient, options: { newTask?: boolean } = {}): Promise<string[]> {
  const [student, customer] = await Promise.all([
    prisma.user.findUnique({ where: { email: SEED_STUDENT_EMAIL } }),
    prisma.user.findUnique({ where: { email: SEED_CUSTOMER_EMAIL } }),
  ]);
  const task = customer ? await taskOf(prisma, customer.id) : null;
  const lines = [
    `student ${SEED_STUDENT_EMAIL}: ${student ? `exists (${student.studentVerifiedAt ? 'verified' : 'NOT verified, would stop'}), not changed` : 'will be created, verified'}`,
    `customer ${SEED_CUSTOMER_EMAIL}: ${customer ? 'exists, not changed' : 'will be created'}`,
  ];
  if (!task) {
    lines.push('balance: sandbox top-up if below the task price; task: will be created and published (commission 10 %, development value)');
    lines.push('application of the student: will be created; assignment: will run (escrow held, notification «Вас обрано»)');
  } else if (options.newTask) {
    lines.push(`task "${task.title}" (${task.id}): exists in status ${task.status}, left as it is`);
  } else if (task.status === 'in_progress' && task.executorId === student?.id) {
    lines.push(`task "${task.title}" (${task.id}): already assigned to the student, nothing to do`);
  } else {
    lines.push(`task "${task.title}" (${task.id}): exists in status ${task.status}, the missing steps would run`);
  }
  if (options.newTask) {
    try {
      const title = customer ? await nextNumberedTitle(prisma, customer.id, task === null) : `${NUMBERED_TITLE_PREFIX}2`;
      lines.push(`new task: "${title}" will be created, published and assigned to the student (balance topped up in the sandbox if needed)`);
    } catch (error) {
      lines.push(`new task: ${error instanceof Error ? error.message : error}`);
    }
  }
  return lines;
}

async function ensureUser(
  prisma: PrismaClient,
  options: { email: string; role: 'student' | 'customer'; displayName: string; password: string | undefined; envName: string; verified: boolean },
): Promise<{ user: User; created: boolean }> {
  const existing = await prisma.user.findUnique({ where: { email: options.email } });
  if (existing) {
    if (existing.role !== options.role) throw new Error(`${options.email} exists with role ${existing.role}; not changed, stopping`);
    if (existing.emailConfirmedAt === null) {
      throw new Error(`${options.email} exists but its email is not confirmed; accounts are never changed, stopping`);
    }
    if (options.verified && existing.studentVerifiedAt === null) {
      throw new Error(`${options.email} exists but is not a verified student; accounts are never changed, stopping`);
    }
    return { user: existing, created: false };
  }
  if (!options.password) throw new Error(`${options.envName} is required to create ${options.email} (set it in your local .env)`);
  if (options.password.length < LIMITS.passwordMinLength) {
    throw new Error(`${options.envName} must have at least ${LIMITS.passwordMinLength} characters`);
  }
  const passwordHash = await bcrypt.hash(options.password, 10);
  const now = new Date();
  const user = await prisma.$transaction(async (tx) => {
    const row = await tx.user.create({
      data: {
        email: options.email,
        passwordHash,
        displayName: options.displayName,
        role: options.role,
        emailConfirmedAt: now,
        studentVerifiedAt: options.verified ? now : null,
      },
    });
    if (options.verified) {
      await tx.auditEvent.create({
        data: { action: 'verification.approved', entity: 'user', entityId: row.id, dataJson: JSON.stringify({ via: 'dev-seed' }) },
      });
    }
    return row;
  });
  return { user, created: true };
}

/** Publication is the moderator's act (US-40, not built). Same fields it will set, only while the task is still pending. */
async function publishForDevelopment(prisma: PrismaClient, task: Task): Promise<void> {
  const split = splitPrice(task.priceKopecks, SEED_COMMISSION_BP);
  await prisma.task.updateMany({
    where: { id: task.id, status: 'pending_moderation' },
    data: {
      status: 'published',
      publishedAt: new Date(),
      commissionBp: SEED_COMMISSION_BP,
      commissionKopecks: split.commissionKopecks,
      netKopecks: split.netKopecks,
    },
  });
}

export interface SeedOptions {
  /**
   * Also create one more assigned task (a numbered one), for repeating a manual check. An existing task is left exactly as it is;
   * the new title and the limit of 20 are settled before anything is written.
   */
  newTask?: boolean;
}

/** The most numbered test tasks one seed customer may have: a guard against filling the development database by accident. */
const SEED_TASKS_MAX = 20;
const NUMBERED_TITLE_PREFIX = '[Тест] Завдання для ручної перевірки №';

/** The title of the next numbered test task: №2 when the first one (SEED_TASK_TITLE) exists, and so on. */
async function nextNumberedTitle(prisma: PrismaClient, customerId: string, baseTaskWillBeCreated = false): Promise<string> {
  const existing = await prisma.task.findMany({ where: { customerId, title: { startsWith: '[Тест] ' } }, select: { title: true } });
  // The first task (SEED_TASK_TITLE) is №1: when it is still to be created it counts, so the plan and the run name the same task.
  const count = existing.length + (baseTaskWillBeCreated ? 1 : 0);
  if (count >= SEED_TASKS_MAX) throw new Error(`Refusing to create more than ${SEED_TASKS_MAX} test tasks for ${SEED_CUSTOMER_EMAIL}`);
  const titles = new Set(existing.map((row) => row.title));
  let number = count + 1;
  while (titles.has(`${NUMBERED_TITLE_PREFIX}${number}`)) number += 1;
  return `${NUMBERED_TITLE_PREFIX}${number}`;
}

/** The title the next `--new-task` would use for this customer, or the refusal at the limit. Reads only. */
async function newTaskTitleFor(prisma: PrismaClient, customerId: string): Promise<string> {
  const base = await prisma.task.findFirst({ where: { customerId, title: SEED_TASK_TITLE }, select: { id: true } });
  return nextNumberedTitle(prisma, customerId, base === null);
}

/**
 * Brings the test task with this title to `in_progress` with the student as executor, through the real services, and does
 * only the steps that are missing. A task that is already past that point (for example in review) is left as it is.
 * Returns the task and whether it is a task the student can work on now.
 */
async function ensureAssignedTask(
  prisma: PrismaClient,
  customer: User,
  student: User,
  title: string,
  lines: string[],
): Promise<{ task: Task; ready: boolean }> {
  let task = await prisma.task.findFirst({ where: { customerId: customer.id, title } });
  if (task && task.status !== 'pending_moderation' && task.status !== 'published') {
    lines.push(`task "${task.title}" (${task.id}): status ${task.status}, nothing to do`);
    return { task, ready: false };
  }

  if (!task) {
    const deadlineAt = new Date(Date.now() + SEED_DEADLINE_DAYS * 24 * 3600 * 1000).toISOString();
    task = await createTask(customer, { title, description: SEED_TASK_DESCRIPTION, priceKopecks: SEED_PRICE_KOPECKS, deadlineAt });
    lines.push(`task created: "${title}" (${task.id})`);
  }
  if (task.status === 'pending_moderation') {
    await publishForDevelopment(prisma, task);
    lines.push('task published (development shortcut for US-40, commission 10 %)');
  }

  const executorChosen = (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).executorId !== null;
  if (!executorChosen) {
    // The money is needed only to reserve the price when the student is selected, so the balance is checked here: it also lets an
    // interrupted run of an older task be finished. A sandbox top-up of the test customer is the one change to existing data.
    if ((await getMyBalance(customer)) < SEED_PRICE_KOPECKS) {
      await topUpBalance(customer, { amountKopecks: SEED_TOPUP_KOPECKS });
      lines.push(`balance: topped up by ${SEED_TOPUP_KOPECKS / 100} UAH (sandbox)`);
    }
    let application = await prisma.application.findFirst({ where: { taskId: task.id, studentId: student.id } });
    if (!application) {
      application = await createApplication(student, task.id, {});
      lines.push('application of the student created');
    }
    const owned = await resolveOwnedTask(customer, task.id);
    // A fixed key per task: a repeat of an interrupted run returns the same escrow instead of charging twice (US-26 sc.3).
    await assignExecutor(customer, owned, { applicationId: application.id }, `seed-work-${task.id}`);
    lines.push('student selected as the executor: task in progress, escrow held, notification sent');
  }
  return { task, ready: true };
}

/**
 * Creates what is missing, step by step; a second run finds everything in place and changes nothing. Never prints a password.
 * With `newTask` it then adds one more numbered task, so a manual check can be repeated after an earlier task has moved on.
 */
export async function seedWorkData(prisma: PrismaClient, passwords: SeedPasswords, options: SeedOptions = {}): Promise<SeedReport> {
  const lines: string[] = [];
  // The limit of 20 counts the tasks of the test customer, so it can only be reached when that customer exists. It is checked here,
  // before any account is created: a refusal must not leave a new student behind. (A customer that does not exist has no tasks.)
  if (options.newTask) {
    const existingCustomer = await prisma.user.findUnique({ where: { email: SEED_CUSTOMER_EMAIL } });
    if (existingCustomer) await newTaskTitleFor(prisma, existingCustomer.id);
  }
  const student = await ensureUser(prisma, {
    email: SEED_STUDENT_EMAIL,
    role: 'student',
    displayName: 'Тестовий Студент',
    password: passwords.student,
    envName: 'SEED_STUDENT_PASSWORD',
    verified: true,
  });
  const customer = await ensureUser(prisma, {
    email: SEED_CUSTOMER_EMAIL,
    role: 'customer',
    displayName: 'Тестовий Замовник',
    password: passwords.customer,
    envName: 'SEED_CUSTOMER_PASSWORD',
    verified: false,
  });
  lines.push(`student ${SEED_STUDENT_EMAIL}: ${student.created ? 'created, verified' : 'already exists, not changed'}`);
  lines.push(`customer ${SEED_CUSTOMER_EMAIL}: ${customer.created ? 'created' : 'already exists, not changed'}`);

  if (!options.newTask) {
    const base = await ensureAssignedTask(prisma, customer.user, student.user, SEED_TASK_TITLE, lines);
    if (base.ready) lines.push(`ready: log in as ${SEED_STUDENT_EMAIL} and open /me/work (task ${base.task.id})`);
    return { lines, taskId: base.task.id };
  }

  // With `--new-task` an existing first task is left exactly as it is, in whatever state it is. It is created only when it is missing.
  // The title is settled again here, now that the accounts exist, and before any task is written. The limit was already checked above.
  const baseTask = await prisma.task.findFirst({ where: { customerId: customer.user.id, title: SEED_TASK_TITLE } });
  const newTitle = await nextNumberedTitle(prisma, customer.user.id, baseTask === null);
  if (baseTask) lines.push(`task "${baseTask.title}" (${baseTask.id}): status ${baseTask.status}, left as it is`);
  else await ensureAssignedTask(prisma, customer.user, student.user, SEED_TASK_TITLE, lines);

  const extra = await ensureAssignedTask(prisma, customer.user, student.user, newTitle, lines);
  lines.push(`ready: log in as ${SEED_STUDENT_EMAIL} and open /me/work (new task ${extra.task.id}, title "${extra.task.title}")`);
  return { lines, taskId: extra.task.id };
}
