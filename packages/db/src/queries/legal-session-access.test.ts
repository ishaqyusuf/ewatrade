import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { isLegalSignupSessionBlockedForPublication } from "./legal-session-access"

const publication = {
  version: "approved-v1",
  documentHash: "a".repeat(64),
  effectiveDate: "2026-10-01",
}

function fakeDb(createdAt: Date | null, documentHash: string | null) {
  let acceptanceReads = 0
  const db = {
    user: {
      findUnique: async () => (createdAt ? { createdAt } : null),
    },
    legalAcceptance: {
      findUnique: async () => {
        acceptanceReads += 1
        return documentHash ? { documentHash } : null
      },
    },
  } as unknown as PrismaClient
  return { db, acceptanceReads: () => acceptanceReads }
}

test("existing pre-publication account can create a session without new acceptance", async () => {
  const { db, acceptanceReads } = fakeDb(
    new Date("2026-09-30T23:59:59.999Z"),
    null,
  )
  expect(
    await isLegalSignupSessionBlockedForPublication(db, "user-1", publication),
  ).toBe(false)
  expect(acceptanceReads()).toBe(0)
})

test("new account without exact approval acceptance cannot create a session", async () => {
  const createdAt = new Date("2026-10-01T00:00:00.000Z")
  for (const documentHash of [null, "b".repeat(64)]) {
    const { db } = fakeDb(createdAt, documentHash)
    expect(
      await isLegalSignupSessionBlockedForPublication(
        db,
        "user-1",
        publication,
      ),
    ).toBe(true)
  }
})

test("new account with exact approval acceptance can create a session", async () => {
  const { db } = fakeDb(new Date("2026-10-02T00:00:00.000Z"), "a".repeat(64))
  expect(
    await isLegalSignupSessionBlockedForPublication(db, "user-1", publication),
  ).toBe(false)
})

test("missing user cannot create a session", async () => {
  const { db } = fakeDb(null, null)
  expect(
    await isLegalSignupSessionBlockedForPublication(db, "missing", publication),
  ).toBe(true)
})
