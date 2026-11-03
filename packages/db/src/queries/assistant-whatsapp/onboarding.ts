import { createHmac } from "node:crypto"
import {
  whatsAppFreshSessionMs,
  whatsAppLinkLifetimeMs,
} from "@ewatrade/assistant/channels/whatsapp"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import { createOwnerBusiness } from "../owner-businesses"
import type { DbClient } from "../types"
import {
  AssistantWhatsAppError,
  type WhatsAppPersonalActor,
  lockWhatsAppWebActor,
  requireWhatsAppActorScope,
} from "./authority"
import { confirmAssistantWhatsAppLinkInTransaction } from "./link"

export type WhatsAppOnboardingBusinessChoice = {
  tenantId: string
  storeId: string
  membershipId: string
  businessName: string
  storeName: string
}

async function requireFreshOnboardingSession(
  db: DbClient,
  principal: WhatsAppPersonalActor,
  now: Date,
) {
  const session = await db.session.findFirst({
    where: {
      id: principal.sessionId,
      userId: principal.userId,
      expiresAt: { gt: now },
      createdAt: {
        gte: new Date(now.getTime() - whatsAppFreshSessionMs),
        lte: now,
      },
      qaAuthorizationId: null,
      NOT: { token: { startsWith: "qas_" } },
    },
    select: { id: true, createdAt: true },
  })
  if (!session) throw new AssistantWhatsAppError("UNAUTHORIZED")
  return session
}

/** The caller's onboarding runtime still holds this sender's current message lease. */
async function requireOnboardingLease(
  tx: Prisma.TransactionClient,
  onboardingLease: { token: string; nonce: string },
  now: Date,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${onboardingLease.token}))`
  const flow = await tx.onboardingSession.findUnique({
    where: { token: onboardingLease.token },
    select: { formData: true, expiresAt: true },
  })
  const data = flow?.formData
  const lease =
    data && typeof data === "object" && !Array.isArray(data) ? data.lease : null
  if (
    !flow ||
    flow.expiresAt <= now ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.kind !== "whatsapp_onboarding_runtime_v1" ||
    !lease ||
    typeof lease !== "object" ||
    Array.isArray(lease) ||
    lease.nonce !== onboardingLease.nonce ||
    typeof lease.expiresAt !== "number" ||
    lease.expiresAt <= now.getTime()
  )
    throw new AssistantWhatsAppError("CONFLICT")
}

/** Discover business names only after email proof, through current canonical scope. */
export async function listAssistantWhatsAppOnboardingChoices(
  db: DbClient,
  principal: WhatsAppPersonalActor,
  now = new Date(),
): Promise<WhatsAppOnboardingBusinessChoice[]> {
  await requireFreshOnboardingSession(db, principal, now)
  const memberships = await db.membership.findMany({
    where: {
      userId: principal.userId,
      status: "ACTIVE",
      tenant: { isActive: true, qaPurgeStartedAt: null },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      tenantId: true,
      tenant: {
        select: {
          stores: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "asc" },
            take: 100,
            select: { id: true },
          },
        },
      },
    },
  })
  const choices: WhatsAppOnboardingBusinessChoice[] = []
  for (const membership of memberships) {
    for (const store of membership.tenant.stores) {
      try {
        const context = await requireWhatsAppActorScope(db, {
          userId: principal.userId,
          tenantId: membership.tenantId,
          membershipId: membership.id,
          storeId: store.id,
        })
        choices.push({
          tenantId: context.tenant.id,
          membershipId: context.membership.id,
          storeId: store.id,
          businessName: context.tenant.name,
          storeName: context.activeStore?.name ?? "Store",
        })
        if (choices.length >= 100) return choices
      } catch (error) {
        if (
          !(error instanceof AssistantWhatsAppError) ||
          error.code !== "UNAUTHORIZED"
        )
          throw error
      }
    }
  }
  return choices
}

/**
 * Email proof plus a signed, subsequent YES consents this exact business/Store.
 * This private handshake shares the app's grant authority without inventing an
 * earlier link timestamp or reusing phone OTP as an assistant grant.
 */
export function connectAssistantWhatsAppOnboarding(
  db: PrismaClient,
  input: WhatsAppPersonalActor & {
    phoneNumberId: string
    senderId: string
    choice: WhatsAppOnboardingBusinessChoice
    operationId: string
    providerOccurredAt: Date
    onboardingLease: { token: string; nonce: string }
  },
  now = new Date(),
) {
  if (
    !/^\d{1,32}$/.test(input.phoneNumberId) ||
    !/^[1-9]\d{7,14}$/.test(input.senderId) ||
    !input.operationId ||
    input.operationId.length > 256 ||
    !Number.isFinite(input.providerOccurredAt.getTime()) ||
    input.providerOccurredAt.getTime() > now.getTime() + 30_000
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET
  if (!secret) throw new AssistantWhatsAppError("UNAVAILABLE")
  const tokenDigest = createHmac("sha256", secret)
    .update(
      JSON.stringify([
        "whatsapp-email-consent:v1",
        input.userId,
        input.sessionId,
        input.phoneNumberId,
        input.senderId,
        input.choice.tenantId,
        input.choice.storeId,
        input.choice.membershipId,
        input.operationId,
      ]),
    )
    .digest("hex")
  return runInOwnSerializableTransaction(db, async (tx) => {
    await requireOnboardingLease(tx, input.onboardingLease, now)
    const session = await requireFreshOnboardingSession(tx, input, now)
    if (
      input.providerOccurredAt.getTime() <
      Math.floor(session.createdAt.getTime() / 1000) * 1000
    )
      throw new AssistantWhatsAppError("UNAUTHORIZED")
    const actor = {
      userId: input.userId,
      sessionId: input.sessionId,
      tenantId: input.choice.tenantId,
      storeId: input.choice.storeId,
      membershipId: input.choice.membershipId,
    }
    await lockWhatsAppWebActor(tx, actor, now)
    let link = await tx.assistantWhatsAppLink.findUnique({
      where: { tokenDigest },
    })
    if (!link) {
      const recent = await tx.assistantWhatsAppLink.count({
        where: {
          userId: input.userId,
          createdAt: { gte: new Date(now.getTime() - 15 * 60_000) },
        },
      })
      if (recent >= 10) throw new AssistantWhatsAppError("RATE_LIMITED")
      link = await tx.assistantWhatsAppLink.create({
        data: {
          userId: actor.userId,
          tenantId: actor.tenantId,
          storeId: actor.storeId,
          membershipId: actor.membershipId,
          tokenDigest,
          phoneNumberId: input.phoneNumberId,
          claimedSenderId: input.senderId,
          claimedMessageId: input.operationId,
          claimedAt: now,
          expiresAt: new Date(now.getTime() + whatsAppLinkLifetimeMs),
        },
      })
    }
    if (
      link.claimedSenderId !== input.senderId ||
      link.claimedMessageId !== input.operationId ||
      link.userId !== input.userId ||
      link.tenantId !== actor.tenantId ||
      link.storeId !== actor.storeId ||
      link.membershipId !== actor.membershipId
    )
      throw new AssistantWhatsAppError("CONFLICT")
    // Chat onboarding owns its durable welcome send. No app-link welcome proof is
    // staged here, so canonical confirmation will not create a second welcome.
    return confirmAssistantWhatsAppLinkInTransaction(
      tx,
      actor,
      {
        linkId: link.id,
        expectedRevision: link.confirmedAt ? link.revision - 1 : link.revision,
        phoneNumberId: input.phoneNumberId,
      },
      now,
    )
  })
}

export type WhatsAppAddBusinessAccount = {
  userId: string
  email: string
  ownerName: string | null
  businessName: string
  storeName: string
}

/**
 * Server-derived account for a linked sender's in-chat Add business flow.
 * Reads the current consented scope only; nothing here comes from message text.
 */
export async function readAssistantWhatsAppAddBusinessAccount(
  db: DbClient,
  address: { phoneNumberId: string; senderId: string },
  now = new Date(),
): Promise<WhatsAppAddBusinessAccount | null> {
  const identity = await db.assistantWhatsAppIdentity.findFirst({
    where: { ...address, revokedAt: null },
    select: {
      activeBindingId: true,
      user: { select: { id: true, email: true, name: true } },
    },
  })
  if (!identity?.activeBindingId || !identity.user.email) return null
  const binding = await db.assistantWhatsAppBinding.findFirst({
    where: { id: identity.activeBindingId },
    select: {
      grant: {
        select: {
          revokedAt: true,
          expiresAt: true,
          idleExpiresAt: true,
          tenant: { select: { name: true } },
          store: { select: { name: true } },
        },
      },
    },
  })
  const grant = binding?.grant
  if (
    !grant ||
    grant.revokedAt ||
    grant.expiresAt <= now ||
    grant.idleExpiresAt <= now
  )
    return null
  return {
    userId: identity.user.id,
    email: identity.user.email,
    ownerName: identity.user.name || null,
    businessName: grant.tenant.name,
    storeName: grant.store.name,
  }
}

export type WhatsAppAddBusinessInput = {
  businessName: string
  countryCode: string | null
  currencyCode: Parameters<typeof createOwnerBusiness>[1]["currencyCode"]
  addressLine1: string
  city: string
  phone: string
  onboarding: { countryCode?: string }
}

/**
 * Fresh email proof plus an explicit Create on the exact chat review lets the
 * linked account create a business through the canonical owner-business
 * command. The actor is the sender's linked account; entitlements, age and QA
 * classification checks stay inside createOwnerBusiness. A retried operation
 * returns the same business instead of creating another.
 */
export function createAssistantWhatsAppOnboardingBusiness(
  db: PrismaClient,
  input: WhatsAppPersonalActor & {
    phoneNumberId: string
    senderId: string
    operationId: string
    onboardingLease: { token: string; nonce: string }
    business: WhatsAppAddBusinessInput
  },
  now = new Date(),
): Promise<WhatsAppOnboardingBusinessChoice> {
  if (
    !/^\d{1,32}$/.test(input.phoneNumberId) ||
    !/^[1-9]\d{7,14}$/.test(input.senderId) ||
    !input.operationId ||
    input.operationId.length > 256
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET
  if (!secret) throw new AssistantWhatsAppError("UNAVAILABLE")
  const token = `wa-proof_addbiz_${createHmac("sha256", secret)
    .update(
      JSON.stringify([
        "whatsapp-add-business:v1",
        input.userId,
        input.phoneNumberId,
        input.senderId,
        input.operationId,
      ]),
    )
    .digest("hex")}`
  return runInOwnSerializableTransaction(db, async (tx) => {
    await requireOnboardingLease(tx, input.onboardingLease, now)
    await requireFreshOnboardingSession(tx, input, now)
    const identity = await tx.assistantWhatsAppIdentity.findFirst({
      where: {
        phoneNumberId: input.phoneNumberId,
        senderId: input.senderId,
        userId: input.userId,
        revokedAt: null,
      },
      select: { id: true },
    })
    if (!identity) throw new AssistantWhatsAppError("UNAUTHORIZED")
    const prior = await tx.onboardingSession.findUnique({ where: { token } })
    const receipt = prior?.formData
    if (
      receipt &&
      typeof receipt === "object" &&
      !Array.isArray(receipt) &&
      receipt.kind === "whatsapp_add_business_v1" &&
      receipt.userId === input.userId &&
      typeof receipt.tenantId === "string" &&
      typeof receipt.storeId === "string" &&
      typeof receipt.membershipId === "string" &&
      typeof receipt.businessName === "string" &&
      typeof receipt.storeName === "string"
    )
      return {
        tenantId: receipt.tenantId,
        storeId: receipt.storeId,
        membershipId: receipt.membershipId,
        businessName: receipt.businessName,
        storeName: receipt.storeName,
      }
    if (prior) throw new AssistantWhatsAppError("CONFLICT")
    const created = await createOwnerBusiness(tx, {
      ...input.business.onboarding,
      addressLine1: input.business.addressLine1,
      businessName: input.business.businessName,
      city: input.business.city,
      countryCode: input.business.countryCode,
      currencyCode: input.business.currencyCode,
      phone: input.business.phone,
      userId: input.userId,
    })
    const membership = await tx.membership.findFirst({
      where: {
        tenantId: created.id,
        userId: input.userId,
        status: "ACTIVE",
      },
      select: { id: true },
    })
    if (!membership || !created.storeId)
      throw new Error("The new business could not be prepared.")
    const choice: WhatsAppOnboardingBusinessChoice = {
      tenantId: created.id,
      storeId: created.storeId,
      membershipId: membership.id,
      businessName: created.name,
      storeName: created.storeName ?? "Main store",
    }
    await tx.onboardingSession.create({
      data: {
        token,
        userId: input.userId,
        completed: true,
        formData: {
          kind: "whatsapp_add_business_v1",
          userId: input.userId,
          ...choice,
        },
        expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
      },
    })
    return choice
  })
}
