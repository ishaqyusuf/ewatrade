import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { appendReleasedQuoteActionMessagesInTransaction } from "./store-conversation-action-release"
import { appendStoreConversationWhatsAppCustomerTextInTransaction } from "./store-conversation-whatsapp-message-repository"
import {
  sendAccountStoreConversationText,
  sendGuestStoreConversationText,
} from "./store-conversations-guest"
import { replyToStoreConversation } from "./store-conversations-staff"

const publicToken = "public-entry-token-that-is-at-least-32-characters"

describe("Store Conversation text ingress", () => {
  test("screens Guest, linked Customer and staff text before any write transaction", async () => {
    let transactions = 0
    const db = {
      user: { findUnique: async () => ({ ageBand: "ADULT" }) },
      storeConversationAccountAccess: {
        findFirst: async () => ({ accountUserId: "account_1" }),
      },
      $transaction: async () => {
        transactions++
        throw new Error("unexpected transaction")
      },
    } as unknown as PrismaClient

    await expect(
      sendGuestStoreConversationText(db, {
        clientOperationId: "guest-screening-operation",
        conversationId: "conversation_1",
        credentialToken: "guest-token",
        publicToken,
        text: "[[qa-reject]]",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    await expect(
      sendAccountStoreConversationText(db, {
        accountUserId: "account_1",
        channel: "web",
        clientOperationId: "account-screening-operation",
        conversationId: "conversation_1",
        publicToken,
        text: "[[qa-review]]",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    await expect(
      replyToStoreConversation(db, {
        actorUserId: "staff_1",
        clientOperationId: "staff-screening-operation",
        conversationId: "conversation_1",
        expectedAssignmentRevision: 0,
        expectedLastMessageSequence: 0,
        storeId: "store_1",
        tenantId: "tenant_1",
        text: "[[qa-reject]]",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    expect(transactions).toBe(0)
  })

  test("screens WhatsApp text after replay check and before a message write", async () => {
    let writes = 0
    const tx = {
      user: { findUnique: async () => ({ ageBand: "ADULT" }) },
      storeConversationAccountAccess: {
        findFirst: async () => ({ accountUserId: "account_1" }),
      },
      $queryRaw: async () => [{ id: "conversation_1" }],
      storeConversationCommandReceipt: { findUnique: async () => null },
      storeConversationMessage: { create: async () => writes++ },
    }
    await expect(
      appendStoreConversationWhatsAppCustomerTextInTransaction(tx as never, {
        auditReasonCode: "whatsapp_bridge_account_message",
        now: new Date("2026-09-28T10:00:00.000Z"),
        providerEventDigest: "digest_1",
        route: {
          conversationId: "conversation_1",
          id: "route_1",
          revision: 1,
          storeId: "store_1",
          tenantId: "tenant_1",
        },
        source: {
          sourceId: "request_1",
          sourceKind: "COMMERCE_INQUIRY" as never,
          sourceRevision: 1,
        },
        text: "[[qa-reject]]",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    expect(writes).toBe(0)
  })

  test("direct WhatsApp text has no sender Terms proof and cannot post", async () => {
    let writes = 0
    const tx = {
      $queryRaw: async () => [{ id: "conversation_1" }],
      storeConversationCommandReceipt: { findUnique: async () => null },
      storeConversationMessage: { create: async () => writes++ },
    }
    await expect(
      appendStoreConversationWhatsAppCustomerTextInTransaction(tx as never, {
        auditReasonCode: "whatsapp_direct_message",
        now: new Date("2026-09-28T10:00:00.000Z"),
        providerEventDigest: "digest_2",
        route: {
          conversationId: "conversation_1",
          id: "route_1",
          revision: 1,
          storeId: "store_1",
          tenantId: "tenant_1",
        },
        source: {
          sourceId: "request_1",
          sourceKind: "COMMERCE_INQUIRY" as never,
          sourceRevision: 1,
        },
        text: "An ordinary direct inbound message",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    expect(writes).toBe(0)
  })

  test("rejects unsafe quote option labels before a chat action message is written", async () => {
    let writes = 0
    const tx = {
      storeConversationRequestLink: {
        findMany: async () => [{ conversationId: "conversation_1" }],
      },
      commerceQuoteVersion: {
        findFirst: async () => ({
          id: "quote_version_1",
          status: "ISSUED",
          currencyCode: "NGN",
          version: 1,
          options: [
            {
              id: "option_1",
              currencyCode: "NGN",
              label: "[[qa-reject]]",
              position: 1,
              totalMinor: 100,
            },
          ],
          quote: { currentVersionId: "quote_version_1" },
        }),
      },
      storeConversationMessage: { create: async () => writes++ },
    }
    await expect(
      appendReleasedQuoteActionMessagesInTransaction(
        tx as never,
        {
          actorUserId: "staff_1",
          quoteVersionId: "quote_version_1",
          source: { id: "request_1", kind: "COMMERCE_INQUIRY" as never },
          storeId: "store_1",
          tenantId: "tenant_1",
        },
        null,
      ),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    expect(writes).toBe(0)
  })
})
