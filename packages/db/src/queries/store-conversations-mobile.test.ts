import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  bootstrapMobileStoreConversation,
  claimMobileStoreConversationTransfer,
  listMobileStoreConversations,
  redeemMobileStoreConversationTransfer,
} from "./store-conversations-mobile"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

const publicToken = "public-entry-token-that-is-at-least-32-characters"
const installationToken = "installation-token-that-is-at-least-32-chars"
const credentialToken = "mobile-credential-token-that-is-at-least-32"
const transferToken = "transfer-token-that-is-at-least-32-characters"

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function publicEntryDependencies() {
  return {
    customerEntryPoint: {
      findFirst: async (args: { where: { id?: string } }) =>
        args.where.id
          ? { id: "entry_1" }
          : {
              id: "entry_1",
              revision: 3,
              store: { name: "Ada Bags" },
              storeId: "store_1",
              tenantId: "tenant_1",
            },
    },
    serviceCommercePolicyAuditEvent: {
      createMany: async () => ({ count: 8 }),
    },
    serviceCommercePolicyDecision: {
      findMany: async () => allowedServiceCommercePolicyDecisionRows(),
    },
    serviceCommerceStoreProfile: {
      findFirst: async () => ({
        intakeEnabled: true,
        status: "ACTIVE",
        webEnabled: true,
        whatsappEnabled: false,
      }),
    },
    serviceCommerceStoreTeamAssignment: {
      findFirst: async () => ({ id: "assignment_1" }),
    },
    store: { findFirst: async () => ({ countryCode: "NG" }) },
    whatsAppStoreBinding: { findMany: async () => [] },
  }
}

function activeMobileCredential() {
  return {
    deviceBindingDigest: digest(installationToken),
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    guestIdentity: { id: "mobile_guest", status: "ACTIVE" },
    guestIdentityId: "mobile_guest",
    id: "mobile_credential",
    purpose: "MOBILE_DEVICE",
    status: "ACTIVE",
    tokenDigest: digest(credentialToken),
  }
}

describe("Mobile Store Conversation repositories", () => {
  test("mobile bootstrap resumes transferred Store access instead of creating a duplicate", async () => {
    let conversationCreated = false
    let accessTouched = false
    const transferredConversation = {
      guestIdentityId: "web_guest",
      id: "conversation_1",
      lastMessageSequence: 2,
      lifecycle: "ACTIVE",
      moderationState: "OPEN",
      storeId: "store_1",
      tenantId: "tenant_1",
    }
    const client = {
      ...publicEntryDependencies(),
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: {
        findFirst: async () => null,
        upsert: async () => {
          conversationCreated = true
          return transferredConversation
        },
      },
      storeConversationGuestAccess: {
        findFirst: async () => ({
          conversation: transferredConversation,
          id: "access_1",
        }),
        upsert: async () => {
          accessTouched = true
          return { id: "access_1" }
        },
      },
      storeConversationMessage: { count: async () => 0 },
      storeConversationGuestCredential: {
        findFirst: async () => activeMobileCredential(),
        update: async () => ({ id: "mobile_credential" }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "mobile_guest" }),
      },
    }

    const result = await bootstrapMobileStoreConversation(dbClient(client), {
      credentialToken,
      installationToken,
      publicToken,
    })

    expect(result.conversation.id).toBe("conversation_1")
    expect(conversationCreated).toBe(false)
    expect(accessTouched).toBe(true)
  })

  test("lists latest safe message and uses activity plus id for deterministic pagination", async () => {
    let findManyArgs: Record<string, unknown> | undefined
    const firstActivity = new Date("2026-08-12T12:00:00.000Z")
    const secondActivity = new Date("2026-08-12T11:00:00.000Z")
    const access = (id: string, lastActivityAt: Date, text: string) => ({
      conversation: {
        id: `conversation_${id}`,
        lastActivityAt,
        lastMessageSequence: 2,
        lastStoreReplySequence: 2,
        lifecycle: "ACTIVE",
        messages: [{ authorKind: "STORE_ATTENDANT", body: text }],
        moderationState: "OPEN",
        store: {
          customerEntryPoint: { publicToken, status: "PUBLISHED" },
          name: "Ada Bags",
        },
      },
      id,
      lastOpenedAt: new Date("2026-08-10T00:00:00.000Z"),
    })
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversationGuestAccess: {
        findMany: async (args: Record<string, unknown>) => {
          findManyArgs = args
          return [
            access("access_2", firstActivity, "Your quotation is ready"),
            access("access_1", secondActivity, "Older reply"),
          ]
        },
      },
      storeConversationGuestCredential: {
        findFirst: async () => activeMobileCredential(),
        update: async (args: { data: { expiresAt: Date } }) => ({
          expiresAt: args.data.expiresAt,
        }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "mobile_guest" }),
      },
      storeConversationCustomerWatermark: {
        findMany: async () => [
          { conversationId: "conversation_access_2", readThroughSequence: 2 },
        ],
      },
      storeConversationMessage: { count: async () => 0 },
    }

    const result = await listMobileStoreConversations(dbClient(client), {
      credentialToken,
      installationToken,
      pageSize: 1,
    })

    expect(findManyArgs?.orderBy).toEqual([
      { conversation: { lastActivityAt: "desc" } },
      { id: "desc" },
    ])
    expect(result.items).toEqual([
      expect.objectContaining({
        lastMessage: { author: "store", text: "Your quotation is ready" },
        unreadStoreMessages: 0,
        storeAvatar: { kind: "initials", label: "AB" },
      }),
    ])
    expect(result.nextCursor).toBeString()
    expect(result.credentialExpiresAt).toBeInstanceOf(Date)
  })

  test("claim is retryable only by the first installation and redeem consumes once", async () => {
    let status = "PENDING"
    let claimedInstallationDigest: string | null = null
    const grantGuestIdentityIds: string[] = []
    let redeemedCredentialId: string | null = null
    let redeemedGuestIdentityId: string | null = null
    const sourceCredential = {
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      guestIdentity: { status: "ACTIVE" },
      purpose: "WEB_DEVICE",
      status: "ACTIVE",
    }
    const client = {
      ...publicEntryDependencies(),
      $queryRaw: async () => [{ id: "transfer_1" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: {
        findFirst: async () => ({
          id: "conversation_1",
          lifecycle: "ACTIVE",
          moderationState: "OPEN",
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      storeConversationAuditEvent: { create: async () => ({ id: "audit_1" }) },
      storeConversationGuestAccess: {
        upsert: async (args: { create: { guestIdentityId: string } }) => {
          grantGuestIdentityIds.push(args.create.guestIdentityId)
          return { id: "access_1" }
        },
      },
      storeConversationGuestCredential: {
        create: async () => ({
          ...activeMobileCredential(),
          guestIdentity: { id: "different_guest", status: "ACTIVE" },
          guestIdentityId: "different_guest",
          id: "different_credential",
        }),
        findFirst: async (args: { where: { tokenDigest: string } }) =>
          args.where.tokenDigest === digest(credentialToken)
            ? activeMobileCredential()
            : null,
        update: async () => ({ id: "mobile_credential" }),
      },
      storeConversationGuestIdentity: {
        create: async () => ({ id: "different_guest" }),
        update: async () => ({ id: "mobile_guest" }),
      },
      storeConversationTransfer: {
        findFirst: async (args: { include?: unknown }) =>
          args.include
            ? {
                claimedInstallationDigest,
                conversationId: "conversation_1",
                expiresAt: new Date("2030-01-01T00:00:00.000Z"),
                id: "transfer_1",
                redeemedCredentialId,
                redeemedGuestIdentityId,
                sourceCredential,
                status,
                storeId: "store_1",
                tenantId: "tenant_1",
              }
            : { id: "transfer_1" },
        update: async (args: {
          data: {
            claimedInstallationDigest?: string
            redeemedCredentialId?: string
            redeemedGuestIdentityId?: string
            status: string
          }
        }) => {
          status = args.data.status
          claimedInstallationDigest =
            args.data.claimedInstallationDigest ?? claimedInstallationDigest
          redeemedCredentialId =
            args.data.redeemedCredentialId ?? redeemedCredentialId
          redeemedGuestIdentityId =
            args.data.redeemedGuestIdentityId ?? redeemedGuestIdentityId
          return { id: "transfer_1" }
        },
      },
    }

    const claimInput = { installationToken, publicToken, transferToken }
    expect(
      await claimMobileStoreConversationTransfer(dbClient(client), claimInput),
    ).toMatchObject({ state: "claimed" })
    expect(
      await claimMobileStoreConversationTransfer(dbClient(client), claimInput),
    ).toMatchObject({ state: "claimed" })
    await expect(
      claimMobileStoreConversationTransfer(dbClient(client), {
        ...claimInput,
        installationToken: "different-installation-token-that-is-long-enough",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    const redeemed = await redeemMobileStoreConversationTransfer(
      dbClient(client),
      { ...claimInput, targetCredentialToken: credentialToken },
    )
    expect(redeemed).toMatchObject({
      conversation: { id: "conversation_1" },
      credentialToken,
      replayed: false,
      state: "redeemed",
    })
    expect(grantGuestIdentityIds).toEqual(["mobile_guest"])
    sourceCredential.status = "REVOKED"
    expect(
      await claimMobileStoreConversationTransfer(dbClient(client), claimInput),
    ).toMatchObject({ state: "claimed" })
    const lostResponseReplay = await redeemMobileStoreConversationTransfer(
      dbClient(client),
      {
        ...claimInput,
        targetCredentialToken: credentialToken,
      },
    )
    expect(lostResponseReplay).toMatchObject({
      replayed: true,
      state: "redeemed",
    })
    await expect(
      redeemMobileStoreConversationTransfer(dbClient(client), {
        ...claimInput,
        targetCredentialToken: "different-target-credential-token-long-enough",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})
