import type { Prisma, PrismaClient } from "../../generated/prisma/client"

export const PLAY_REVIEW_TENANT_NAME = "EwaTrade Review Demo"
export const PLAY_REVIEW_OWNER_EMAIL = "founders@ewatrade.com"

export function assertPlayReviewerOwnerEmail(value: string) {
  if (value.trim().toLowerCase() !== PLAY_REVIEW_OWNER_EMAIL)
    throw new Error(
      "The review owner email does not match the selected mailbox.",
    )
}

export function playReviewSubscriptionId(tenantId: string) {
  return `play-review:${tenantId}`
}

export function assertPlayReviewerTarget(input: {
  action: "grant" | "revoke"
  expectedOwnerEmail: string
  tenant: {
    id: string
    isActive: boolean
    name: string
    slug: string
    subscription: {
      billingSubscriptionId: string | null
      provider: string
    } | null
    users: Array<{
      user: { email: string; emailVerified: boolean }
    }>
  } | null
}) {
  const tenant = input.tenant
  if (!tenant || !tenant.isActive)
    throw new Error("The review Tenant is unavailable.")
  if (
    tenant.name !== PLAY_REVIEW_TENANT_NAME ||
    !/^ewatrade-review-[a-z0-9-]+$/.test(tenant.slug)
  ) {
    throw new Error("The Tenant is not the isolated Play review demo.")
  }
  const expectedOwnerEmail = input.expectedOwnerEmail.trim().toLowerCase()
  if (
    !expectedOwnerEmail ||
    !tenant.users.some(
      ({ user }) =>
        user.email.trim().toLowerCase() === expectedOwnerEmail &&
        user.emailVerified,
    )
  ) {
    throw new Error(
      "A verified active demo owner must match the expected email.",
    )
  }
  const subscription = tenant.subscription
  const isReviewGrant =
    subscription?.provider === "MANUAL" &&
    subscription.billingSubscriptionId === playReviewSubscriptionId(tenant.id)
  if (input.action === "grant" && subscription && !isReviewGrant) {
    throw new Error("The demo has an unrelated billing subscription.")
  }
  if (input.action === "revoke" && !isReviewGrant) {
    throw new Error("No matching Play review entitlement can be revoked.")
  }
  return {
    tenantId: tenant.id,
    subscriptionId: playReviewSubscriptionId(tenant.id),
  }
}

export async function readPlayReviewerTarget(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    action: "grant" | "revoke"
    expectedOwnerEmail: string
    tenantId: string
  },
) {
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: {
      id: true,
      isActive: true,
      name: true,
      slug: true,
      subscription: {
        select: {
          billingSubscriptionId: true,
          provider: true,
          status: true,
        },
      },
      storeSubscriptionPurchases: { select: { id: true }, take: 1 },
      users: {
        where: { role: "OWNER", status: "ACTIVE" },
        select: {
          user: { select: { email: true, emailVerified: true } },
        },
      },
    },
  })
  const target = assertPlayReviewerTarget({
    action: input.action,
    expectedOwnerEmail: input.expectedOwnerEmail,
    tenant,
  })
  if (tenant?.storeSubscriptionPurchases.length) {
    throw new Error(
      "The demo has a store purchase; do not change its entitlement.",
    )
  }
  return { target, tenant }
}

export function assertPlayReviewExpiry(expiresAt: Date, now = new Date()) {
  const duration = expiresAt.getTime() - now.getTime()
  if (
    !Number.isFinite(duration) ||
    duration < 24 * 60 * 60 * 1000 ||
    duration > 90 * 24 * 60 * 60 * 1000
  ) {
    throw new Error("Review access must expire in 1–90 days.")
  }
}
