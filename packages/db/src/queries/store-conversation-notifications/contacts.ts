import {
  maskStoreConversationNotificationDestination,
  storeConversationNotificationContactConfirmInputSchema,
  storeConversationNotificationContactListInputSchema,
  storeConversationNotificationContactRevokeInputSchema,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import {
  StoreConversationGuestCredentialPurpose,
  StoreConversationGuestCredentialStatus,
  StoreConversationGuestIdentityStatus,
  StoreConversationLifecycle,
  StoreConversationModerationState,
  StoreConversationNotificationAuditType,
  StoreConversationNotificationCommandKind,
  StoreConversationNotificationContactChannel,
  StoreConversationNotificationContactStatus,
  StoreConversationNotificationVerificationStatus,
} from "../../../generated/prisma/enums"
import {
  loadStoreConversationForGuest,
  lockStoreConversation,
  resolveStoreConversationEntry,
} from "../store-conversations-core"
import {
  STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS,
  StoreConversationNotificationError,
  assertNotificationCommandReplay,
  notificationPayloadHash,
  translateNotificationWriteError,
} from "./shared"

const VERIFICATION_WINDOW_MS = 60 * 60_000
const VERIFICATION_TTL_MS = 10 * 60_000
const MAX_VERIFICATIONS_PER_WINDOW = 5

type GuestDevice = {
  installationToken?: string
  purpose: StoreConversationGuestCredentialPurpose
}

const WEB_DEVICE: GuestDevice = {
  purpose: StoreConversationGuestCredentialPurpose.WEB_DEVICE,
}

function databaseContactChannel(channel: "email" | "whatsapp") {
  return channel === "email"
    ? StoreConversationNotificationContactChannel.EMAIL
    : StoreConversationNotificationContactChannel.WHATSAPP
}

function projectContact(input: {
  channel: StoreConversationNotificationContactChannel
  id: string
  maskedDestination: string
  status: StoreConversationNotificationContactStatus
  verifiedAt: Date | null
}) {
  return {
    channel:
      input.channel === StoreConversationNotificationContactChannel.EMAIL
        ? ("email" as const)
        : ("whatsapp" as const),
    contactId: input.id,
    maskedDestination: input.maskedDestination,
    state:
      input.status === StoreConversationNotificationContactStatus.VERIFIED
        ? ("verified" as const)
        : input.status === StoreConversationNotificationContactStatus.REVOKED
          ? ("revoked" as const)
          : ("pending" as const),
    verifiedAt: input.verifiedAt,
  }
}

async function loadGuestNotificationContext(
  tx: Prisma.TransactionClient,
  input: {
    conversationId: string
    credentialToken: string
    device: GuestDevice
    now: Date
    publicToken: string
  },
) {
  const entry = await resolveStoreConversationEntry(tx, {
    publicToken: input.publicToken,
  })
  const loaded = await loadStoreConversationForGuest(tx, {
    conversationId: input.conversationId,
    credentialToken: input.credentialToken,
    installationToken: input.device.installationToken,
    now: input.now,
    purpose: input.device.purpose,
    storeId: entry.storeId,
    tenantId: entry.tenantId,
  })
  return { entry, ...loaded }
}

export async function requestGuestStoreConversationNotificationVerification(
  db: PrismaClient,
  input: {
    channel: "email" | "whatsapp"
    clientOperationId: string
    consentAccepted: true
    conversationId: string
    credentialToken: string
    destinationCiphertext: string
    destinationDigest: string
    maskedDestination: string
    now?: Date
    publicToken: string
    tokenDigest: string
    verificationId: string
  },
  device: GuestDevice = WEB_DEVICE,
) {
  if (input.consentAccepted !== true) {
    throw new StoreConversationNotificationError(
      "FORBIDDEN",
      "Notification-only consent is required.",
    )
  }
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS)
  try {
    return await db.$transaction(async (tx) => {
      const context = await loadGuestNotificationContext(tx, {
        ...input,
        device,
        now,
      })
      await lockStoreConversation(tx, {
        conversationId: context.conversation.id,
        storeId: context.entry.storeId,
        tenantId: context.entry.tenantId,
      })
      const replay =
        await tx.storeConversationGuestNotificationVerification.findUnique({
          include: { contact: true },
          where: {
            guestIdentityId_clientOperationId: {
              clientOperationId: input.clientOperationId,
              guestIdentityId: context.conversation.guestIdentityId,
            },
          },
        })
      if (replay) {
        if (
          replay.tokenDigest !== input.tokenDigest ||
          replay.contact.destinationDigest !== input.destinationDigest ||
          replay.contact.channel !== databaseContactChannel(input.channel)
        ) {
          throw new StoreConversationNotificationError(
            "CONFLICT",
            "This verification request was already used with different details.",
          )
        }
        return {
          contact: projectContact(replay.contact),
          dispatch: {
            storeId: replay.storeId,
            tenantId: replay.tenantId,
            verificationId: replay.id,
          },
          expiresAt: replay.expiresAt,
          replayed: true,
          verificationId: replay.id,
        }
      }
      const requested =
        await tx.storeConversationGuestNotificationVerification.count({
          where: {
            guestIdentityId: context.conversation.guestIdentityId,
            requestedAt: {
              gte: new Date(now.getTime() - VERIFICATION_WINDOW_MS),
            },
            storeId: context.entry.storeId,
            tenantId: context.entry.tenantId,
          },
        })
      if (requested >= MAX_VERIFICATIONS_PER_WINDOW) {
        throw new StoreConversationNotificationError(
          "RATE_LIMITED",
          "Too many verification requests. Try again later.",
        )
      }
      const channel = databaseContactChannel(input.channel)
      const contact = await tx.storeConversationGuestNotificationContact.upsert(
        {
          create: {
            channel,
            consentedAt: now,
            destinationCiphertext: input.destinationCiphertext,
            destinationDigest: input.destinationDigest,
            guestIdentityId: context.conversation.guestIdentityId,
            maskedDestination: input.maskedDestination,
            storeId: context.entry.storeId,
            tenantId: context.entry.tenantId,
          },
          update: {
            consentedAt: now,
            destinationCiphertext: input.destinationCiphertext,
            maskedDestination: input.maskedDestination,
            revokedAt: null,
            status: StoreConversationNotificationContactStatus.PENDING,
            verifiedAt: null,
          },
          where: {
            storeId_guestIdentityId_channel_destinationDigest: {
              channel,
              destinationDigest: input.destinationDigest,
              guestIdentityId: context.conversation.guestIdentityId,
              storeId: context.entry.storeId,
            },
          },
        },
      )
      const verification =
        await tx.storeConversationGuestNotificationVerification.create({
          data: {
            clientOperationId: input.clientOperationId,
            conversationId: context.conversation.id,
            contactId: contact.id,
            expiresAt,
            guestIdentityId: context.conversation.guestIdentityId,
            id: input.verificationId,
            requestedAt: now,
            nextAttemptAt: now,
            storeId: context.entry.storeId,
            tenantId: context.entry.tenantId,
            tokenDigest: input.tokenDigest,
          },
        })
      await tx.storeConversationNotificationAuditEvent.create({
        data: {
          actorGuestIdentityId: context.conversation.guestIdentityId,
          conversationId: context.conversation.id,
          reasonCode: "notification_contact_verification_requested",
          storeId: context.entry.storeId,
          tenantId: context.entry.tenantId,
          type: StoreConversationNotificationAuditType.CONTACT_VERIFICATION_REQUESTED,
        },
      })
      return {
        contact: projectContact(contact),
        dispatch: {
          storeId: context.entry.storeId,
          tenantId: context.entry.tenantId,
          verificationId: verification.id,
        },
        expiresAt: verification.expiresAt,
        replayed: false,
        verificationId: verification.id,
      }
    }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
  } catch (error) {
    translateNotificationWriteError(error)
  }
}

export async function confirmGuestStoreConversationNotificationContact(
  db: PrismaClient,
  rawInput: {
    clientOperationId: string
    codeDigest: string
    conversationId: string
    credentialToken: string
    now?: Date
    publicToken: string
    verificationId: string
  },
  device: GuestDevice = WEB_DEVICE,
) {
  const input = storeConversationNotificationContactConfirmInputSchema
    .omit({
      code: true,
    })
    .parse({
      clientOperationId: rawInput.clientOperationId,
      conversationId: rawInput.conversationId,
      publicToken: rawInput.publicToken,
      verificationId: rawInput.verificationId,
    })
  const now = rawInput.now ?? new Date()
  try {
    return await db.$transaction(async (tx) => {
      const context = await loadGuestNotificationContext(tx, {
        ...rawInput,
        device,
        now,
      })
      await lockStoreConversation(tx, {
        conversationId: context.conversation.id,
        storeId: context.entry.storeId,
        tenantId: context.entry.tenantId,
      })
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "StoreConversationGuestNotificationVerification"
        WHERE "id" = ${input.verificationId}
        FOR UPDATE
      `)
      const verification =
        await tx.storeConversationGuestNotificationVerification.findFirst({
          include: { contact: true },
          where: {
            guestIdentityId: context.conversation.guestIdentityId,
            id: input.verificationId,
            storeId: context.entry.storeId,
            tenantId: context.entry.tenantId,
          },
        })
      if (!verification) {
        throw new StoreConversationNotificationError(
          "NOT_FOUND",
          "Verification is unavailable.",
        )
      }
      if (
        verification.status ===
          StoreConversationNotificationVerificationStatus.CONSUMED &&
        verification.tokenDigest === rawInput.codeDigest
      ) {
        return { contact: projectContact(verification.contact), replayed: true }
      }
      const confirmableStatuses =
        new Set<StoreConversationNotificationVerificationStatus>([
          StoreConversationNotificationVerificationStatus.PENDING,
          StoreConversationNotificationVerificationStatus.CLAIMED,
          StoreConversationNotificationVerificationStatus.SENT,
          StoreConversationNotificationVerificationStatus.FAILED,
          StoreConversationNotificationVerificationStatus.OUTCOME_UNKNOWN,
        ])
      if (
        !confirmableStatuses.has(verification.status) ||
        verification.expiresAt <= now ||
        verification.attemptCount >= verification.maxAttempts
      ) {
        await tx.storeConversationGuestNotificationVerification.updateMany({
          data: {
            status: StoreConversationNotificationVerificationStatus.EXPIRED,
          },
          where: {
            id: verification.id,
            status: { in: [...confirmableStatuses] },
          },
        })
        throw new StoreConversationNotificationError(
          "NOT_READY",
          "Verification expired. Request a new code.",
        )
      }
      if (verification.tokenDigest !== rawInput.codeDigest) {
        const nextAttempts = verification.attemptCount + 1
        await tx.storeConversationGuestNotificationVerification.update({
          data: {
            attemptCount: nextAttempts,
            ...(nextAttempts >= verification.maxAttempts
              ? {
                  status:
                    StoreConversationNotificationVerificationStatus.EXPIRED,
                }
              : {}),
          },
          where: { id: verification.id },
        })
        throw new StoreConversationNotificationError(
          "FORBIDDEN",
          "The verification code is incorrect.",
        )
      }
      await tx.storeConversationGuestNotificationContact.updateMany({
        data: {
          revokedAt: now,
          status: StoreConversationNotificationContactStatus.REVOKED,
        },
        where: {
          channel: verification.contact.channel,
          guestIdentityId: context.conversation.guestIdentityId,
          id: { not: verification.contact.id },
          status: StoreConversationNotificationContactStatus.VERIFIED,
          storeId: context.entry.storeId,
          tenantId: context.entry.tenantId,
        },
      })
      const [contact] = await Promise.all([
        tx.storeConversationGuestNotificationContact.update({
          data: {
            revokedAt: null,
            status: StoreConversationNotificationContactStatus.VERIFIED,
            verifiedAt: now,
          },
          where: { id: verification.contact.id },
        }),
        tx.storeConversationGuestNotificationVerification.update({
          data: {
            attemptCount: { increment: 1 },
            consumedAt: now,
            status: StoreConversationNotificationVerificationStatus.CONSUMED,
          },
          where: { id: verification.id },
        }),
        tx.storeConversationNotificationAuditEvent.create({
          data: {
            actorGuestIdentityId: context.conversation.guestIdentityId,
            conversationId: context.conversation.id,
            reasonCode: "notification_contact_verified",
            storeId: context.entry.storeId,
            tenantId: context.entry.tenantId,
            type: StoreConversationNotificationAuditType.CONTACT_VERIFIED,
          },
        }),
      ])
      return { contact: projectContact(contact), replayed: false }
    }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
  } catch (error) {
    translateNotificationWriteError(error)
  }
}

export async function listGuestStoreConversationNotificationContacts(
  db: PrismaClient,
  rawInput: {
    conversationId: string
    credentialToken: string
    now?: Date
    publicToken: string
  },
  device: GuestDevice = WEB_DEVICE,
) {
  const input = storeConversationNotificationContactListInputSchema.parse({
    conversationId: rawInput.conversationId,
    publicToken: rawInput.publicToken,
  })
  const now = rawInput.now ?? new Date()
  const entry = await resolveStoreConversationEntry(db, {
    publicToken: input.publicToken,
  })
  const context = await loadStoreConversationForGuest(db, {
    conversationId: input.conversationId,
    credentialToken: rawInput.credentialToken,
    installationToken: device.installationToken,
    now,
    purpose: device.purpose,
    storeId: entry.storeId,
    tenantId: entry.tenantId,
  })
  const contacts = await db.storeConversationGuestNotificationContact.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10,
    where: {
      guestIdentityId: context.conversation.guestIdentityId,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    },
  })
  return contacts.map(projectContact)
}

export async function revokeGuestStoreConversationNotificationContact(
  db: PrismaClient,
  rawInput: {
    clientOperationId: string
    confirmed: true
    contactId: string
    conversationId: string
    credentialToken: string
    now?: Date
    publicToken: string
  },
  device: GuestDevice = WEB_DEVICE,
) {
  const input = storeConversationNotificationContactRevokeInputSchema.parse({
    clientOperationId: rawInput.clientOperationId,
    confirmed: rawInput.confirmed,
    contactId: rawInput.contactId,
    conversationId: rawInput.conversationId,
    publicToken: rawInput.publicToken,
  })
  const now = rawInput.now ?? new Date()
  try {
    return await db.$transaction(async (tx) => {
      const context = await loadGuestNotificationContext(tx, {
        ...rawInput,
        device,
        now,
      })
      await lockStoreConversation(tx, {
        conversationId: context.conversation.id,
        storeId: context.entry.storeId,
        tenantId: context.entry.tenantId,
      })
      const payloadHash = notificationPayloadHash({
        confirmed: true,
        contactId: input.contactId,
        conversationId: input.conversationId,
      })
      const principalKey = `guest:${context.credential.id}`
      const replay = await tx.storeConversationNotificationCommand.findUnique({
        where: {
          principalKey_clientOperationId: {
            clientOperationId: input.clientOperationId,
            principalKey,
          },
        },
      })
      if (replay) {
        assertNotificationCommandReplay({
          actualKind: replay.kind,
          actualPayloadHash: replay.payloadHash,
          expectedKind:
            StoreConversationNotificationCommandKind.CONTACT_REVOKED,
          expectedPayloadHash: payloadHash,
        })
        return { contactId: replay.resultId ?? input.contactId, replayed: true }
      }
      const contact =
        await tx.storeConversationGuestNotificationContact.findFirst({
          where: {
            guestIdentityId: context.conversation.guestIdentityId,
            id: input.contactId,
            storeId: context.entry.storeId,
            tenantId: context.entry.tenantId,
          },
        })
      if (!contact) {
        throw new StoreConversationNotificationError(
          "NOT_FOUND",
          "Notification contact is unavailable.",
        )
      }
      await Promise.all([
        tx.storeConversationGuestNotificationContact.update({
          data: {
            revokedAt: now,
            status: StoreConversationNotificationContactStatus.REVOKED,
          },
          where: { id: contact.id },
        }),
        tx.storeConversationNotificationCommand.create({
          data: {
            clientOperationId: input.clientOperationId,
            conversationId: context.conversation.id,
            guestCredentialId: context.credential.id,
            kind: StoreConversationNotificationCommandKind.CONTACT_REVOKED,
            payloadHash,
            principalKey,
            resultId: contact.id,
          },
        }),
        tx.storeConversationNotificationAuditEvent.create({
          data: {
            actorGuestIdentityId: context.conversation.guestIdentityId,
            conversationId: context.conversation.id,
            reasonCode: "notification_contact_revoked",
            storeId: context.entry.storeId,
            tenantId: context.entry.tenantId,
            type: StoreConversationNotificationAuditType.CONTACT_REVOKED,
          },
        }),
      ])
      return { contactId: contact.id, replayed: false }
    }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
  } catch (error) {
    translateNotificationWriteError(error)
  }
}

export type StoreConversationNotificationVerificationIdentifier = {
  storeId: string
  tenantId: string
  verificationId: string
}

export async function listDueStoreConversationNotificationVerifications(
  db: PrismaClient,
  input: { limit?: number; now?: Date } = {},
): Promise<StoreConversationNotificationVerificationIdentifier[]> {
  const now = input.now ?? new Date()
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200)
  const rows = await db.storeConversationGuestNotificationVerification.findMany(
    {
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
      select: { id: true, storeId: true, tenantId: true },
      take: limit,
      where: {
        expiresAt: { gt: now },
        nextAttemptAt: { lte: now },
        OR: [
          {
            status: {
              in: [
                StoreConversationNotificationVerificationStatus.PENDING,
                StoreConversationNotificationVerificationStatus.FAILED,
              ],
            },
          },
          {
            claimExpiresAt: { lte: now },
            status: StoreConversationNotificationVerificationStatus.CLAIMED,
          },
        ],
      },
    },
  )
  return rows.map((row) => ({
    storeId: row.storeId,
    tenantId: row.tenantId,
    verificationId: row.id,
  }))
}

export async function claimStoreConversationNotificationVerification(
  db: PrismaClient,
  input: StoreConversationNotificationVerificationIdentifier & { now?: Date },
) {
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "StoreConversationGuestNotificationVerification"
        WHERE "id" = ${input.verificationId}
          AND "tenantId" = ${input.tenantId}
          AND "storeId" = ${input.storeId}
        FOR UPDATE
      `)
    const verification =
      await tx.storeConversationGuestNotificationVerification.findFirst({
        include: {
          contact: true,
          conversation: {
            select: {
              guestAccesses: {
                select: { guestIdentityId: true },
                where: { status: "ACTIVE" },
              },
              guestIdentityId: true,
              lifecycle: true,
              moderationState: true,
            },
          },
          guestIdentity: { select: { status: true } },
        },
        where: {
          expiresAt: { gt: now },
          id: input.verificationId,
          nextAttemptAt: { lte: now },
          OR: [
            {
              status: {
                in: [
                  StoreConversationNotificationVerificationStatus.PENDING,
                  StoreConversationNotificationVerificationStatus.FAILED,
                ],
              },
            },
            {
              claimExpiresAt: { lte: now },
              status: StoreConversationNotificationVerificationStatus.CLAIMED,
            },
          ],
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
    if (!verification) return null
    const activeCredential =
      await tx.storeConversationGuestCredential.findFirst({
        select: { id: true },
        where: {
          expiresAt: { gt: now },
          guestIdentityId: verification.guestIdentityId,
          status: StoreConversationGuestCredentialStatus.ACTIVE,
        },
      })
    const participantIsActive =
      verification.conversation.guestIdentityId ===
        verification.guestIdentityId ||
      verification.conversation.guestAccesses.some(
        (access) => access.guestIdentityId === verification.guestIdentityId,
      )
    if (
      verification.sendAttemptCount >= verification.maxSendAttempts ||
      !activeCredential ||
      !participantIsActive ||
      verification.contact.status !==
        StoreConversationNotificationContactStatus.PENDING ||
      verification.guestIdentity.status !==
        StoreConversationGuestIdentityStatus.ACTIVE ||
      verification.conversation.lifecycle !==
        StoreConversationLifecycle.ACTIVE ||
      verification.conversation.moderationState !==
        StoreConversationModerationState.OPEN
    ) {
      await tx.storeConversationGuestNotificationVerification.update({
        data: {
          lastFailureCode: "verification_authorization_unavailable",
          nextAttemptAt: null,
          status: StoreConversationNotificationVerificationStatus.EXPIRED,
        },
        where: { id: verification.id },
      })
      return null
    }
    const sendAttemptCount = verification.sendAttemptCount + 1
    await tx.storeConversationGuestNotificationVerification.update({
      data: {
        claimedAt: now,
        claimExpiresAt: new Date(now.getTime() + 5 * 60_000),
        lastFailureCode: null,
        sendAttemptCount,
        status: StoreConversationNotificationVerificationStatus.CLAIMED,
      },
      where: { id: verification.id },
    })
    return {
      channel:
        verification.contact.channel ===
        StoreConversationNotificationContactChannel.EMAIL
          ? ("email" as const)
          : ("whatsapp" as const),
      destinationCiphertext: verification.contact.destinationCiphertext,
      expiresAt: verification.expiresAt,
      sendAttemptCount,
      verificationId: verification.id,
    }
  }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
}

export async function completeStoreConversationNotificationVerification(
  db: PrismaClient,
  input: StoreConversationNotificationVerificationIdentifier & { now?: Date },
) {
  const now = input.now ?? new Date()
  return db.storeConversationGuestNotificationVerification.updateMany({
    data: {
      claimExpiresAt: null,
      nextAttemptAt: null,
      sentAt: now,
      status: StoreConversationNotificationVerificationStatus.SENT,
    },
    where: {
      id: input.verificationId,
      status: StoreConversationNotificationVerificationStatus.CLAIMED,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
}

export async function failStoreConversationNotificationVerification(
  db: PrismaClient,
  input: StoreConversationNotificationVerificationIdentifier & {
    failureCode: string
    now?: Date
    outcomeUnknown?: boolean
    retryAt?: Date
    terminal?: boolean
  },
) {
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    const verification =
      await tx.storeConversationGuestNotificationVerification.findFirst({
        select: {
          expiresAt: true,
          maxSendAttempts: true,
          sendAttemptCount: true,
        },
        where: {
          id: input.verificationId,
          status: StoreConversationNotificationVerificationStatus.CLAIMED,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
    if (!verification) return null
    const terminal =
      Boolean(input.terminal) ||
      Boolean(input.outcomeUnknown) ||
      verification.sendAttemptCount >= verification.maxSendAttempts
    const retryAt = terminal
      ? null
      : (input.retryAt ??
        new Date(
          Math.min(
            verification.expiresAt.getTime(),
            now.getTime() + 30_000 * 2 ** (verification.sendAttemptCount - 1),
          ),
        ))
    await tx.storeConversationGuestNotificationVerification.update({
      data: {
        claimExpiresAt: null,
        lastFailureCode: input.failureCode,
        nextAttemptAt: retryAt,
        status: input.outcomeUnknown
          ? StoreConversationNotificationVerificationStatus.OUTCOME_UNKNOWN
          : StoreConversationNotificationVerificationStatus.FAILED,
      },
      where: { id: input.verificationId },
    })
    return { retryAt, terminal }
  }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
}

export function maskNotificationDestinationForPersistence(input: {
  channel: "email" | "whatsapp"
  destination: string
}) {
  return maskStoreConversationNotificationDestination(input)
}
