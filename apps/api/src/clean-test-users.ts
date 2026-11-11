import { prisma } from './platform/db';

/**
 * `pnpm db:clean-users`: development helper. Deletes every user except moderators, together with their
 * tasks, money records and files rows, so the same test e-mail can be registered again.
 * Keeps moderators, university domains, skills and settings. Never run against production data.
 */
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production');

  const users = await prisma.user.findMany({ where: { role: { not: 'moderator' } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) {
    console.log('No non-moderator users found.');
    return;
  }

  const tasks = await prisma.task.findMany({
    where: { OR: [{ customerId: { in: userIds } }, { executorId: { in: userIds } }] },
    select: { id: true },
  });
  const taskIds = tasks.map((t) => t.id);
  const withdrawals = await prisma.withdrawal.findMany({ where: { studentId: { in: userIds } }, select: { id: true } });
  const withdrawalIds = withdrawals.map((w) => w.id);
  const versions = await prisma.resultVersion.findMany({ where: { taskId: { in: taskIds } }, select: { id: true } });
  const versionIds = versions.map((v) => v.id);
  const owners = [...userIds];

  const counts = await prisma.$transaction(async (tx) => {
    const c: Record<string, number> = {};
    c.resultFiles = (await tx.resultFile.deleteMany({ where: { resultVersionId: { in: versionIds } } })).count;
    c.resultVersions = (await tx.resultVersion.deleteMany({ where: { id: { in: versionIds } } })).count;
    c.messages = (
      await tx.message.deleteMany({ where: { OR: [{ taskId: { in: taskIds } }, { senderId: { in: userIds } }] } })
    ).count;
    c.ledgerEntries = (
      await tx.ledgerEntry.deleteMany({
        where: { OR: [{ ownerId: { in: owners } }, { taskId: { in: taskIds } }, { withdrawalId: { in: withdrawalIds } }] },
      })
    ).count;
    c.balances = (await tx.balance.deleteMany({ where: { ownerId: { in: owners } } })).count;
    c.withdrawals = (await tx.withdrawal.deleteMany({ where: { id: { in: withdrawalIds } } })).count;
    c.escrows = (
      await tx.escrow.deleteMany({ where: { OR: [{ taskId: { in: taskIds } }, { customerId: { in: userIds } }] } })
    ).count;
    c.experienceRecords = (
      await tx.experienceRecord.deleteMany({
        where: { OR: [{ taskId: { in: taskIds } }, { studentId: { in: userIds } }] },
      })
    ).count;
    c.applications = (
      await tx.application.deleteMany({ where: { OR: [{ taskId: { in: taskIds } }, { studentId: { in: userIds } }] } })
    ).count;
    c.tasks = (await tx.task.deleteMany({ where: { id: { in: taskIds } } })).count;
    c.verificationRequests = (await tx.verificationRequest.deleteMany({ where: { userId: { in: userIds } } })).count;
    c.files = (await tx.file.deleteMany({ where: { ownerId: { in: userIds } } })).count;
    c.notifications = (await tx.notification.deleteMany({ where: { userId: { in: userIds } } })).count;
    c.profileSkills = (await tx.profileSkill.deleteMany({ where: { userId: { in: userIds } } })).count;
    c.studentProfiles = (await tx.studentProfile.deleteMany({ where: { userId: { in: userIds } } })).count;
    c.emailTokens = (await tx.emailToken.deleteMany({ where: { userId: { in: userIds } } })).count;
    c.sessions = (await tx.session.deleteMany({ where: { userId: { in: userIds } } })).count;
    c.auditEvents = (await tx.auditEvent.deleteMany({ where: { actorId: { in: userIds } } })).count;
    c.users = (await tx.user.deleteMany({ where: { id: { in: userIds } } })).count;
    return c;
  });

  console.log('Deleted:', counts);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
