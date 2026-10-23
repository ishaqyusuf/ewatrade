import { describe, expect, it } from "bun:test"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type { PrismaClient } from "../../generated/prisma/client"
import { startStoreConversationServiceRequest } from "./store-conversation-service-start"

const input = {
  clientOperationId: "structured-start-1",
  conversationId: "conversation_1",
  credentialToken: "guest-token",
  publicToken: "public-entry-token-that-is-at-least-32-characters",
  customerName: "Amina Demo",
  customerEmail: "amina@ishaq.qa.test",
  lines: [{ offeringId: "offering_1", quantity: "2" }],
}

describe("structured service intake before free-form chat", () => {
  it("requires exactly one server-established customer authority", async () => {
    const db = {} as PrismaClient
    await expect(
      startStoreConversationServiceRequest(db, {
        ...input,
        credentialToken: undefined,
      }),
    ).rejects.toThrow("Exactly one customer authority required")
    await expect(
      startStoreConversationServiceRequest(db, {
        ...input,
        accountUserId: "account-1",
      }),
    ).rejects.toThrow("Exactly one customer authority required")
  })
  it("screens customer details before any transaction", async () => {
    let transactions = 0
    const db = {
      $transaction: () => {
        transactions++
        throw Error("unexpected write")
      },
    } as unknown as PrismaClient
    await expect(
      startStoreConversationServiceRequest(db, {
        ...input,
        details: "[[qa-reject]]",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    expect(transactions).toBe(0)
  })

  it.each(["missing_terms", "undeclared_age"])(
    "does not create a request with %s",
    async (failure) => {
      const publication = currentEffectiveLegalPublication()
      expect(publication).not.toBeNull()
      let entryLookups = 0
      const tx = {
        storeConversationGuestCredential: {
          findFirst: async () => ({
            guestIdentityId: "guest_1",
            guestIdentity: { id: "guest_1", status: "ACTIVE" },
          }),
        },
        storeConversationGuestLegalAcceptance: {
          findUnique: async () =>
            failure === "missing_terms"
              ? null
              : { documentHash: publication?.documentHash },
        },
        storeConversationGuestIdentity: {
          findUnique: async () => ({ ageBand: "UNDECLARED" }),
        },
        customerEntryPoint: {
          findFirst: () => {
            entryLookups++
            throw Error("request authority must fail before entry lookup")
          },
        },
      }
      const db = {
        $transaction: async (run: (tx: unknown) => unknown) => run(tx),
      } as unknown as PrismaClient
      await expect(
        startStoreConversationServiceRequest(db, input),
      ).rejects.toMatchObject({ code: "NOT_READY" })
      expect(entryLookups).toBe(0)
    },
  )

  it("rejects empty quantities and missing contact rather than creating an empty request", async () => {
    const db = {} as PrismaClient
    await expect(
      startStoreConversationServiceRequest(db, { ...input, lines: [] }),
    ).rejects.toThrow()
    await expect(
      startStoreConversationServiceRequest(db, {
        ...input,
        customerEmail: undefined,
      }),
    ).rejects.toThrow()
  })
})
