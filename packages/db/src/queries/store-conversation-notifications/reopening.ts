import { storeConversationNotifyWhenAvailableInputSchema } from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import {
  StoreConversationGuestCredentialPurpose,
  StoreConversationLifecycle,
  StoreConversationModerationState,
  StoreConversationNotificationAuditType,
  StoreConversationNotificationCommandKind,
  StoreConversationNotificationIntentStatus,
  StoreConversationNotificationKind,
  StoreConversationNotificationPrincipalKind,
} from "../../../generated/prisma/enums"
import { resolveCustomerEntryPointContextInTransaction } from "../customer-channels"
import { loadStoreConversationForAccount } from "../store-conversation-accounts"
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

type GuestDevice = {
  installationToken?: string
  purpose: StoreConversationGuestCredentialPurpose
}

const WEB_DEVICE: GuestDevice = {
  purpose: StoreConversationGuestCredentialPurpose.WEB_DEVICE,
}

type ReopeningPrincipal =
  | {
      accountUserId: string
      commandPrincipalKey: string
      guestCredentialId?: never
      guestIdentityId?: never
      principalId: string
      principalKind: "ACCOUNT"
    }
  | {
      accountUserId?: never
      commandPrincipalKey: string
      guestCredentialId: string
      guestIdentityId: string
      principalId: string
      principalKind: "GUEST_IDENTITY"
    }

async function subscribeInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    clientOperationId: string
    conversationId: string
    now: Date
    storeId: string
    tenantId: string
  },
  principal: ReopeningPrincipal,
) {
  const payloadHash = notificationPayloadHash({
    conversationId: input.conversationId,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  const replay = await tx.storeConversationNotificationCommand.findUnique({
    where: {
      principalKey_clientOperationId: {
        clientOperationId: input.clientOperationId,
        principalKey: principal.commandPrincipalKey,
      },
    },
  })
  if (replay) {
    assertNotificationCommandReplay({
      actualKind: replay.kind,
      actualPayloadHash: replay.payloadHash,
      expectedKind:
        StoreConversationNotificationCommandKind.REOPENING_SUBSCRIBED,
      expectedPayloadHash: payloadHash,
    })
    const intent = replay.resultId
      ? await tx.storeConversationNotificationIntent.findFirst({
          select: { id: true, status: true, subscribedAt: true },
          where: {
            id: replay.resultId,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
      : null
    if (!intent) {
      throw new StoreConversationNotificationError(
        "CONFLICT",
        "This reopening request cannot be recovered.",
      )
    }
    return {
      intentId: intent.id,
      replayed: true,
      state:
        intent.status === "WAITING" ? ("waiting" as const) : ("sent" as const),
      subscribedAt: intent.subscribedAt ?? input.now,
    }
  }
  const existing = await tx.storeConversationNotificationIntent.findFirst({
    orderBy: [{ subscribedAt: "desc" }, { id: "desc" }],
    select: { id: true, subscribedAt: true },
    where: {
      coalescingKey: [
        "store-conversation-reopening",
        input.conversationId,
        principal.principalKind,
        principal.principalId,
      ].join(":"),
      kind: StoreConversationNotificationKind.STORE_REOPENED,
      status: StoreConversationNotificationIntentStatus.WAITING,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const configuration =
    await tx.storeConversationAvailabilityConfiguration.findUnique({
      select: { revision: true },
      where: { storeId: input.storeId },
    })
  const coalescingKey = [
    "store-conversation-reopening",
    input.conversationId,
    principal.principalKind,
    principal.principalId,
  ].join(":")
  const intent =
    existing ??
    (await tx.storeConversationNotificationIntent.create({
      data: {
        accountUserId: principal.accountUserId,
        availabilityConfigurationRevision: configuration?.revision ?? 0,
        coalescingKey,
        conversationId: input.conversationId,
        deduplicationKey: `${coalescingKey}:${input.clientOperationId}`,
        guestIdentityId: principal.guestIdentityId,
        kind: StoreConversationNotificationKind.STORE_REOPENED,
        nextAttemptAt: null,
        principalKind: principal.principalKind,
        scheduledFor: input.now,
        status: StoreConversationNotificationIntentStatus.WAITING,
        storeId: input.storeId,
        subscribedAt: input.now,
        tenantId: input.tenantId,
      },
      select: { id: true, subscribedAt: true },
    }))
  await Promise.all([
    tx.storeConversationNotificationCommand.create({
      data: {
        accountUserId: principal.accountUserId,
        clientOperationId: input.clientOperationId,
        conversationId: input.conversationId,
        guestCredentialId: principal.guestCredentialId,
        kind: StoreConversationNotificationCommandKind.REOPENING_SUBSCRIBED,
        payloadHash,
        principalKey: principal.commandPrincipalKey,
        resultId: intent.id,
      },
    }),
    tx.storeConversationNotificationAuditEvent.create({
      data: {
        actorAccountUserId: principal.accountUserId,
        actorGuestIdentityId: principal.guestIdentityId,
        conversationId: input.conversationId,
        notificationIntentId: intent.id,
        reasonCode: existing
          ? "reopening_subscription_coalesced"
          : "reopening_subscription_created",
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: StoreConversationNotificationAuditType.REOPENING_SUBSCRIBED,
      },
    }),
  ])
  return {
    intentId: intent.id,
    replayed: false,
    state: "waiting" as const,
    subscribedAt: intent.subscribedAt ?? input.now,
  }
}

export async function subscribeGuestStoreConversationReopening(
  db: PrismaClient,
  rawInput: {
    clientOperationId: string
    confirmed: true
    conversationId: string
    credentialToken: string
    now?: Date
    publicToken: string
  },
  device: GuestDevice = WEB_DEVICE,
) {
  const input = storeConversationNotifyWhenAvailableInputSchema.parse({
    clientOperationId: rawInput.clientOperationId,
    confirmed: rawInput.confirmed,
    conversationId: rawInput.conversationId,
    publicToken: rawInput.publicToken,
  })
  const now = rawInput.now ?? new Date()
  try {
    return await db.$transaction(async (tx) => {
      const entry = await resolveStoreConversationEntry(tx, {
        publicToken: input.publicToken,
      })
      if (entry.availability.available) {
        throw new StoreConversationNotificationError(
          "NOT_READY",
          "This Store chat is already available.",
        )
      }
      const loaded = await loadStoreConversationForGuest(tx, {
        conversationId: input.conversationId,
        credentialToken: rawInput.credentialToken,
        installationToken: device.installationToken,
        now,
        purpose: device.purpose,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
      await lockStoreConversation(tx, {
        conversationId: loaded.conversation.id,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
      if (
        loaded.conversation.lifecycle !== StoreConversationLifecycle.ACTIVE ||
        loaded.conversation.moderationState !==
          StoreConversationModerationState.OPEN
      ) {
        throw new StoreConversationNotificationError(
          "NOT_READY",
          "This Store conversation cannot receive notifications.",
        )
      }
      const accountAccess = await tx.storeConversationAccountAccess.findUnique({
        select: { accountUserId: true },
        where: { conversationId: loaded.conversation.id },
      })
      if (accountAccess) {
        throw new StoreConversationNotificationError(
          "FORBIDDEN",
          "Use the linked Customer Account to manage notifications.",
        )
      }
      return subscribeInTransaction(
        tx,
        {
          clientOperationId: input.clientOperationId,
          conversationId: loaded.conversation.id,
          now,
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        },
        {
          commandPrincipalKey: `guest:${loaded.credential.id}`,
          guestCredentialId: loaded.credential.id,
          guestIdentityId: loaded.conversation.guestIdentityId,
          principalId: loaded.conversation.guestIdentityId,
          principalKind:
            StoreConversationNotificationPrincipalKind.GUEST_IDENTITY,
        },
      )
    }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
  } catch (error) {
    translateNotificationWriteError(error)
  }
}

export async function subscribeAccountStoreConversationReopening(
  db: PrismaClient,
  rawInput: {
    accountUserId: string
    clientOperationId: string
    confirmed: true
    conversationId: string
    now?: Date
    publicToken: string
  },
) {
  const input = storeConversationNotifyWhenAvailableInputSchema.parse({
    clientOperationId: rawInput.clientOperationId,
    confirmed: rawInput.confirmed,
    conversationId: rawInput.conversationId,
    publicToken: rawInput.publicToken,
  })
  const now = rawInput.now ?? new Date()
  try {
    return await db.$transaction(async (tx) => {
      const entry = await resolveStoreConversationEntry(tx, {
        publicToken: input.publicToken,
      })
      if (entry.availability.available) {
        throw new StoreConversationNotificationError(
          "NOT_READY",
          "This Store chat is already available.",
        )
      }
      const loaded = await loadStoreConversationForAccount(tx, {
        accountUserId: rawInput.accountUserId,
        conversationId: input.conversationId,
        now,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
      await lockStoreConversation(tx, {
        conversationId: loaded.conversation.id,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
      if (
        loaded.conversation.lifecycle !== StoreConversationLifecycle.ACTIVE ||
        loaded.conversation.moderationState !==
          StoreConversationModerationState.OPEN
      ) {
        throw new StoreConversationNotificationError(
          "NOT_READY",
          "This Store conversation cannot receive notifications.",
        )
      }
      return subscribeInTransaction(
        tx,
        {
          clientOperationId: input.clientOperationId,
          conversationId: loaded.conversation.id,
          now,
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        },
        {
          accountUserId: rawInput.accountUserId,
          commandPrincipalKey: `account:${rawInput.accountUserId}`,
          principalId: rawInput.accountUserId,
          principalKind: StoreConversationNotificationPrincipalKind.ACCOUNT,
        },
      )
    }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
  } catch (error) {
    translateNotificationWriteError(error)
  }
}

export async function listWaitingStoreConversationReopeningIntents(
  db: PrismaClient,
  input: { limit?: number } = {},
) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200)
  const rows = await db.storeConversationNotificationIntent.findMany({
    orderBy: [{ subscribedAt: "asc" }, { id: "asc" }],
    select: { id: true, storeId: true, tenantId: true },
    take: limit,
    where: {
      kind: StoreConversationNotificationKind.STORE_REOPENED,
      status: StoreConversationNotificationIntentStatus.WAITING,
    },
  })
  return rows.map((row) => ({
    intentId: row.id,
    storeId: row.storeId,
    tenantId: row.tenantId,
  }))
}

export async function releaseStoreConversationReopeningIntent(
  db: PrismaClient,
  input: {
    intentId: string
    now?: Date
    storeId: string
    tenantId: string
  },
  dependencies: {
    resolveAvailability?: (
      tx: Prisma.TransactionClient,
      scope: { storeId: string; tenantId: string },
    ) => Promise<{ available: boolean }>
  } = {},
) {
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "StoreConversationNotificationIntent"
        WHERE "id" = ${input.intentId}
          AND "tenantId" = ${input.tenantId}
          AND "storeId" = ${input.storeId}
        FOR UPDATE
      `)
    const intent = await tx.storeConversationNotificationIntent.findFirst({
      select: {
        conversationId: true,
        id: true,
        subscribedAt: true,
      },
      where: {
        id: input.intentId,
        kind: StoreConversationNotificationKind.STORE_REOPENED,
        status: StoreConversationNotificationIntentStatus.WAITING,
        storeId: input.storeId,
        subscribedAt: { lte: now },
        tenantId: input.tenantId,
      },
    })
    if (!intent) return null
    const availability = dependencies.resolveAvailability
      ? await dependencies.resolveAvailability(tx, {
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
      : (
          await resolveCustomerEntryPointContextInTransaction(tx, {
            storeId: input.storeId,
            tenantId: input.tenantId,
          })
        ).availability
    if (!availability.available) return null
    const released = await tx.storeConversationNotificationIntent.updateMany({
      data: {
        nextAttemptAt: now,
        scheduledFor: now,
        status: StoreConversationNotificationIntentStatus.PENDING,
      },
      where: {
        id: intent.id,
        status: StoreConversationNotificationIntentStatus.WAITING,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (released.count !== 1) return null
    await tx.storeConversationNotificationAuditEvent.create({
      data: {
        conversationId: intent.conversationId,
        notificationIntentId: intent.id,
        reasonCode: "store_availability_reopened_after_subscription",
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: StoreConversationNotificationAuditType.REOPENING_RELEASED,
      },
    })
    return {
      intentId: intent.id,
      releasedAt: now,
      storeId: input.storeId,
      tenantId: input.tenantId,
    }
  }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
}
