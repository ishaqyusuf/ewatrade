import { describe, expect, test } from "bun:test"

import { createCallerFactory } from "../../init"
import { serviceCommerceCustomerConversationsRouter } from "./customer-conversations"

const createCaller = createCallerFactory(
  serviceCommerceCustomerConversationsRouter,
)
const publicToken = "public-token-123456789012345678901234"
const transferToken = "transfer-token-1234567890123456789012"

function caller(input?: {
  credential?: string
  installation?: string
  session?: unknown
}) {
  return createCaller({
    customerConversationCredential: input?.credential ?? null,
    customerConversationInstallation: input?.installation ?? null,
    db: {},
    session: input?.session ?? null,
  } as never)
}

describe("mobile customer conversation transport", () => {
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
})
