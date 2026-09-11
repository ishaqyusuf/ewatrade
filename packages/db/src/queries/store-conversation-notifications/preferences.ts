import {
  storeConversationAccountNotificationPreferenceInputSchema,
  storeConversationPushEndpointRevokeInputSchema,
} from "@ewatrade/service-commerce"

import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  StoreConversationGuestCredentialPurpose,
  StoreConversationNotificationAuditType,
  StoreConversationNotificationCommandKind,
  StoreConversationPushEndpointKind,
  StoreConversationPushEndpointStatus,
} from "../../../generated/prisma/enums"
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
  projectNotificationPreference,
  translateNotificationWriteError,
} from "./shared"

type GuestDevice = {
  installationToken?: string
  purpose: StoreConversationGuestCredentialPurpose
}

const WEB_DEVICE: GuestDevice = {
  purpose: StoreConversationGuestCredentialPurpose.WEB_DEVICE,
}

const DEFAULT_ACCOUNT_NOTIFICATION_PREFERENCE = {
  orderedChannels: ["push", "email", "whatsapp"],
  reopeningEnabled: false,
  unreadEnabled: false,
} as const

export async function getStoreConversationAccountNotificationPreference(
  db: PrismaClient,
  input: { accountUserId: string },
) {
  const [user, preference] = await Promise.all([
    db.user.findUnique({
      select: { emailVerified: true, id: true },
      where: { id: input.accountUserId },
    }),
    db.storeConversationAccountNotificationPreference.findUnique({
      where: { accountUserId: input.accountUserId },
    }),
  ])
  if (!user) {
    throw new StoreConversationNotificationError(
      "FORBIDDEN",
      "Customer Account access is required.",
    )
  }
  return {
    emailEligible: user.emailVerified,
    preference: preference
      ? projectNotificationPreference(preference)
      : {
          orderedChannels: [
            ...DEFAULT_ACCOUNT_NOTIFICATION_PREFERENCE.orderedChannels,
          ],
          reopeningEnabled:
            DEFAULT_ACCOUNT_NOTIFICATION_PREFERENCE.reopeningEnabled,
          unreadEnabled: DEFAULT_ACCOUNT_NOTIFICATION_PREFERENCE.unreadEnabled,
        },
  }
}

export async function updateStoreConversationAccountNotificationPreference(
  db: PrismaClient,
  rawInput: {
    accountUserId: string
    clientOperationId: string
    orderedChannels: Array<"email" | "push" | "whatsapp">
    reopeningEnabled: boolean
    unreadEnabled: boolean
  },
) {
  const input = storeConversationAccountNotificationPreferenceInputSchema.parse(
    {
      clientOperationId: rawInput.clientOperationId,
      orderedChannels: rawInput.orderedChannels,
      reopeningEnabled: rawInput.reopeningEnabled,
      unreadEnabled: rawInput.unreadEnabled,
    },
  )
  const payloadHash = notificationPayloadHash(input)
  const principalKey = `account:${rawInput.accountUserId}`
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        select: { id: true },
        where: { id: rawInput.accountUserId },
      })
      if (!user) {
        throw new StoreConversationNotificationError(
          "FORBIDDEN",
          "Customer Account access is required.",
        )
      }
      const access = await tx.storeConversationAccountAccess.findFirst({
        select: { conversationId: true, storeId: true, tenantId: true },
        where: { accountUserId: user.id, status: "ACTIVE" },
      })
      if (!access) {
        throw new StoreConversationNotificationError(
          "FORBIDDEN",
          "Link a Store conversation before changing these preferences.",
        )
      }
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
            StoreConversationNotificationCommandKind.PREFERENCE_UPDATED,
          expectedPayloadHash: payloadHash,
        })
        const current =
          await tx.storeConversationAccountNotificationPreference.findUniqueOrThrow(
            { where: { accountUserId: user.id } },
          )
        return {
          preference: projectNotificationPreference(current),
          replayed: true,
        }
      }
      const preference =
        await tx.storeConversationAccountNotificationPreference.upsert({
          create: {
            accountUserId: user.id,
            orderedChannels: input.orderedChannels,
            reopeningEnabled: input.reopeningEnabled,
            unreadEnabled: input.unreadEnabled,
          },
          update: {
            orderedChannels: input.orderedChannels,
            reopeningEnabled: input.reopeningEnabled,
            unreadEnabled: input.unreadEnabled,
          },
          where: { accountUserId: user.id },
        })
      await Promise.all([
        tx.storeConversationNotificationCommand.create({
          data: {
            accountUserId: user.id,
            clientOperationId: input.clientOperationId,
            kind: StoreConversationNotificationCommandKind.PREFERENCE_UPDATED,
            payloadHash,
            principalKey,
            resultId: preference.id,
          },
        }),
        tx.storeConversationNotificationAuditEvent.create({
          data: {
            actorAccountUserId: user.id,
            conversationId: access.conversationId,
            reasonCode: "notification_preference_updated",
            storeId: access.storeId,
            tenantId: access.tenantId,
            type: StoreConversationNotificationAuditType.PREFERENCE_UPDATED,
          },
        }),
      ])
      return {
        preference: projectNotificationPreference(preference),
        replayed: false,
      }
    }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
  } catch (error) {
    translateNotificationWriteError(error)
  }
}

function databaseEndpointKind(kind: "native_expo" | "web_push") {
  return kind === "native_expo"
    ? StoreConversationPushEndpointKind.NATIVE_EXPO
    : StoreConversationPushEndpointKind.WEB_PUSH
}

async function registerPushEndpoint(
  db: Prisma.TransactionClient,
  input: {
    accountUserId?: string
    clientOperationId: string
    conversationId: string
    endpointCiphertext: string
    endpointDigest: string
    guestCredentialId?: string
    guestIdentityId?: string
    kind: "native_expo" | "web_push"
    storeId: string
    tenantId: string
  },
) {
  const principalKey = input.accountUserId
    ? `account:${input.accountUserId}`
    : `guest:${input.guestCredentialId}`
  const payloadHash = notificationPayloadHash({
    conversationId: input.conversationId,
    endpointDigest: input.endpointDigest,
    kind: input.kind,
  })
  const replay = await db.storeConversationNotificationCommand.findUnique({
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
      expectedKind: StoreConversationNotificationCommandKind.PUSH_REGISTERED,
      expectedPayloadHash: payloadHash,
    })
    return { endpointId: replay.resultId, replayed: true }
  }
  const endpoint = await db.storeConversationPushEndpoint.upsert({
    create: {
      accountUserId: input.accountUserId ?? null,
      conversationId: input.conversationId,
      endpointCiphertext: input.endpointCiphertext,
      endpointDigest: input.endpointDigest,
      guestCredentialId: input.guestCredentialId ?? null,
      kind: databaseEndpointKind(input.kind),
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    update: {
      accountUserId: input.accountUserId ?? null,
      endpointCiphertext: input.endpointCiphertext,
      guestCredentialId: input.guestCredentialId ?? null,
      invalidatedAt: null,
      kind: databaseEndpointKind(input.kind),
      lastSeenAt: new Date(),
      revokedAt: null,
      status: StoreConversationPushEndpointStatus.ACTIVE,
    },
    where: {
      conversationId_endpointDigest: {
        conversationId: input.conversationId,
        endpointDigest: input.endpointDigest,
      },
    },
  })
  await Promise.all([
    db.storeConversationNotificationCommand.create({
      data: {
        accountUserId: input.accountUserId,
        clientOperationId: input.clientOperationId,
        conversationId: input.conversationId,
        guestCredentialId: input.guestCredentialId,
        kind: StoreConversationNotificationCommandKind.PUSH_REGISTERED,
        payloadHash,
        principalKey,
        resultId: endpoint.id,
      },
    }),
    db.storeConversationNotificationAuditEvent.create({
      data: {
        actorAccountUserId: input.accountUserId,
        actorGuestIdentityId: input.guestIdentityId,
        conversationId: input.conversationId,
        reasonCode: "notification_push_registered",
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: StoreConversationNotificationAuditType.PUSH_REGISTERED,
      },
    }),
  ])
  return { endpointId: endpoint.id, replayed: false }
}

export async function registerGuestStoreConversationPushEndpoint(
  db: PrismaClient,
  input: {
    clientOperationId: string
    conversationId: string
    credentialToken: string
    endpointCiphertext: string
    endpointDigest: string
    kind: "native_expo" | "web_push"
    now?: Date
    publicToken: string
  },
  device: GuestDevice = WEB_DEVICE,
) {
  const now = input.now ?? new Date()
  try {
    return await db.$transaction(async (tx) => {
      const entry = await resolveStoreConversationEntry(tx, {
        publicToken: input.publicToken,
      })
      const loaded = await loadStoreConversationForGuest(tx, {
        conversationId: input.conversationId,
        credentialToken: input.credentialToken,
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
      return registerPushEndpoint(tx, {
        ...input,
        guestCredentialId: loaded.credential.id,
        guestIdentityId: loaded.conversation.guestIdentityId,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
    }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
  } catch (error) {
    translateNotificationWriteError(error)
  }
}

export async function registerAccountStoreConversationPushEndpoint(
  db: PrismaClient,
  input: {
    accountUserId: string
    clientOperationId: string
    conversationId: string
    endpointCiphertext: string
    endpointDigest: string
    kind: "native_expo" | "web_push"
    now?: Date
    publicToken: string
  },
) {
  const now = input.now ?? new Date()
  try {
    return await db.$transaction(async (tx) => {
      const entry = await resolveStoreConversationEntry(tx, {
        publicToken: input.publicToken,
      })
      const loaded = await loadStoreConversationForAccount(tx, {
        accountUserId: input.accountUserId,
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
      return registerPushEndpoint(tx, {
        ...input,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
    }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
  } catch (error) {
    translateNotificationWriteError(error)
  }
}

type PushEndpointPrincipal =
  | {
      accountUserId: string
      guestCredentialId?: never
      guestIdentityId?: never
    }
  | {
      accountUserId?: never
      guestCredentialId: string
      guestIdentityId: string
    }

async function revokePushEndpoint(
  tx: Prisma.TransactionClient,
  input: {
    clientOperationId: string
    conversationId: string
    endpointId: string
    payloadHash: string
    principal: PushEndpointPrincipal
    principalKey: string
    storeId: string
    tenantId: string
  },
) {
  const replay = await tx.storeConversationNotificationCommand.findUnique({
    where: {
      principalKey_clientOperationId: {
        clientOperationId: input.clientOperationId,
        principalKey: input.principalKey,
      },
    },
  })
  if (replay) {
    assertNotificationCommandReplay({
      actualKind: replay.kind,
      actualPayloadHash: replay.payloadHash,
      expectedKind: StoreConversationNotificationCommandKind.PUSH_REVOKED,
      expectedPayloadHash: input.payloadHash,
    })
    return { endpointId: replay.resultId, replayed: true }
  }
  const endpoint = await tx.storeConversationPushEndpoint.findFirst({
    where: {
      accountUserId: input.principal.accountUserId,
      conversationId: input.conversationId,
      guestCredentialId: input.principal.guestCredentialId,
      id: input.endpointId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!endpoint) {
    throw new StoreConversationNotificationError(
      "NOT_FOUND",
      "Push registration is unavailable.",
    )
  }
  await Promise.all([
    tx.storeConversationPushEndpoint.update({
      data: {
        revokedAt: new Date(),
        status: StoreConversationPushEndpointStatus.REVOKED,
      },
      where: { id: endpoint.id },
    }),
    tx.storeConversationNotificationCommand.create({
      data: {
        accountUserId: input.principal.accountUserId,
        clientOperationId: input.clientOperationId,
        conversationId: input.conversationId,
        guestCredentialId: input.principal.guestCredentialId,
        kind: StoreConversationNotificationCommandKind.PUSH_REVOKED,
        payloadHash: input.payloadHash,
        principalKey: input.principalKey,
        resultId: endpoint.id,
      },
    }),
    tx.storeConversationNotificationAuditEvent.create({
      data: {
        actorAccountUserId: input.principal.accountUserId,
        actorGuestIdentityId: input.principal.guestIdentityId,
        conversationId: input.conversationId,
        reasonCode: "notification_push_revoked",
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: StoreConversationNotificationAuditType.PUSH_REVOKED,
      },
    }),
  ])
  return { endpointId: endpoint.id, replayed: false }
}

export async function revokeGuestStoreConversationPushEndpoint(
  db: PrismaClient,
  rawInput: {
    clientOperationId: string
    confirmed: true
    conversationId: string
    credentialToken: string
    endpointId: string
    now?: Date
    publicToken: string
  },
  device: GuestDevice = WEB_DEVICE,
) {
  const input = storeConversationPushEndpointRevokeInputSchema.parse({
    clientOperationId: rawInput.clientOperationId,
    confirmed: rawInput.confirmed,
    conversationId: rawInput.conversationId,
    endpointId: rawInput.endpointId,
    publicToken: rawInput.publicToken,
  })
  const payloadHash = notificationPayloadHash(input)
  const now = rawInput.now ?? new Date()
  try {
    return await db.$transaction(async (tx) => {
      const entry = await resolveStoreConversationEntry(tx, {
        publicToken: input.publicToken,
      })
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
      return revokePushEndpoint(tx, {
        clientOperationId: input.clientOperationId,
        conversationId: input.conversationId,
        endpointId: input.endpointId,
        payloadHash,
        principal: {
          guestCredentialId: loaded.credential.id,
          guestIdentityId: loaded.conversation.guestIdentityId,
        },
        principalKey: `guest:${loaded.credential.id}`,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
    }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
  } catch (error) {
    translateNotificationWriteError(error)
  }
}

export async function revokeAccountStoreConversationPushEndpoint(
  db: PrismaClient,
  rawInput: {
    accountUserId: string
    clientOperationId: string
    confirmed: true
    conversationId: string
    endpointId: string
    publicToken: string
  },
) {
  const input = storeConversationPushEndpointRevokeInputSchema.parse({
    clientOperationId: rawInput.clientOperationId,
    confirmed: rawInput.confirmed,
    conversationId: rawInput.conversationId,
    endpointId: rawInput.endpointId,
    publicToken: rawInput.publicToken,
  })
  const principalKey = `account:${rawInput.accountUserId}`
  const payloadHash = notificationPayloadHash(input)
  try {
    return await db.$transaction(async (tx) => {
      const entry = await resolveStoreConversationEntry(tx, {
        publicToken: input.publicToken,
      })
      await loadStoreConversationForAccount(tx, {
        accountUserId: rawInput.accountUserId,
        conversationId: input.conversationId,
        now: new Date(),
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
      return revokePushEndpoint(tx, {
        clientOperationId: input.clientOperationId,
        conversationId: input.conversationId,
        endpointId: input.endpointId,
        payloadHash,
        principal: { accountUserId: rawInput.accountUserId },
        principalKey,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
    }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
  } catch (error) {
    translateNotificationWriteError(error)
  }
}
