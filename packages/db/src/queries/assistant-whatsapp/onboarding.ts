import { createHmac } from "node:crypto"
import {
  whatsAppFreshSessionMs,
  whatsAppLinkLifetimeMs,
} from "@ewatrade/assistant/channels/whatsapp"
import type { PrismaClient } from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
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
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.onboardingLease.token}))`
    const flow = await tx.onboardingSession.findUnique({
      where: { token: input.onboardingLease.token },
      select: { formData: true, expiresAt: true },
    })
    const data = flow?.formData
    const lease =
      data && typeof data === "object" && !Array.isArray(data)
        ? data.lease
        : null
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
      lease.nonce !== input.onboardingLease.nonce ||
      typeof lease.expiresAt !== "number" ||
      lease.expiresAt <= now.getTime()
    )
      throw new AssistantWhatsAppError("CONFLICT")
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
