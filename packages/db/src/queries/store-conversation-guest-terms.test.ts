import { describe, expect, it } from "bun:test"

import { StoreConversationGuestCredentialPurpose } from "../../generated/prisma/enums"
import {
  acceptGuestStoreConversationTerms,
  assertGuestStoreConversationTermsAccepted,
} from "./store-conversation-guest-terms"

describe("Guest Store Conversation Terms gate", () => {
  it("rejects posting while the current legal publication is draft without touching storage", async () => {
    const db = {
      storeConversationGuestLegalAcceptance: {
        findUnique: () => {
          throw new Error("draft Terms must not query an acceptance")
        },
      },
    }
    await expect(
      assertGuestStoreConversationTermsAccepted(db as never, "guest-1"),
    ).rejects.toMatchObject({ code: "NOT_READY" })
  })

  it("does not record a draft acceptance even when a Guest asks to agree", async () => {
    const db = {
      $transaction: () => {
        throw new Error("draft Terms must not start a write")
      },
    }
    await expect(
      acceptGuestStoreConversationTerms(db as never, {
        acceptedTerms: true,
        credentialToken: "guest-token",
        purpose: StoreConversationGuestCredentialPurpose.WEB_DEVICE,
        version: "2026-09-27-candidate-2",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
  })

  it("rejects an acceptance for changed Terms text under the same version", async () => {
    const db = {
      storeConversationGuestLegalAcceptance: {
        findUnique: async () => ({ documentHash: "b".repeat(64) }),
      },
    }
    await expect(
      assertGuestStoreConversationTermsAccepted(db as never, "guest-1", {
        documentHash: "a".repeat(64),
        effectiveDate: "2026-09-28",
        version: "test-approved-terms",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
  })

  it("records one exact Guest acceptance and returns the same receipt on retry", async () => {
    const publication = {
      documentHash: "a".repeat(64),
      effectiveDate: "2026-09-28",
      version: "test-approved-terms",
    }
    const acceptedAt = new Date("2026-09-28T10:00:00.000Z")
    let stored: { acceptedAt: Date; documentHash: string } | null = null
    let inserts = 0
    const tx = {
      storeConversationGuestCredential: {
        findFirst: async () => ({
          guestIdentity: { id: "guest-1", status: "ACTIVE" },
          guestIdentityId: "guest-1",
        }),
      },
      storeConversationGuestLegalAcceptance: {
        findUnique: async () => stored,
        upsert: async ({ create }: { create: { documentHash: string } }) => {
          inserts += 1
          stored = { acceptedAt, documentHash: create.documentHash }
          return stored
        },
      },
    }
    const db = {
      $transaction: async (run: (value: typeof tx) => unknown) => run(tx),
    }
    const input = {
      acceptedTerms: true as const,
      credentialToken: "credential-token",
      purpose: StoreConversationGuestCredentialPurpose.WEB_DEVICE,
      version: publication.version,
    }
    const first = await acceptGuestStoreConversationTerms(
      db as never,
      input,
      publication,
    )
    const retry = await acceptGuestStoreConversationTerms(
      db as never,
      input,
      publication,
    )
    expect(first).toEqual(retry)
    expect(first).toMatchObject({ accepted: true, acceptedAt })
    expect(inserts).toBe(1)
  })
})
