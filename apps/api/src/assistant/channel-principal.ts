import type { Session } from "@ewatrade/auth"
import {
  isAssistantWhatsAppPilot,
  readAssistantWhatsAppConfig,
} from "@ewatrade/communications"
import {
  AssistantWhatsAppError,
  type WhatsAppConversationPrincipal,
  type WhatsAppInboxLease,
  assertAssistantWhatsAppInboxLease,
  assistantWhatsAppAuthorityDigest,
  resolveAssistantWhatsAppConversation,
} from "@ewatrade/db/assistant-whatsapp"
import type { Prisma, PrismaClient } from "@ewatrade/db/types"
import { TRPCError } from "@trpc/server"
import type { TRPCContext } from "../trpc/init"
import type { GeneralContext } from "./general-context"

const linkedIdentityBrand = Symbol("verified-assistant-channel-identity")
function channelIdentityError(error: unknown): never {
  if (error instanceof AssistantWhatsAppError)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "WhatsApp assistant access changed. Link again or choose an accessible Store.",
    })
  throw error
}
export type LinkedAssistantIdentity = {
  readonly [linkedIdentityBrand]: true
  readonly user: Session["user"]
  /** No browser Session, cookie, token or synthetic session ID exists for this principal. */
  readonly session: null
  readonly purpose: "GENERAL" | "SETUP" | "PRODUCT_CREATE"
  readonly principal: Readonly<WhatsAppConversationPrincipal>
  readonly inboxLease?: Readonly<WhatsAppInboxLease>
}
export type RequestIdentity = Session | LinkedAssistantIdentity

/** The private symbol cannot be supplied in a request header or JSON body. */
export function isLinkedAssistantIdentity(
  identity: unknown,
): identity is LinkedAssistantIdentity {
  return Boolean(
    identity &&
      typeof identity === "object" &&
      linkedIdentityBrand in identity &&
      identity[linkedIdentityBrand] === true,
  )
}

export function requireBrowserIdentity(
  identity: RequestIdentity | null,
): Session {
  if (!identity?.session || isLinkedAssistantIdentity(identity))
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to continue.",
    })
  return identity
}

/** Sole issuer: rereads durable binding, grant, membership, legal/privacy and rollout. */
export async function resolveLinkedAssistantIdentity(
  db: PrismaClient | Prisma.TransactionClient,
  principal: WhatsAppConversationPrincipal,
  inboxLease?: WhatsAppInboxLease,
) {
  const config = readAssistantWhatsAppConfig()
  if (!config || config.phoneNumberId !== principal.phoneNumberId)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "WhatsApp assistant access is unavailable.",
    })
  const resolved = await resolveAssistantWhatsAppConversation(
    db,
    principal,
  ).catch(channelIdentityError)
  if (inboxLease) {
    if (inboxLease.bindingId !== principal.bindingId)
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Assistant work changed.",
      })
    const queued = await assertAssistantWhatsAppInboxLease(
      db,
      inboxLease,
    ).catch(channelIdentityError)
    if (
      queued.executionAuthorityDigest &&
      queued.executionAuthorityDigest !==
        (await assistantWhatsAppAuthorityDigest(db, resolved).catch(
          channelIdentityError,
        ))
    )
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Assistant permissions changed. Send a new message.",
      })
  }
  if (!isAssistantWhatsAppPilot(resolved.scope.userId))
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "WhatsApp assistant access is unavailable.",
    })
  const user = await db.user.findUnique({
    where: { id: resolved.scope.userId },
  })
  if (!user)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Account unavailable.",
    })
  const identity: LinkedAssistantIdentity = Object.freeze({
    [linkedIdentityBrand]: true as const,
    user,
    session: null,
    purpose: resolved.conversation.purpose,
    principal: Object.freeze({ ...principal }),
    ...(inboxLease ? { inboxLease: Object.freeze({ ...inboxLease }) } : {}),
  })
  return { identity, ...resolved }
}

export async function lockLinkedAssistantIdentity(
  db: Prisma.TransactionClient,
  identity: LinkedAssistantIdentity,
) {
  await db.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${identity.principal.phoneNumberId} AND "senderId"=${identity.principal.senderId} FOR SHARE`
  await db.$queryRaw`SELECT id FROM "AssistantWhatsAppGrant" WHERE id=${identity.principal.grantId} FOR SHARE`
  if (identity.inboxLease)
    await db.$queryRaw`SELECT id FROM "AssistantWhatsAppInbox" WHERE id=${identity.inboxLease.inboxId} FOR SHARE`
  return resolveLinkedAssistantIdentity(
    db,
    identity.principal,
    identity.inboxLease,
  )
}

/** Internal runtime entry. Service authentication never substitutes for merchant proof. */
export async function createLinkedAssistantContext(
  db: PrismaClient,
  principal: WhatsAppConversationPrincipal,
  requestId: string,
  inboxLease?: WhatsAppInboxLease,
): Promise<GeneralContext> {
  const resolved = await resolveLinkedAssistantIdentity(
    db,
    principal,
    inboxLease,
  )
  return {
    db,
    session: resolved.identity,
    tenantContext: resolved.tenantContext,
    tenantId: resolved.scope.tenantId,
    tenantSlug: resolved.tenantContext.tenant.slug,
    activeStoreId: resolved.scope.storeId,
    assistantConversationId: resolved.conversation.id,
    requestHeaders: new Headers(),
    requestId,
    cfRay: null,
    isInternalRequest: false,
    forcePrimary: true,
    origin: null,
    clientIp: null,
    privacyClientIp: null,
    userAgent: null,
    qaSessionScope: null,
  }
}
