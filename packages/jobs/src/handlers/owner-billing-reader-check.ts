import { appStoreReviewOwnerIds } from "@ewatrade/db/owner-billing"

/** Internal operator check; never scheduled or exposed to product/assistant callers. */
export function ownerBillingReaderRequest(
  payload: unknown,
  env: Record<string, string | undefined> = process.env,
): { ownerUserId: string; tenantId: string } | null {
  const reviewers = appStoreReviewOwnerIds(env)
  if (!reviewers.length) return null
  if (
    reviewers.length !== 1 ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !("ownerUserId" in payload) ||
    !("tenantId" in payload) ||
    typeof payload.ownerUserId !== "string" ||
    typeof payload.tenantId !== "string" ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(payload.tenantId) ||
    payload.ownerUserId !== reviewers[0] ||
    Object.keys(payload).some(
      (key) => key !== "ownerUserId" && key !== "tenantId",
    )
  )
    throw new Error("Billing reader check scope refused.")
  return { ownerUserId: payload.ownerUserId, tenantId: payload.tenantId }
}

export async function runOwnerBillingReaderCheck(payload: unknown) {
  const request = ownerBillingReaderRequest(payload)
  if (!request) return { status: "disabled" as const, readOnly: true }
  const { prisma } = await import("@ewatrade/db/client")
  const { getRetailOpsTenantPlan, getRetailOpsOwnerPlanIds } = await import(
    "@ewatrade/db/retail-ops-subscriptions"
  )
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`
      const member = await tx.membership.findUnique({
        where: {
          tenantId_userId: {
            tenantId: request.tenantId,
            userId: request.ownerUserId,
          },
        },
        select: { role: true, status: true },
      })
      if (member?.role !== "OWNER" || member.status !== "ACTIVE")
        throw new Error("Billing reader check scope refused.")
      const plan = await getRetailOpsTenantPlan(tx, {
        tenantId: request.tenantId,
      })
      const ownerPlans = await getRetailOpsOwnerPlanIds(tx, [request.tenantId])
      return {
        status: "checked" as const,
        checkedAt: new Date().toISOString(),
        readOnly: true,
        scopeVerified: true,
        planId: plan.plan.id,
        subscriptionSource: plan.subscription.source,
        ownerPlanId: ownerPlans.get(request.tenantId) ?? null,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
