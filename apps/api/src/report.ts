import { prisma } from './platform/db';

/**
 * `pnpm db:report`: read-only snapshot of the database as JSON on stdout (nothing is written).
 * On Railway run it inside the container: `railway ssh pnpm --filter @ctoc/api db:report`.
 * Never prints password hashes, tokens or card numbers. `--users` adds the user list (emails).
 */
async function main() {
  const withUsers = process.argv.includes('--users');

  const [users, tasksByStatus, applications, escrows, withdrawals, verifications, experience, files] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.application.count(),
    prisma.escrow.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountKopecks: true } }),
    prisma.withdrawal.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountKopecks: true } }),
    prisma.verificationRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.experienceRecord.count(),
    prisma.file.count({ where: { deletedAt: null } }),
  ]);

  const count = <T extends { _count: { _all: number } }>(rows: T[], key: keyof T) =>
    Object.fromEntries(rows.map((row) => [String(row[key]), row._count._all]));

  const report = {
    generatedAt: new Date().toISOString(),
    usersByRole: count(users, 'role'),
    tasksByStatus: count(tasksByStatus, 'status'),
    applications,
    escrows: escrows.map((e) => ({ status: e.status, count: e._count._all, kopecks: e._sum.amountKopecks ?? 0 })),
    withdrawals: withdrawals.map((w) => ({ status: w.status, count: w._count._all, kopecks: w._sum.amountKopecks ?? 0 })),
    verificationsByStatus: count(verifications, 'status'),
    experienceRecords: experience,
    files,
    ...(withUsers
      ? {
          users: await prisma.user.findMany({
            select: { id: true, email: true, role: true, displayName: true, emailConfirmedAt: true, studentVerifiedAt: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          }),
        }
      : {}),
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
