import { createHash, randomBytes } from "node:crypto"
import {
  maskWhatsAppSender,
  whatsAppGrantIdleMs,
  whatsAppGrantLifetimeMs,
  whatsAppLinkCodeSchema,
  whatsAppLinkLifetimeMs,
} from "@ewatrade/assistant/channels/whatsapp"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import type { DbClient } from "../types"
import {
  AssistantWhatsAppError,
  type WhatsAppWebActor,
  lockWhatsAppWebActor,
  requireWhatsAppWebActor,
} from "./authority"

import {
  resolveAssistantWhatsAppConversation,
  selectAssistantWhatsAppConversationInTransaction,
} from "./conversations"
import {
  readAssistantWhatsAppLinkWelcomeInTransaction,
  stageAssistantWhatsAppLinkClaimInTransaction,
  stageAssistantWhatsAppLinkWelcomeInTransaction,
} from "./link-welcome"
import { cancelAssistantWhatsAppQueuedWorkInTransaction } from "./queued-work"

const digest = (code: string) =>
  createHash("sha256")
    .update(`assistant-whatsapp-link:v1:${code}`)
    .digest("hex")

export function createAssistantWhatsAppLink(
  db: PrismaClient,
  actor: WhatsAppWebActor,
  phoneNumberId: string,
  now = new Date(),
) {
  if (!/^\d+$/.test(phoneNumberId))
    throw new AssistantWhatsAppError("UNAVAILABLE")
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockWhatsAppWebActor(tx, actor, now)
    const recent = await tx.assistantWhatsAppLink.count({
      where: {
        userId: actor.userId,
        createdAt: { gte: new Date(now.getTime() - 15 * 60_000) },
      },
    })
    if (recent >= 10) throw new AssistantWhatsAppError("RATE_LIMITED")
    await tx.assistantWhatsAppLink.updateMany({
      where: {
        userId: actor.userId,
        tenantId: actor.tenantId,
        phoneNumberId,
        confirmedAt: null,
        cancelledAt: null,
      },
      data: { cancelledAt: now, revision: { increment: 1 } },
    })
    const code = randomBytes(32).toString("base64url")
    const link = await tx.assistantWhatsAppLink.create({
      data: {
        userId: actor.userId,
        tenantId: actor.tenantId,
        storeId: actor.storeId,
        membershipId: actor.membershipId,
        phoneNumberId,
        tokenDigest: digest(code),
        expiresAt: new Date(now.getTime() + whatsAppLinkLifetimeMs),
        createdAt: now,
      },
      select: { id: true, expiresAt: true, revision: true },
    })
    await tx.onboardingSession.create({
      data: {
        token: `wa-app-link_${link.id}`,
        userId: actor.userId,
        completed: false,
        expiresAt: link.expiresAt,
        formData: {
          kind: "whatsapp_app_link_session_v1",
          userId: actor.userId,
          sessionId: actor.sessionId,
        },
      },
    })
    return { ...link, code }
  })
}

/** No account access and no business content: this only stages the incoming sender. */
export function claimAssistantWhatsAppLink(
  db: PrismaClient,
  input: {
    code: string
    phoneNumberId: string
    senderId: string
    messageId: string
    providerOccurredAt?: Date
  },
  now = new Date(),
) {
  if (
    !whatsAppLinkCodeSchema.safeParse(input.code).success ||
    !/^[1-9]\d{7,14}$/.test(input.senderId) ||
    !input.messageId ||
    input.messageId.length > 256
  )
    return Promise.resolve(false)
  return runInOwnSerializableTransaction(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-sender:${input.phoneNumberId}:${input.senderId}`}))`
    const link = await tx.assistantWhatsAppLink.findUnique({
      where: { tokenDigest: digest(input.code) },
    })
    if (
      !link ||
      link.phoneNumberId !== input.phoneNumberId ||
      link.expiresAt <= now ||
      link.cancelledAt ||
      link.confirmedAt ||
      (input.providerOccurredAt !== undefined &&
        (!Number.isFinite(input.providerOccurredAt.getTime()) ||
          input.providerOccurredAt.getTime() > now.getTime() + 30_000 ||
          input.providerOccurredAt.getTime() <
            Math.floor(link.createdAt.getTime() / 1000) * 1000))
    )
      return false
    if (link.claimedSenderId)
      return (
        link.claimedSenderId === input.senderId &&
        link.claimedMessageId === input.messageId
      )
    const changed = await tx.assistantWhatsAppLink.updateMany({
      where: {
        id: link.id,
        revision: link.revision,
        claimedSenderId: null,
        cancelledAt: null,
        confirmedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        claimedSenderId: input.senderId,
        claimedMessageId: input.messageId,
        claimedAt: now,
        revision: { increment: 1 },
      },
    })
    if (changed.count !== 1) return false
    if (input.providerOccurredAt)
      await stageAssistantWhatsAppLinkClaimInTransaction(
        tx,
        {
          linkId: link.id,
          phoneNumberId: input.phoneNumberId,
          messageId: input.messageId,
          providerOccurredAt: input.providerOccurredAt,
          expiresAt: link.expiresAt,
        },
        now,
      )
    return true
  })
}

export async function readAssistantWhatsAppLink(
  db: DbClient,
  actor: WhatsAppWebActor,
  id: string,
  phoneNumberId: string,
  now = new Date(),
) {
  await requireWhatsAppWebActor(db, actor, now, false)
  const link = await db.assistantWhatsAppLink.findFirst({
    where: {
      id,
      userId: actor.userId,
      tenantId: actor.tenantId,
      storeId: actor.storeId,
      membershipId: actor.membershipId,
      phoneNumberId,
    },
  })
  if (!link) throw new AssistantWhatsAppError("UNAVAILABLE")
  return {
    id: link.id,
    revision: link.revision,
    expiresAt: link.expiresAt,
    state: link.cancelledAt
      ? "cancelled"
      : link.confirmedAt
        ? "confirmed"
        : link.expiresAt <= now
          ? "expired"
          : link.claimedSenderId
            ? "awaiting_confirmation"
            : "awaiting_whatsapp",
    maskedSender: link.claimedSenderId
      ? maskWhatsAppSender(link.claimedSenderId)
      : null,
  }
}

export function confirmAssistantWhatsAppLink(
  db: PrismaClient,
  actor: WhatsAppWebActor,
  input: { linkId: string; expectedRevision: number; phoneNumberId: string },
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, (tx) =>
    confirmAssistantWhatsAppLinkInTransaction(tx, actor, input, now),
  )
}

/** App-first fast path: exact verified account phone and the issuing fresh session. */
export function autoConfirmAssistantWhatsAppLink(
  db: PrismaClient,
  input: {
    code: string
    phoneNumberId: string
    senderId: string
    messageId: string
    providerOccurredAt?: Date
  },
  now = new Date(),
) {
  if (
    !whatsAppLinkCodeSchema.safeParse(input.code).success ||
    !input.providerOccurredAt
  )
    return Promise.resolve(null)
  return runInOwnSerializableTransaction(db, async (tx) => {
    const link = await tx.assistantWhatsAppLink.findUnique({
      where: { tokenDigest: digest(input.code) },
    })
    if (
      !link ||
      link.cancelledAt ||
      link.expiresAt <= now ||
      link.phoneNumberId !== input.phoneNumberId ||
      link.claimedSenderId !== input.senderId ||
      link.claimedMessageId !== input.messageId
    )
      return null
    const proof = await tx.onboardingSession.findUnique({
      where: { token: `wa-app-link_${link.id}` },
    })
    const data = proof?.formData
    if (
      !proof ||
      proof.expiresAt <= now ||
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      data.kind !== "whatsapp_app_link_session_v1" ||
      data.userId !== link.userId ||
      typeof data.sessionId !== "string"
    )
      return null
    const [session, user] = await Promise.all([
      tx.session.findFirst({
        where: {
          id: data.sessionId,
          userId: link.userId,
          expiresAt: { gt: now },
          createdAt: { gte: new Date(now.getTime() - 10 * 60_000), lte: now },
          qaAuthorizationId: null,
          NOT: { token: { startsWith: "qas_" } },
        },
        select: { id: true },
      }),
      tx.user.findUnique({
        where: { id: link.userId },
        select: { phone: true, phoneVerifiedAt: true },
      }),
    ])
    if (
      !session ||
      !user?.phoneVerifiedAt ||
      user.phoneVerifiedAt > now ||
      user.phone?.trim().replace(/^\+/, "") !== input.senderId
    )
      return null
    const connected = await confirmAssistantWhatsAppLinkInTransaction(
      tx,
      {
        userId: link.userId,
        sessionId: session.id,
        tenantId: link.tenantId,
        storeId: link.storeId,
        membershipId: link.membershipId,
      },
      {
        linkId: link.id,
        expectedRevision: link.confirmedAt ? link.revision - 1 : link.revision,
        phoneNumberId: input.phoneNumberId,
      },
      now,
    )
    return { welcomeOutboxId: connected.welcomeOutboxId }
  })
}

/** Shared canonical consent authority; caller owns the short serializable transaction. */
export async function confirmAssistantWhatsAppLinkInTransaction(
  tx: Prisma.TransactionClient,
  actor: WhatsAppWebActor,
  input: { linkId: string; expectedRevision: number; phoneNumberId: string },
  now: Date,
) {
  await lockWhatsAppWebActor(tx, actor, now)
  const link = await tx.assistantWhatsAppLink.findFirst({
    where: {
      id: input.linkId,
      userId: actor.userId,
      tenantId: actor.tenantId,
      membershipId: actor.membershipId,
      storeId: actor.storeId,
      phoneNumberId: input.phoneNumberId,
    },
  })
  if (!link || !link.claimedSenderId || link.cancelledAt)
    throw new AssistantWhatsAppError("UNAVAILABLE")
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-sender:${link.phoneNumberId}:${link.claimedSenderId}`}))`
  if (link.confirmedAt) {
    if (link.revision !== input.expectedRevision + 1)
      throw new AssistantWhatsAppError("CONFLICT")
    const prior = await tx.assistantWhatsAppGrant.findFirst({
      where: {
        tenantId: actor.tenantId,
        membershipId: actor.membershipId,
        storeId: actor.storeId,
        consentedAt: link.confirmedAt,
        generation: link.confirmedGrantGeneration ?? -1,
        revokedAt: null,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
        identity: {
          userId: actor.userId,
          phoneNumberId: link.phoneNumberId,
          senderId: link.claimedSenderId,
          revokedAt: null,
        },
      },
      include: { identity: { select: { senderId: true } } },
    })
    if (!prior) throw new AssistantWhatsAppError("CONFLICT")
    return {
      id: prior.id,
      generation: prior.generation,
      expiresAt: prior.expiresAt,
      maskedSender: maskWhatsAppSender(prior.identity.senderId),
      welcomeOutboxId: await readAssistantWhatsAppLinkWelcomeInTransaction(
        tx,
        link.id,
        prior.generation,
      ),
    }
  }
  if (link.expiresAt <= now) throw new AssistantWhatsAppError("EXPIRED")
  if (link.revision !== input.expectedRevision || link.confirmedAt)
    throw new AssistantWhatsAppError("CONFLICT")
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${link.phoneNumberId} AND "senderId"=${link.claimedSenderId} FOR UPDATE`
  const existing = await tx.assistantWhatsAppIdentity.findUnique({
    where: {
      phoneNumberId_senderId: {
        phoneNumberId: link.phoneNumberId,
        senderId: link.claimedSenderId,
      },
    },
  })
  if (existing && existing.userId !== actor.userId)
    throw new AssistantWhatsAppError("CONFLICT")
  const identity = existing
    ? await tx.assistantWhatsAppIdentity.update({
        where: { id: existing.id },
        data: {
          revokedAt: null,
          ...(existing.revokedAt ? { generation: { increment: 1 } } : {}),
        },
      })
    : await tx.assistantWhatsAppIdentity.create({
        data: {
          phoneNumberId: link.phoneNumberId,
          senderId: link.claimedSenderId,
          userId: actor.userId,
        },
      })
  const consent = {
    storeId: actor.storeId,
    membershipId: actor.membershipId,
    consentedAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + whatsAppGrantLifetimeMs),
    idleExpiresAt: new Date(now.getTime() + whatsAppGrantIdleMs),
    revokedAt: null,
  }
  const previousGrant = await tx.assistantWhatsAppGrant.findUnique({
    where: {
      identityId_tenantId: {
        identityId: identity.id,
        tenantId: actor.tenantId,
      },
    },
    select: { id: true },
  })
  if (previousGrant) {
    await tx.assistantWhatsAppIdentity.update({
      where: { id: identity.id },
      data: { controlSequence: { increment: 1 } },
    })
    await cancelAssistantWhatsAppQueuedWorkInTransaction(
      tx,
      identity.id,
      null,
      now,
      {
        grantId: previousGrant.id,
        includeControls: true,
        reason: "CONSENT_RENEWED",
      },
    )
  }
  const grant = await tx.assistantWhatsAppGrant.upsert({
    where: {
      identityId_tenantId: {
        identityId: identity.id,
        tenantId: actor.tenantId,
      },
    },
    create: { ...consent, identityId: identity.id, tenantId: actor.tenantId },
    update: { ...consent, generation: { increment: 1 } },
    select: { id: true, generation: true, expiresAt: true },
  })
  const confirmed = await tx.assistantWhatsAppLink.updateMany({
    where: {
      id: link.id,
      revision: input.expectedRevision,
      confirmedAt: null,
      cancelledAt: null,
    },
    data: {
      confirmedAt: now,
      confirmedGrantGeneration: grant.generation,
      revision: { increment: 1 },
    },
  })
  if (confirmed.count !== 1) throw new AssistantWhatsAppError("CONFLICT")
  const active = identity.activeBindingId
    ? await tx.assistantWhatsAppBinding.findFirst({
        where: { id: identity.activeBindingId, identityId: identity.id },
      })
    : null
  let selected = false
  if (active) {
    try {
      const resolved = await resolveAssistantWhatsAppConversation(
        tx,
        {
          kind: "linked_whatsapp",
          phoneNumberId: identity.phoneNumberId,
          senderId: identity.senderId,
          identityGeneration: active.identityGeneration,
          grantId: active.grantId,
          grantGeneration: active.grantGeneration,
          bindingId: active.id,
          selectionGeneration: active.selectionGeneration,
        },
        now,
      )
      selected =
        resolved.scope.tenantId === actor.tenantId &&
        resolved.scope.storeId === actor.storeId &&
        resolved.scope.membershipId === actor.membershipId
    } catch (error) {
      if (!(error instanceof AssistantWhatsAppError)) throw error
    }
  }
  // Confirmation selects the exact consented business/Store. Preserve a valid
  // chat only within that scope, so the welcome and subsequent turns agree.
  if (!selected) {
    const conversation = await tx.assistantConversation.create({
      data: {
        id: `wa-linked_${link.id}`,
        ownerUserId: actor.userId,
        tenantId: actor.tenantId,
        storeId: actor.storeId,
        purpose: "GENERAL",
        status: "ACTIVE",
      },
      select: { id: true },
    })
    await selectAssistantWhatsAppConversationInTransaction(
      tx,
      {
        kind: "linked_whatsapp",
        phoneNumberId: identity.phoneNumberId,
        senderId: identity.senderId,
        identityGeneration: identity.generation,
        grantId: grant.id,
        grantGeneration: grant.generation,
      },
      conversation.id,
      now,
    )
  }
  const welcomeOutboxId = await stageAssistantWhatsAppLinkWelcomeInTransaction(
    tx,
    {
      linkId: link.id,
      identityId: identity.id,
      grantId: grant.id,
      grantGeneration: grant.generation,
      storeId: actor.storeId,
      phoneNumberId: identity.phoneNumberId,
      messageId: link.claimedMessageId,
    },
    now,
  )
  return {
    ...grant,
    maskedSender: maskWhatsAppSender(identity.senderId),
    welcomeOutboxId,
  }
}
