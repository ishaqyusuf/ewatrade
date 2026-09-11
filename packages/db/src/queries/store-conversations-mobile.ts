import {
  type StoreConversationMobileListProjection,
  type StoreConversationSelectRequestInput,
  projectStoreConversationModeration,
  storeConversationMobileListInputSchema,
  storeConversationMobileSendTextInputSchema,
  storeConversationMobileTimelineInputSchema,
  storeConversationTransferClaimInputSchema,
  storeConversationTransferCreateInputSchema,
  storeConversationTransferRedeemInputSchema,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CustomerEntryPointStatus,
  StoreConversationAuditEventType,
  StoreConversationGuestAccessOrigin,
  StoreConversationGuestAccessStatus,
  StoreConversationGuestCredentialPurpose,
  StoreConversationGuestCredentialStatus,
  StoreConversationGuestIdentityStatus,
  StoreConversationLifecycle,
  StoreConversationMessageAuthorKind,
  StoreConversationMessageChannel,
  StoreConversationModerationState,
  StoreConversationTransferStatus,
} from "../../generated/prisma/enums"
import type { StoreConversationActionMaterializationDependencies } from "./store-conversation-actions"
import {
  GUEST_CREDENTIAL_LIFETIME_MS,
  StoreConversationError,
  digestStoreConversationValue,
  loadStoreConversationForGuest,
  resolveStoreConversationEntry,
  resolveStoreConversationGuestCredential,
  storeConversationPayloadHash,
  touchStoreConversationGuestCredential,
} from "./store-conversations-core"
import {
  bootstrapWebStoreConversation,
  getGuestStoreConversationTimeline,
  sendGuestStoreConversationText,
} from "./store-conversations-guest"
import {
  acknowledgeGuestStoreConversationProgress,
  getGuestStoreConversationMessagesAfter,
} from "./store-conversations-realtime"
import { selectGuestStoreConversationRequest } from "./store-conversations-requests"
import type { DbClient } from "./types"

export const STORE_CONVERSATION_TRANSFER_LIFETIME_MS = 10 * 60 * 1_000

const MOBILE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 30_000,
} as const

const mobileDeviceContext = (installationToken: string) => ({
  accessOrigin: StoreConversationGuestAccessOrigin.MOBILE_BOOTSTRAP,
  auditReason: "guest_mobile_bootstrap",
  channel: StoreConversationMessageChannel.MOBILE,
  channelOrigin: "mobile" as const,
  installationToken,
  purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
})

function projectConversationState(conversation: {
  lifecycle: StoreConversationLifecycle
  moderationState: StoreConversationModerationState
}) {
  return conversation.moderationState ===
    StoreConversationModerationState.RESTRICTED
    ? ("restricted" as const)
    : conversation.lifecycle === StoreConversationLifecycle.ARCHIVED
      ? ("archived" as const)
      : ("active" as const)
}

function projectStoreInitials(storeName: string) {
  return storeName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("")
}

function projectListMessageAuthor(author: StoreConversationMessageAuthorKind) {
  return author === StoreConversationMessageAuthorKind.CUSTOMER
    ? ("customer" as const)
    : author === StoreConversationMessageAuthorKind.STORE_ATTENDANT
      ? ("store" as const)
      : ("system" as const)
}

type MobileListCursor = { id: string; lastActivityAt: string }

function encodeMobileListCursor(cursor: MobileListCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

function decodeMobileListCursor(cursor?: string): MobileListCursor | null {
  if (!cursor) return null
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<MobileListCursor>
    const date = new Date(value.lastActivityAt ?? "")
    if (!value.id || Number.isNaN(date.getTime())) throw new Error("invalid")
    return { id: value.id, lastActivityAt: date.toISOString() }
  } catch {
    throw new StoreConversationError(
      "CONFLICT",
      "The conversation cursor is invalid. Refresh and try again.",
    )
  }
}

async function lockTransfer(db: DbClient, transferId: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "StoreConversationTransfer"
    WHERE "id" = ${transferId}
    FOR UPDATE
  `)
  if (rows.length !== 1) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "This app transfer is unavailable.",
    )
  }
}

async function loadCurrentTransfer(
  db: DbClient,
  input: { publicToken: string; transferToken: string },
) {
  const entry = await resolveStoreConversationEntry(db, {
    publicToken: input.publicToken,
  })
  const first = await db.storeConversationTransfer.findFirst({
    select: { id: true },
    where: { tokenDigest: digestStoreConversationValue(input.transferToken) },
  })
  if (!first) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "This app transfer is unavailable.",
    )
  }
  await lockTransfer(db, first.id)
  const transfer = await db.storeConversationTransfer.findFirst({
    include: {
      sourceCredential: {
        include: { guestIdentity: { select: { status: true } } },
      },
    },
    where: {
      id: first.id,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
      tokenDigest: digestStoreConversationValue(input.transferToken),
    },
  })
  if (!transfer) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "This app transfer is unavailable.",
    )
  }
  return { entry, transfer }
}

function assertTransferSourceIsActive(
  transfer: Awaited<ReturnType<typeof loadCurrentTransfer>>["transfer"],
  now: Date,
) {
  if (
    transfer.sourceCredential.purpose !==
      StoreConversationGuestCredentialPurpose.WEB_DEVICE ||
    transfer.sourceCredential.status !==
      StoreConversationGuestCredentialStatus.ACTIVE ||
    transfer.sourceCredential.expiresAt <= now ||
    transfer.sourceCredential.guestIdentity.status !==
      StoreConversationGuestIdentityStatus.ACTIVE
  ) {
    throw new StoreConversationError(
      "GUEST_CREDENTIAL_EXPIRED",
      "The browser conversation is no longer available for transfer.",
    )
  }
}

export async function bootstrapMobileStoreConversation(
  db: PrismaClient,
  input: {
    credentialToken?: string | null
    installationToken: string
    publicToken: string
  },
) {
  return bootstrapWebStoreConversation(
    db,
    input,
    mobileDeviceContext(input.installationToken),
  )
}

export async function listMobileStoreConversations(
  db: PrismaClient,
  input: {
    credentialToken: string
    cursor?: string
    installationToken: string
    pageSize?: number
  },
): Promise<StoreConversationMobileListProjection> {
  const parsed = storeConversationMobileListInputSchema.parse({
    cursor: input.cursor,
    pageSize: input.pageSize,
  })
  const cursor = decodeMobileListCursor(parsed.cursor)
  const now = new Date()
  return db.$transaction(async (tx) => {
    const credential = await resolveStoreConversationGuestCredential(tx, {
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      now,
      purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
    })
    const rows = await tx.storeConversationGuestAccess.findMany({
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { sequence: "desc" },
              select: { authorKind: true, body: true },
              take: 1,
            },
            store: {
              select: {
                customerEntryPoint: {
                  select: { publicToken: true, status: true },
                },
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ conversation: { lastActivityAt: "desc" } }, { id: "desc" }],
      take: parsed.pageSize + 1,
      where: {
        guestIdentityId: credential.guestIdentityId,
        status: StoreConversationGuestAccessStatus.ACTIVE,
        ...(cursor
          ? {
              OR: [
                {
                  conversation: {
                    lastActivityAt: { lt: new Date(cursor.lastActivityAt) },
                  },
                },
                {
                  conversation: {
                    lastActivityAt: new Date(cursor.lastActivityAt),
                  },
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
        conversation: {
          store: {
            customerEntryPoint: {
              is: { status: CustomerEntryPointStatus.PUBLISHED },
            },
          },
        },
      },
    })
    const selected = rows.slice(0, parsed.pageSize)
    const watermarks = await tx.storeConversationCustomerWatermark.findMany({
      select: { conversationId: true, readThroughSequence: true },
      where: {
        conversationId: { in: selected.map((row) => row.conversation.id) },
        credentialId: credential.id,
      },
    })
    const readThroughByConversation = new Map<string, number>(
      watermarks.map(
        (watermark) =>
          [watermark.conversationId, watermark.readThroughSequence] as const,
      ),
    )
    const unreadStoreMessages = new Map<string, number>(
      await Promise.all(
        selected.map(
          async (access) =>
            [
              access.conversation.id,
              await tx.storeConversationMessage.count({
                where: {
                  authorKind:
                    StoreConversationMessageAuthorKind.STORE_ATTENDANT,
                  conversationId: access.conversation.id,
                  sequence: {
                    gt:
                      readThroughByConversation.get(access.conversation.id) ??
                      0,
                  },
                  storeId: access.conversation.storeId,
                  tenantId: access.conversation.tenantId,
                },
              }),
            ] as const,
        ),
      ),
    )
    const credentialExpiresAt = await touchStoreConversationGuestCredential(
      tx,
      {
        credentialId: credential.id,
        credentialStatus: credential.status,
        guestIdentityId: credential.guestIdentityId,
        now,
        overlapExpiresAt: credential.overlapExpiresAt,
      },
    )
    const last = selected.at(-1)
    return {
      credentialExpiresAt,
      items: selected.flatMap((access) => {
        const entry = access.conversation.store.customerEntryPoint
        return entry?.status === CustomerEntryPointStatus.PUBLISHED
          ? [
              {
                conversationId: access.conversation.id,
                lastActivityAt: access.conversation.lastActivityAt,
                lastMessageSequence: access.conversation.lastMessageSequence,
                unreadStoreMessages:
                  unreadStoreMessages.get(access.conversation.id) ?? 0,
                lastMessage: access.conversation.messages[0]
                  ? {
                      author: projectListMessageAuthor(
                        access.conversation.messages[0].authorKind,
                      ),
                      text: access.conversation.messages[0].body,
                    }
                  : null,
                publicToken: entry.publicToken,
                state: projectConversationState(access.conversation),
                storeName: access.conversation.store.name,
                storeAvatar: {
                  kind: "initials" as const,
                  label: projectStoreInitials(access.conversation.store.name),
                },
              },
            ]
          : []
      }),
      nextCursor:
        rows.length > parsed.pageSize && last
          ? encodeMobileListCursor({
              id: last.id,
              lastActivityAt: last.conversation.lastActivityAt.toISOString(),
            })
          : null,
    }
  })
}

export async function getMobileStoreConversationTimeline(
  db: PrismaClient,
  input: {
    beforeSequence?: number
    conversationId: string
    credentialToken: string
    installationToken: string
    limit?: number
    publicToken: string
  },
  actionDependencies?: StoreConversationActionMaterializationDependencies,
) {
  const parsed = storeConversationMobileTimelineInputSchema.parse({
    beforeSequence: input.beforeSequence,
    conversationId: input.conversationId,
    limit: input.limit,
    publicToken: input.publicToken,
  })
  const timeline = await getGuestStoreConversationTimeline(
    db,
    { ...parsed, credentialToken: input.credentialToken },
    mobileDeviceContext(input.installationToken),
    actionDependencies,
  )
  const credential = await resolveStoreConversationGuestCredential(db, {
    credentialToken: input.credentialToken,
    installationToken: input.installationToken,
    now: new Date(),
    purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
  })
  return { ...timeline, credentialExpiresAt: credential.expiresAt }
}

export async function getMobileStoreConversationMessagesAfter(
  db: PrismaClient,
  input: {
    actionMessageIds?: string[]
    afterSequence?: number
    conversationId: string
    credentialToken: string
    installationToken: string
    limit?: number
    publicToken: string
  },
  actionDependencies?: StoreConversationActionMaterializationDependencies,
) {
  const result = await getGuestStoreConversationMessagesAfter(
    db,
    input,
    mobileDeviceContext(input.installationToken),
    actionDependencies,
  )
  const credential = await resolveStoreConversationGuestCredential(db, {
    credentialToken: input.credentialToken,
    installationToken: input.installationToken,
    now: new Date(),
    purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
  })
  return { ...result, credentialExpiresAt: credential.expiresAt }
}

export async function acknowledgeMobileStoreConversationProgress(
  db: PrismaClient,
  input: {
    clientOperationId: string
    conversationId: string
    credentialToken: string
    deliveredThroughSequence: number
    installationToken: string
    publicToken: string
    readThroughSequence: number
  },
) {
  const result = await acknowledgeGuestStoreConversationProgress(
    db,
    input,
    mobileDeviceContext(input.installationToken),
  )
  const credential = await resolveStoreConversationGuestCredential(db, {
    credentialToken: input.credentialToken,
    installationToken: input.installationToken,
    now: new Date(),
    purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
  })
  return { ...result, credentialExpiresAt: credential.expiresAt }
}

export async function sendMobileStoreConversationText(
  db: PrismaClient,
  input: {
    clientOperationId: string
    conversationId: string
    credentialToken: string
    installationToken: string
    publicToken: string
    requestIntent?: "choose_request" | "continue_current"
    text: string
  },
) {
  const parsed = storeConversationMobileSendTextInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    publicToken: input.publicToken,
    requestIntent: input.requestIntent,
    text: input.text,
  })
  const result = await sendGuestStoreConversationText(
    db,
    { ...parsed, credentialToken: input.credentialToken },
    mobileDeviceContext(input.installationToken),
  )
  const credential = await resolveStoreConversationGuestCredential(db, {
    credentialToken: input.credentialToken,
    installationToken: input.installationToken,
    now: new Date(),
    purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
  })
  return { ...result, credentialExpiresAt: credential.expiresAt }
}

export async function selectMobileStoreConversationRequest(
  db: PrismaClient,
  input: StoreConversationSelectRequestInput & {
    credentialToken: string
    installationToken: string
  },
) {
  const result = await selectGuestStoreConversationRequest(db, {
    channelOrigin: "mobile",
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    credentialToken: input.credentialToken,
    installationToken: input.installationToken,
    messageId: input.messageId,
    publicToken: input.publicToken,
    purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
    target: input.target,
  })
  const credential = await resolveStoreConversationGuestCredential(db, {
    credentialToken: input.credentialToken,
    installationToken: input.installationToken,
    now: new Date(),
    purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
  })
  return { ...result, credentialExpiresAt: credential.expiresAt }
}

export async function createWebStoreConversationTransfer(
  db: PrismaClient,
  input: {
    clientOperationId: string
    conversationId: string
    credentialToken: string
    publicToken: string
    transferToken: string
  },
) {
  const parsed = storeConversationTransferCreateInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    publicToken: input.publicToken,
    transferToken: input.transferToken,
  })
  const now = new Date()
  const expiresAt = new Date(
    now.getTime() + STORE_CONVERSATION_TRANSFER_LIFETIME_MS,
  )
  return db.$transaction(async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: parsed.publicToken,
    })
    const { conversation, credential } = await loadStoreConversationForGuest(
      tx,
      {
        conversationId: parsed.conversationId,
        credentialToken: input.credentialToken,
        now,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    )
    const payloadHash = storeConversationPayloadHash({
      conversationId: conversation.id,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
      transferTokenDigest: digestStoreConversationValue(parsed.transferToken),
    })
    const existing = await tx.storeConversationTransfer.findFirst({
      where: {
        clientOperationId: parsed.clientOperationId,
        sourceCredentialId: credential.id,
      },
    })
    if (existing) {
      if (
        existing.payloadHash !== payloadHash ||
        existing.status === StoreConversationTransferStatus.REDEEMED ||
        existing.status === StoreConversationTransferStatus.REVOKED ||
        existing.expiresAt <= now
      ) {
        throw new StoreConversationError(
          "CONFLICT",
          "This app transfer command is no longer reusable.",
        )
      }
      return {
        expiresAt: existing.expiresAt,
        transferToken: parsed.transferToken,
      }
    }
    const tokenCollision = await tx.storeConversationTransfer.findFirst({
      select: { id: true },
      where: {
        tokenDigest: digestStoreConversationValue(parsed.transferToken),
      },
    })
    if (tokenCollision) {
      throw new StoreConversationError(
        "CONFLICT",
        "Create this app transfer again with a new secure token.",
      )
    }
    await tx.storeConversationTransfer.create({
      data: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
        expiresAt,
        payloadHash,
        sourceCredentialId: credential.id,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
        tokenDigest: digestStoreConversationValue(parsed.transferToken),
      },
    })
    await tx.storeConversationAuditEvent.create({
      data: {
        actorKind: StoreConversationMessageAuthorKind.CUSTOMER,
        conversationId: conversation.id,
        reasonCode: "mobile_transfer_created",
        storeId: entry.storeId,
        tenantId: entry.tenantId,
        type: StoreConversationAuditEventType.TRANSFER_CREATED,
      },
    })
    return { expiresAt, transferToken: parsed.transferToken }
  }, MOBILE_TRANSACTION_OPTIONS)
}

export async function claimMobileStoreConversationTransfer(
  db: PrismaClient,
  input: {
    installationToken: string
    publicToken: string
    transferToken: string
  },
) {
  const parsed = storeConversationTransferClaimInputSchema.parse(input)
  const now = new Date()
  const installationDigest = digestStoreConversationValue(
    parsed.installationToken,
  )
  return db.$transaction(async (tx) => {
    const { entry, transfer } = await loadCurrentTransfer(tx, parsed)
    if (transfer.status === StoreConversationTransferStatus.REDEEMED) {
      if (transfer.claimedInstallationDigest !== installationDigest) {
        throw new StoreConversationError(
          "FORBIDDEN",
          "This app transfer belongs to another device.",
        )
      }
      return { expiresAt: transfer.expiresAt, state: "claimed" as const }
    }
    assertTransferSourceIsActive(transfer, now)
    if (transfer.expiresAt <= now) {
      throw new StoreConversationError(
        "CONFLICT",
        "This app transfer has expired.",
      )
    }
    if (transfer.status === StoreConversationTransferStatus.CLAIMED) {
      if (transfer.claimedInstallationDigest !== installationDigest) {
        throw new StoreConversationError(
          "FORBIDDEN",
          "This app transfer belongs to another device.",
        )
      }
      return { expiresAt: transfer.expiresAt, state: "claimed" as const }
    }
    if (transfer.status !== StoreConversationTransferStatus.PENDING) {
      throw new StoreConversationError(
        "CONFLICT",
        "This app transfer is unavailable.",
      )
    }
    await tx.storeConversationTransfer.update({
      data: {
        claimedAt: now,
        claimedInstallationDigest: installationDigest,
        status: StoreConversationTransferStatus.CLAIMED,
      },
      where: { id: transfer.id },
    })
    await tx.storeConversationAuditEvent.create({
      data: {
        actorKind: StoreConversationMessageAuthorKind.CUSTOMER,
        conversationId: transfer.conversationId,
        reasonCode: "mobile_transfer_claimed",
        storeId: entry.storeId,
        tenantId: entry.tenantId,
        type: StoreConversationAuditEventType.TRANSFER_CLAIMED,
      },
    })
    return { expiresAt: transfer.expiresAt, state: "claimed" as const }
  }, MOBILE_TRANSACTION_OPTIONS)
}

export async function redeemMobileStoreConversationTransfer(
  db: PrismaClient,
  input: {
    installationToken: string
    publicToken: string
    targetCredentialToken: string
    transferToken: string
  },
) {
  const parsed = storeConversationTransferRedeemInputSchema.parse({
    installationToken: input.installationToken,
    publicToken: input.publicToken,
    targetCredentialToken: input.targetCredentialToken,
    transferToken: input.transferToken,
  })
  const now = new Date()
  const installationDigest = digestStoreConversationValue(
    parsed.installationToken,
  )
  return db.$transaction(async (tx) => {
    const { entry, transfer } = await loadCurrentTransfer(tx, parsed)
    if (
      transfer.claimedInstallationDigest !== installationDigest ||
      (transfer.status !== StoreConversationTransferStatus.CLAIMED &&
        transfer.status !== StoreConversationTransferStatus.REDEEMED)
    ) {
      throw new StoreConversationError(
        transfer.claimedInstallationDigest !== installationDigest
          ? "FORBIDDEN"
          : "CONFLICT",
        transfer.claimedInstallationDigest !== installationDigest
          ? "This app transfer belongs to another device."
          : "Claim this app transfer before redeeming it.",
      )
    }
    if (transfer.status !== StoreConversationTransferStatus.REDEEMED) {
      assertTransferSourceIsActive(transfer, now)
      if (transfer.expiresAt <= now) {
        throw new StoreConversationError(
          "CONFLICT",
          "This app transfer has expired.",
        )
      }
    }
    const targetCredentialDigest = digestStoreConversationValue(
      parsed.targetCredentialToken,
    )
    let credential = await tx.storeConversationGuestCredential.findFirst({
      include: { guestIdentity: { select: { id: true, status: true } } },
      where: { tokenDigest: targetCredentialDigest },
    })
    if (credential) {
      if (
        credential.deviceBindingDigest !== installationDigest ||
        credential.purpose !==
          StoreConversationGuestCredentialPurpose.MOBILE_DEVICE ||
        credential.status !== StoreConversationGuestCredentialStatus.ACTIVE ||
        credential.expiresAt <= now ||
        credential.guestIdentity.status !==
          StoreConversationGuestIdentityStatus.ACTIVE
      ) {
        throw new StoreConversationError(
          "FORBIDDEN",
          "This mobile guest credential is unavailable on this device.",
        )
      }
    } else {
      const guestIdentity = await tx.storeConversationGuestIdentity.create({
        data: {},
      })
      credential = await tx.storeConversationGuestCredential.create({
        data: {
          deviceBindingDigest: installationDigest,
          expiresAt: new Date(now.getTime() + GUEST_CREDENTIAL_LIFETIME_MS),
          guestIdentityId: guestIdentity.id,
          purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
          tokenDigest: targetCredentialDigest,
        },
        include: { guestIdentity: { select: { id: true, status: true } } },
      })
    }
    if (transfer.status === StoreConversationTransferStatus.REDEEMED) {
      if (
        transfer.redeemedCredentialId !== credential.id ||
        transfer.redeemedGuestIdentityId !== credential.guestIdentityId
      ) {
        throw new StoreConversationError(
          "FORBIDDEN",
          "This app transfer was redeemed by another mobile guest.",
        )
      }
      const credentialExpiresAt = await touchStoreConversationGuestCredential(
        tx,
        {
          credentialId: credential.id,
          credentialStatus: credential.status,
          guestIdentityId: credential.guestIdentityId,
          now,
          overlapExpiresAt: credential.overlapExpiresAt,
        },
      )
      const conversation = await tx.storeConversation.findFirst({
        where: {
          id: transfer.conversationId,
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        },
      })
      if (!conversation) {
        throw new StoreConversationError(
          "NOT_FOUND",
          "This Store conversation is unavailable.",
        )
      }
      return {
        conversation: {
          id: conversation.id,
          moderation: projectStoreConversationModeration(conversation),
          state: projectConversationState(conversation),
          storeName: entry.storeName,
        },
        credentialExpiresAt,
        credentialToken: parsed.targetCredentialToken,
        expiresAt: transfer.expiresAt,
        replayed: true,
        state: "redeemed" as const,
      }
    }
    await tx.storeConversationGuestAccess.upsert({
      create: {
        conversationId: transfer.conversationId,
        guestIdentityId: credential.guestIdentityId,
        lastOpenedAt: now,
        origin: StoreConversationGuestAccessOrigin.TRANSFER,
        status: StoreConversationGuestAccessStatus.ACTIVE,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
      update: {
        lastOpenedAt: now,
        revokedAt: null,
        status: StoreConversationGuestAccessStatus.ACTIVE,
      },
      where: {
        conversationId_guestIdentityId: {
          conversationId: transfer.conversationId,
          guestIdentityId: credential.guestIdentityId,
        },
      },
    })
    await tx.storeConversationTransfer.update({
      data: {
        redeemedAt: now,
        redeemedCredentialId: credential.id,
        redeemedGuestIdentityId: credential.guestIdentityId,
        status: StoreConversationTransferStatus.REDEEMED,
      },
      where: { id: transfer.id },
    })
    await tx.storeConversationAuditEvent.create({
      data: {
        actorKind: StoreConversationMessageAuthorKind.CUSTOMER,
        conversationId: transfer.conversationId,
        reasonCode: "mobile_transfer_redeemed",
        storeId: entry.storeId,
        tenantId: entry.tenantId,
        type: StoreConversationAuditEventType.TRANSFER_REDEEMED,
      },
    })
    const credentialExpiresAt = await touchStoreConversationGuestCredential(
      tx,
      {
        credentialId: credential.id,
        credentialStatus: credential.status,
        guestIdentityId: credential.guestIdentityId,
        now,
        overlapExpiresAt: credential.overlapExpiresAt,
      },
    )
    const conversation = await tx.storeConversation.findFirst({
      where: {
        id: transfer.conversationId,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (!conversation) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This Store conversation is unavailable.",
      )
    }
    return {
      conversation: {
        id: conversation.id,
        moderation: projectStoreConversationModeration(conversation),
        state: projectConversationState(conversation),
        storeName: entry.storeName,
      },
      credentialExpiresAt,
      credentialToken: parsed.targetCredentialToken,
      expiresAt: transfer.expiresAt,
      replayed: false,
      state: "redeemed" as const,
    }
  }, MOBILE_TRANSACTION_OPTIONS)
}
