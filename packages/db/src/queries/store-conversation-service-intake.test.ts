import { describe, expect, it } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { submitStoreConversationServiceRequest } from "./store-conversation-service-intake"

const input = {
  conversationId: "conversation_1",
  credentialToken: "guest-token",
  customerName: "Customer",
  details: "A service request",
  lines: [{ offeringId: "offering_1", quantity: "1" }],
  messageId: "message_1",
  publicToken: "public-entry-token-that-is-at-least-32-characters",
}

describe("Store Conversation Service intake safety", () => {
  it.each([
    { ...input, customerName: "[[qa-reject]]" },
    { ...input, details: "[[qa-review]]" },
  ])(
    "rejects unsafe customer content before a request can be saved",
    async (unsafeInput) => {
      let transactions = 0
      const db = {
        $transaction: () => {
          transactions++
          throw new Error("request must not be written")
        },
      } as unknown as PrismaClient

      await expect(
        submitStoreConversationServiceRequest(db, unsafeInput),
      ).rejects.toMatchObject({ code: "NOT_READY" })
      expect(transactions).toBe(0)
    },
  )

  it("rejects draft Terms before writing a Store-visible request", async () => {
    let writes = 0
    const tx = {
      storeConversationGuestCredential: {
        findFirst: async () => ({
          guestIdentity: { id: "guest_1", status: "ACTIVE" },
          guestIdentityId: "guest_1",
        }),
      },
      customerEntryPoint: {
        findFirst: () => {
          throw new Error("entry lookup must follow exact Terms")
        },
      },
    }
    const db = {
      $transaction: async (run: (value: typeof tx) => unknown) => run(tx),
      serviceRequest: { create: () => writes++ },
    } as unknown as PrismaClient

    await expect(
      submitStoreConversationServiceRequest(db, input),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    expect(writes).toBe(0)
  })
})
