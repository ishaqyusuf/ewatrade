import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { assertAccountStoreConversationTermsAccepted } from "./store-conversation-account-terms"

const publication = {
  version: "approved-v1",
  documentHash: "a".repeat(64),
  effectiveDate: "2026-10-01",
}

function fakeDb(documentHash: string | null) {
  const reads: unknown[] = []
  const db = {
    legalAcceptance: {
      findUnique: async (input: unknown) => {
        reads.push(input)
        return documentHash ? { documentHash } : null
      },
    },
  } as unknown as PrismaClient
  return { db, reads }
}

test("account and Store staff posting pauses when Terms are not effective", async () => {
  const { db, reads } = fakeDb(null)
  await expect(
    assertAccountStoreConversationTermsAccepted(db, "user-1", null),
  ).rejects.toThrow("Messaging is paused")
  expect(reads).toHaveLength(0)
})

test("pre-effective and stale account sessions cannot post without exact approval acceptance", async () => {
  for (const hash of [null, "b".repeat(64)]) {
    const { db, reads } = fakeDb(hash)
    await expect(
      assertAccountStoreConversationTermsAccepted(db, "user-1", publication),
    ).rejects.toThrow("Review and accept")
    expect(reads).toEqual([
      {
        where: {
          userId_version: { userId: "user-1", version: "approved-v1" },
        },
        select: { documentHash: true },
      },
    ])
  }
})

test("exact current version and digest permit account and Store staff posting", async () => {
  const { db } = fakeDb("a".repeat(64))
  await expect(
    assertAccountStoreConversationTermsAccepted(db, "user-1", publication),
  ).resolves.toBeUndefined()
})

test("explicit local and preview profiles skip Terms reads, including built preview", async () => {
  const { db, reads } = fakeDb(null)
  for (const env of [
    { DEV_PROFILE: "local" },
    { APP_ENV: "preview", NODE_ENV: "production" },
  ]) {
    await expect(
      assertAccountStoreConversationTermsAccepted(db, "user-1", null, env),
    ).resolves.toBeUndefined()
    await expect(
      assertAccountStoreConversationTermsAccepted(
        db,
        "user-1",
        publication,
        env,
      ),
    ).resolves.toBeUndefined()
  }
  expect(reads).toHaveLength(0)
  await expect(
    assertAccountStoreConversationTermsAccepted(db, "user-1", null, {
      APP_ENV: "production",
    }),
  ).rejects.toThrow("Messaging is paused")
  await expect(
    assertAccountStoreConversationTermsAccepted(db, "user-1", publication, {
      APP_ENV: "production",
    }),
  ).rejects.toThrow("Review and accept")
})
