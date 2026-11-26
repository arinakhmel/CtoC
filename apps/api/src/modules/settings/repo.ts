import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';

type Tx = Prisma.TransactionClient;

/** The stored commission rate in basis points, or null when nobody has set it yet. */
export const findCommissionBp = async (): Promise<number | null> =>
  (await prisma.setting.findUnique({ where: { key: 'commission_bp' } }))?.value ?? null;

/** The same read inside a transaction, for the audit event. */
export const findCommissionBpTx = async (tx: Tx): Promise<number | null> =>
  (await tx.setting.findUnique({ where: { key: 'commission_bp' } }))?.value ?? null;

/** US-03 sc.3. One row per key, so the write is an upsert on the primary key: the last change wins and there is no read-then-write. */
export const upsertCommissionBp = (tx: Tx, value: number, updatedBy: string) =>
  tx.setting.upsert({
    where: { key: 'commission_bp' },
    create: { key: 'commission_bp', value, updatedBy },
    update: { value, updatedBy },
  });

/** NFR-15. Append-only. */
export const insertSettingsAudit = (tx: Tx, data: { actorId: string; key: string; from: number | null; to: number }) =>
  tx.auditEvent.create({
    data: { actorId: data.actorId, action: 'settings.update', entity: 'setting', entityId: data.key, dataJson: JSON.stringify({ from: data.from, to: data.to }) },
  });
