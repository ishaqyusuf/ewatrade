import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationMessageAuthorKind,
  StoreConversationMessageChannel,
  StoreConversationMessageKind,
} from "../../generated/prisma/enums"
import {
  bootstrapWebStoreConversation,
  sendGuestStoreConversationText,
} from "./store-conversations"
import { projectStoreConversationMessage } from "./store-conversations-core"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

const publicToken = "public-entry-token-that-is-at-least-32-characters"

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
              storeId: "store-1",
              tenantId: "tenant-1",
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

describe("Store Conversation repositories", () => {
  test("projects Store replies under the Store identity, never a staff legal name", () => {
    const projection = projectStoreConversationMessage({
      authorKind: StoreConversationMessageAuthorKind.STORE_ATTENDANT,
      body: "Your quotation is ready",
      channel: StoreConversationMessageChannel.WEB,
      id: "message_1",
      kind: StoreConversationMessageKind.STORE_TEXT,
      occurredAt: new Date("2026-08-12T10:00:00.000Z"),
      sequence: 2,
    })
    expect(projection.author).toEqual({
      kind: "store_attendant",
      label: "Store",
    })
    expect(JSON.stringify(projection)).not.toContain("Ada")
  })

  test("stores only a guest credential digest and resumes one Store conversation", async () => {
    const writes: Array<{ name: string; value: Record<string, unknown> }> = []
    const credentialRows = new Map<string, Record<string, unknown>>()
    let conversation: Record<string, unknown> | null = null
    const client = {
      ...publicEntryDependencies(),
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: {
        findFirst: async () => conversation,
        upsert: async (args: { create: Record<string, unknown> }) => {
          conversation ??= {
            ...args.create,
            assignmentRevision: 0,
            id: "conversation_1",
            lastMessageSequence: 0,
            lifecycle: "ACTIVE",
            moderationState: "OPEN",
          }
          return conversation
        },
      },
      storeConversationAuditEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          writes.push({ name: "audit", value: args.data })
          return { id: "audit_1" }
        },
        findFirst: async () =>
          writes.some((write) => write.name === "audit")
            ? { id: "audit_1" }
            : null,
      },
      storeConversationGuestCredential: {
        create: async (args: { data: Record<string, unknown> }) => {
          const row = {
            ...args.data,
            expiresAt: args.data.expiresAt,
            guestIdentity: { id: "guest_1", status: "ACTIVE" },
            guestIdentityId: "guest_1",
            id: "credential_1",
          }
          credentialRows.set(String(args.data.tokenDigest), row)
          writes.push({ name: "credential", value: args.data })
          return row
        },
        findFirst: async (args: { where: { tokenDigest: string } }) =>
          credentialRows.get(args.where.tokenDigest) ?? null,
        update: async (args: { data: Record<string, unknown> }) => {
          writes.push({ name: "credential.update", value: args.data })
          return { id: "credential_1" }
        },
      },
      storeConversationGuestIdentity: {
        create: async () => ({ id: "guest_1" }),
        update: async () => ({ id: "guest_1" }),
      },
    }

    const created = await bootstrapWebStoreConversation(dbClient(client), {
      publicToken,
    })
    expect(created.credentialToken).toBeString()
    expect(created.conversation.id).toBe("conversation_1")
    const credentialWrite = writes.find((write) => write.name === "credential")
    expect(credentialWrite?.value).not.toHaveProperty("token")
    expect(credentialWrite?.value.tokenDigest).toBe(
      createHash("sha256")
        .update(created.credentialToken as string)
        .digest("hex"),
    )

    const resumed = await bootstrapWebStoreConversation(dbClient(client), {
      credentialToken: created.credentialToken,
      publicToken,
    })
    expect(resumed).toMatchObject({
      conversation: { id: "conversation_1" },
      credentialToken: null,
    })
    expect(writes.filter((write) => write.name === "audit")).toHaveLength(1)
    expect(
      writes.find((write) => write.name === "credential.update")?.value,
    ).toMatchObject({
      expiresAt: expect.any(Date),
      lastUsedAt: expect.any(Date),
    })
  })

  test("creates one typed Commerce Inquiry and message under exact replay", async () => {
    const credentialToken = "guest-secret"
    const messageRows: Record<string, unknown>[] = []
    const requestLinks: Record<string, unknown>[] = []
    let inquiryCreateCount = 0
    const receipts = new Map<string, Record<string, unknown>>()
    const conversation = {
      assignmentRevision: 0,
      guestIdentityId: "guest_1",
      id: "conversation_1",
      lastMessageSequence: 0,
      lifecycle: "ACTIVE",
      moderationState: "OPEN",
      store: { name: "Ada Bags" },
      storeId: "store-1",
      tenantId: "tenant-1",
    }
    const client = {
      ...publicEntryDependencies(),
      $queryRaw: async () => [{ id: conversation.id }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      commerceInquiry: {
        findFirst: async () => null,
        upsert: async (args: {
          create: {
            lines: { create: Array<Record<string, unknown>> }
            payloadHash: string
          }
        }) => {
          inquiryCreateCount += 1
          return {
            id: "inquiry_1",
            lines: args.create.lines.create.map((line, index) => ({
              ...line,
              id: `line_${index + 1}`,
            })),
            payloadHash: args.create.payloadHash,
            status: "RECEIVED",
            storeId: "store-1",
            vertical: "SERVICE",
          }
        },
      },
      commerceInquiryAuditEvent: {
        create: async () => ({ id: "inquiry_audit_1" }),
        findFirst: async () => null,
      },
      store: {
        findFirst: async () => ({
          countryCode: "NG",
          serviceCommerceProfile: {
            intakeEnabled: true,
            staffEnabled: false,
            status: "ACTIVE",
            webEnabled: true,
            whatsappEnabled: false,
          },
        }),
      },
      storeConversation: {
        findFirst: async () => conversation,
        update: async (args: { data: { lastMessageSequence: number } }) => {
          conversation.lastMessageSequence = args.data.lastMessageSequence
          return conversation
        },
      },
      storeConversationAuditEvent: {
        create: async () => ({ id: "conversation_audit_1" }),
      },
      storeConversationCommandReceipt: {
        create: async (args: { data: Record<string, unknown> }) => {
          const receipt = {
            ...args.data,
            message: messageRows.at(-1),
          }
          receipts.set(String(args.data.clientOperationId), receipt)
          return receipt
        },
        findFirst: async (args: {
          where: { clientOperationId: string }
        }) => receipts.get(args.where.clientOperationId) ?? null,
      },
      storeConversationGuestCredential: {
        findFirst: async () => ({
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
          guestIdentity: { id: "guest_1", status: "ACTIVE" },
          guestIdentityId: "guest_1",
          id: "credential_1",
          tokenDigest: createHash("sha256")
            .update(credentialToken)
            .digest("hex"),
        }),
        update: async () => ({ id: "credential_1" }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "guest_1" }),
      },
      storeConversationMessage: {
        create: async (args: { data: Record<string, unknown> }) => {
          const message = { id: "message_1", ...args.data }
          messageRows.push(message)
          return message
        },
      },
      storeConversationRequestLink: {
        create: async (args: { data: Record<string, unknown> }) => {
          requestLinks.push(args.data)
          return { id: `link_${requestLinks.length}`, ...args.data }
        },
        findFirst: async () =>
          requestLinks[0] ? { ...requestLinks[0], sourceRevision: 1 } : null,
      },
    }
    const input = {
      clientOperationId: "operation-0001",
      conversationId: conversation.id,
      credentialToken,
      publicToken,
      text: "I need a small red bag",
    }

    const first = await sendGuestStoreConversationText(dbClient(client), input)
    const replay = await sendGuestStoreConversationText(dbClient(client), input)

    expect(first).toMatchObject({
      message: { sequence: 1, text: input.text },
      replayed: false,
      source: { id: "inquiry_1", kind: "commerce_inquiry" },
    })
    expect(replay).toMatchObject({
      message: { id: "message_1" },
      replayed: true,
      source: { id: "inquiry_1", kind: "commerce_inquiry" },
    })
    expect(messageRows).toHaveLength(1)
    expect(inquiryCreateCount).toBe(1)

    const followUp = await sendGuestStoreConversationText(dbClient(client), {
      ...input,
      clientOperationId: "operation-0002",
      text: "Please make it leather",
    })
    expect(followUp).toMatchObject({
      message: {
        request: { id: "inquiry_1", kind: "commerce_inquiry" },
        sequence: 2,
      },
      source: { id: "inquiry_1" },
    })
    expect(inquiryCreateCount).toBe(1)
  })

  test("rejects an expired guest credential before any message write", async () => {
    let wroteMessage = false
    const client = {
      ...publicEntryDependencies(),
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversationGuestCredential: { findFirst: async () => null },
      storeConversationMessage: {
        create: async () => {
          wroteMessage = true
        },
      },
    }
    await expect(
      sendGuestStoreConversationText(dbClient(client), {
        clientOperationId: "operation-0002",
        conversationId: "conversation_1",
        credentialToken: "expired",
        publicToken,
        text: "Red bag",
      }),
    ).rejects.toMatchObject({ code: "GUEST_CREDENTIAL_EXPIRED" })
    expect(wroteMessage).toBe(false)
  })

  test("translates a revoked Store entry into bounded public recovery", async () => {
    const dependencies = publicEntryDependencies()
    const client = {
      ...dependencies,
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      customerEntryPoint: { findFirst: async () => null },
    }
    await expect(
      bootstrapWebStoreConversation(dbClient(client), { publicToken }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: expect.stringContaining("Store link"),
    })
  })
})
