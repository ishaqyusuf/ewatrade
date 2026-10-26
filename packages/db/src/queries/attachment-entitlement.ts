import {
  assertRetailOpsPlanIdFeature,
  resolveRetailOpsPlanId,
} from "./retail-ops-subscriptions"
import type { DbClient } from "./types"

/** Fresh server boundary; never admit an upload from a cached client plan. */
export async function assertAttachmentEntitlement(
  db: Pick<DbClient, "tenant">,
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
    }),
    "attachments",
  )
}
