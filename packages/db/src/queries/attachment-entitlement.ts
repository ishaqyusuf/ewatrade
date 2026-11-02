import {
  assertRetailOpsPlanIdFeature,
  getRetailOpsOwnerPlanId,
  resolveRetailOpsPlanId,
} from "./retail-ops-subscriptions"
import type { DbClient } from "./types"

/** Fresh server boundary; never admit an upload from a cached client plan. */
export async function assertAttachmentEntitlement(
  db: DbClient,
  input: { tenantId: string },
) {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: input.tenantId },
    select: {
      metadata: true,
      subscription: {
        select: {
          plan: { select: { key: true } },
          provider: true,
          status: true,
          billingSubscriptionId: true,
          currentPeriodEndsAt: true,
        },
      },
    },
  })
  return assertRetailOpsPlanIdFeature(
    resolveRetailOpsPlanId({
      metadata: tenant.metadata,
      subscription: tenant.subscription,
      ownerPlanId: await getRetailOpsOwnerPlanId(db, input.tenantId),
    }),
    "attachments",
  )
}
