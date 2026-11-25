import type { User } from '@prisma/client';
import { LIMITS } from '@ctoc/shared';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { findCommissionBp, findCommissionBpTx, insertSettingsAudit, upsertCommissionBp } from './repo';

/**
 * US-03, INV-08. The rate in force: the setting, or `LIMITS.commissionBp.default` when nobody has set it. The database constrains
 * only the key, so a stored value is checked against the documented range: a bad one is never shown to a visitor or snapshotted
 * (500 `INTERNAL_ERROR`, logged), as in the publish of US-40.
 */
export async function getCommissionBp(): Promise<number> {
  const stored = await findCommissionBp();
  if (stored === null) return LIMITS.commissionBp.default;
  if (!Number.isInteger(stored) || stored < LIMITS.commissionBp.min || stored > LIMITS.commissionBp.max) {
    console.error(`Setting commission_bp is ${stored}, outside ${LIMITS.commissionBp.min}..${LIMITS.commissionBp.max}`);
    throw new ApiError('INTERNAL_ERROR');
  }
  return stored;
}

/**
 * US-03 sc.3. The moderator sets the rate; the access check is done by the caller (INV-25). The change and its audit event are one
 * transaction. It applies to tasks published afterwards: a published task keeps its snapshot (INV-08).
 */
export async function setCommissionBp(moderator: User, commissionBp: number): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const previous = await findCommissionBpTx(tx);
    await upsertCommissionBp(tx, commissionBp, moderator.id);
    await insertSettingsAudit(tx, { actorId: moderator.id, key: 'commission_bp', from: previous, to: commissionBp });
    return commissionBp;
  });
}
