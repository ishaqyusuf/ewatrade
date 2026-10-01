import { randomUUID } from "node:crypto"
import { prisma } from "../src/client"
import {
  assertPlayReviewExpiry,
  assertPlayReviewerOwnerEmail,
  readPlayReviewerTarget,
} from "../src/queries/play-reviewer-entitlement"
import {
  getRetailOpsSubscriptionSnapshot,
  processRetailOpsBillingProviderEvent,
} from "../src/queries/retail-ops-subscriptions"

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]?.trim()
}

const action = argument("--action")
const tenantId = argument("--tenant-id")
const ownerEmail = argument("--owner-email")
const expiresAt = argument("--expires-at")
const apply = process.argv.includes("--apply")

if (action !== "grant" && action !== "revoke") {
  throw new Error("Pass --action grant or --action revoke.")
}
if (!tenantId || !ownerEmail) {
  throw new Error("Pass --tenant-id and --owner-email for the isolated demo.")
}
assertPlayReviewerOwnerEmail(ownerEmail)
const expiry = action === "grant" ? new Date(expiresAt ?? "") : null
if (expiry) assertPlayReviewExpiry(expiry)

try {
  const { tenant, target } = await readPlayReviewerTarget(prisma, {
    action,
    expectedOwnerEmail: ownerEmail,
    tenantId,
  })

  if (!apply) {
    process.stdout.write(
      `${JSON.stringify({
        action,
        apply: false,
        currentProvider: tenant?.subscription?.provider ?? null,
        currentStatus: tenant?.subscription?.status ?? null,
        expiresAt: expiry?.toISOString() ?? null,
        planAfter: action === "grant" ? "pro" : "starter",
        tenantId: target.tenantId,
        tenantSlug: tenant?.slug,
      })}\n`,
    )
  } else {
    if (
      process.env.PLAY_REVIEW_ENTITLEMENT_APPROVED !== "true" ||
      argument("--confirm") !== tenant?.slug
    ) {
      throw new Error(
        "Applying a review entitlement requires owner approval, PLAY_REVIEW_ENTITLEMENT_APPROVED=true, and --confirm with the exact demo slug.",
      )
    }
    const now = new Date()
    if (expiry) assertPlayReviewExpiry(expiry, now)
    const { result, snapshot } = await prisma.$transaction(
      async (tx) => {
        // The dry-run read above is advisory. Recheck the exact target inside
        // the write transaction so a new purchase, subscription or owner
        // change cannot be overwritten by an approved review grant.
        const { tenant: currentTenant, target: currentTarget } =
          await readPlayReviewerTarget(tx, {
            action,
            expectedOwnerEmail: ownerEmail,
            tenantId,
          })
        if (currentTenant?.slug !== argument("--confirm")) {
          throw new Error("The review demo confirmation changed.")
        }
        const event = {
          eventId: `play-review:${currentTarget.tenantId}:${action}:${randomUUID()}`,
          metadata: { purpose: "play_review", action },
          provider: "manual" as const,
          subscription: {
            billingSubscriptionId: currentTarget.subscriptionId,
            cancelAtPeriodEnd: false,
            cancelledAt: action === "revoke" ? now : null,
            currentPeriodEndsAt: expiry ?? now,
            currentPeriodStartsAt: now,
            planId:
              action === "grant" ? ("pro" as const) : ("starter" as const),
            status:
              action === "grant" ? ("active" as const) : ("cancelled" as const),
            tenantId: currentTarget.tenantId,
          },
          tenantId: currentTarget.tenantId,
          type:
            action === "grant"
              ? ("subscription_activated" as const)
              : ("subscription_cancelled" as const),
        }
        const result = await processRetailOpsBillingProviderEvent(tx, event)
        if (result.providerEvent.status !== "processed") {
          throw new Error("The review entitlement event was not applied.")
        }
        const snapshot = await getRetailOpsSubscriptionSnapshot(tx, {
          tenantId: currentTarget.tenantId,
        })
        if (
          snapshot.subscription.source !== "tenant_subscription" ||
          snapshot.plan.id !== (action === "grant" ? "pro" : "starter") ||
          snapshot.subscription.status !==
            (action === "grant" ? "active" : "cancelled")
        ) {
          throw new Error(
            "The review entitlement did not reconcile to the expected access state.",
          )
        }
        return { result, snapshot }
      },
      { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
    )
    process.stdout.write(
      `${JSON.stringify({
        action,
        apply: true,
        eventId: result.providerEvent.eventId,
        expiresAt: snapshot.subscription.currentPeriodEndsAt,
        plan: snapshot.plan.id,
        status: snapshot.subscription.status,
        tenantId: target.tenantId,
      })}\n`,
    )
  }
} finally {
  await prisma.$disconnect()
}
