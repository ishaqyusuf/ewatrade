import { describe, expect, test } from "bun:test"

import { createCallerFactory } from "../../init"
import { serviceCommerceCustomerConversationsRouter } from "./customer-conversations"

const createCaller = createCallerFactory(
  serviceCommerceCustomerConversationsRouter,
)
const publicToken = "public-token-123456789012345678901234"
const transferToken = "transfer-token-1234567890123456789012"
const bridgeToken = "b".repeat(43)

function caller(input?: {
  credential?: string
  db?: unknown
  installation?: string
  session?: unknown
}) {
  return createCaller({
    customerConversationCredential: input?.credential ?? null,
    customerConversationInstallation: input?.installation ?? null,
    db: input?.db ?? {},
    session: input?.session ?? null,
  } as never)
}

describe("mobile customer conversation transport", () => {
  test("keeps WhatsApp bridge issuance behind the exact Customer principal", async () => {
    const input = {
      bridgeToken,
      clientOperationId: "bridge-operation-0001",
      conversationId: "conversation_1",
      publicToken,
    }

    await expect(
      caller().mobileIssueStoreConversationWhatsAppBridge(input),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      caller({
        credential: "c".repeat(32),
      }).mobileIssueStoreConversationWhatsAppBridge(input),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    await expect(
      caller().accountIssueStoreConversationWhatsAppBridge(input),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("uses an authenticated Customer Account without requiring a Tenant membership", async () => {
    const db = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(db),
      storeConversationAccountAccess: { findMany: async () => [] },
      user: { findUnique: async () => ({ id: "customer_account_1" }) },
    }

    await expect(
      caller({
        db,
        session: { user: { id: "customer_account_1" } },
      }).accountStoreConversations({}),
    ).resolves.toEqual({ items: [], nextCursor: null })
  })

  test("does not enumerate guest conversations from authentication alone", async () => {
    await expect(
      caller({
        session: { user: { id: "customer_account_1" } },
      }).mobileStoreConversationAccountCandidates({}),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("does not accept a Business session as a customer credential", async () => {
    await expect(
      caller({
        session: { user: { id: "business_user" } },
      }).mobileStoreConversations({}),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("requires the installation proof before claiming a transfer", async () => {
    await expect(
      caller().claimStoreConversationTransfer({ publicToken, transferToken }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  test("rejects malformed customer header capabilities before a DB read", async () => {
    await expect(
      caller({ credential: "short" }).mobileStoreConversationTimeline({
        conversationId: "conversation_1",
        publicToken,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("requires both Customer credential and installation for realtime progress", async () => {
    await expect(
      caller({
        credential: "c".repeat(32),
      }).mobileStoreConversationMessagesAfter({
        afterSequence: 3,
        conversationId: "conversation_1",
        publicToken,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })

    await expect(
      caller({
        installation: "i".repeat(32),
      }).acknowledgeMobileStoreConversationProgress({
        clientOperationId: "read-acknowledgement-0001",
        conversationId: "conversation_1",
        deliveredThroughSequence: 4,
        publicToken,
        readThroughSequence: 4,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })
})
