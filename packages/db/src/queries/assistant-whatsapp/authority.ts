import { isAssistantWhatsAppPilotTenant } from "@ewatrade/assistant/channels/policy"
import { whatsAppFreshSessionMs } from "@ewatrade/assistant/channels/whatsapp"
import { isAccountPrivacyAccessBlocked } from "../account-privacy-access"
import { isLegalSignupSessionBlocked } from "../legal-session-access"
import { getCustomerAccountAgeStatus } from "../store-conversation-age-authority"
import { getActiveTenantForUser } from "../tenants"
import type { DbClient } from "../types"

export class AssistantWhatsAppError extends Error {
  constructor(
    readonly code:
      | "UNAVAILABLE"
      | "UNAUTHORIZED"
      | "CONFLICT"
      | "EXPIRED"
      | "RATE_LIMITED",
  ) {
    super(
      {
        UNAVAILABLE: "WhatsApp assistant connection unavailable.",
        UNAUTHORIZED: "Sign in again or choose an accessible Store.",
        CONFLICT: "This connection changed. Start a new link.",
        EXPIRED: "This connection expired. Start a new link.",
        RATE_LIMITED: "Too many connection attempts. Try again later.",
      }[code],
    )
    this.name = "AssistantWhatsAppError"
  }
}

export type WhatsAppActorScope = {
  userId: string
  tenantId: string
  storeId: string
  membershipId: string
}
export type WhatsAppWebActor = WhatsAppActorScope & { sessionId: string }
export type WhatsAppPersonalActor = { userId: string; sessionId: string }

/** Personal disconnect/status needs a real session, even when all business access is lost. */
export async function requireWhatsAppPersonalActor(
  db: DbClient,
  actor: WhatsAppPersonalActor,
  now: Date,
) {
  const session = await db.session.findFirst({
    where: {
      id: actor.sessionId,
      userId: actor.userId,
      expiresAt: { gt: now },
      qaAuthorizationId: null,
      NOT: { token: { startsWith: "qas_" } },
    },
    select: { id: true },
  })
  if (!session) throw new AssistantWhatsAppError("UNAUTHORIZED")
}

/** Current domain authority, shared by app linking and the future channel principal. */
export async function requireWhatsAppActorScope(
  db: DbClient,
  scope: WhatsAppActorScope,
) {
  const tenant = await db.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { slug: true },
  })
  if (!tenant || !isAssistantWhatsAppPilotTenant(scope.tenantId))
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const context = await getActiveTenantForUser(db, {
    userId: scope.userId,
    tenantSlug: tenant.slug,
    storeId: scope.storeId,
  })
  if (
    !context ||
    context.tenant.id !== scope.tenantId ||
    context.membership.id !== scope.membershipId ||
    context.activeStore?.id !== scope.storeId ||
    context.activeStore.status !== "ACTIVE" ||
    context.tenant.qaPurgeStartedAt ||
    context.staffAccess?.status !== "ACTIVE" ||
    !["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"].includes(
      context.membership.role,
    )
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  if (
    !(await getCustomerAccountAgeStatus(db, scope.userId)).eligible ||
    (await isAccountPrivacyAccessBlocked(db, scope.userId)) ||
    (await isLegalSignupSessionBlocked(db, scope.userId))
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  return context
}

export async function requireWhatsAppWebActor(
  db: DbClient,
  actor: WhatsAppWebActor,
  now: Date,
  fresh = true,
) {
  const session = await db.session.findFirst({
    where: {
      id: actor.sessionId,
      userId: actor.userId,
      expiresAt: { gt: now },
      ...(fresh
        ? {
            createdAt: {
              gte: new Date(now.getTime() - whatsAppFreshSessionMs),
              lte: now,
            },
          }
        : {}),
    },
    select: { id: true },
  })
  if (!session) throw new AssistantWhatsAppError("UNAUTHORIZED")
  return requireWhatsAppActorScope(db, actor)
}

/** Call inside the owning mutation transaction; access changes lock the same rows. */
export async function lockWhatsAppWebActor(
  db: DbClient,
  actor: WhatsAppWebActor,
  now: Date,
  fresh = true,
) {
  await db.$queryRaw`SELECT id FROM "Membership" WHERE id=${actor.membershipId} AND "tenantId"=${actor.tenantId} AND "userId"=${actor.userId} FOR SHARE`
  await db.$queryRaw`SELECT id FROM "Session" WHERE id=${actor.sessionId} AND "userId"=${actor.userId} FOR SHARE`
  return requireWhatsAppWebActor(db, actor, now, fresh)
}
