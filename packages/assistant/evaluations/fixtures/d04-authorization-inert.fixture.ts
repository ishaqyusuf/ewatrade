import { expect, test } from "bun:test"
import {
  revalidateQaClientAuthorization,
  validateQaDerivedSession,
} from "../../../db/src/queries/qa-access"

// Only in-memory delegates are supplied to the actual canonical helpers. No
// Prisma singleton, profile loader, environment secret or connected client.
function fixture() {
  const grant = {
    status: "ACTIVE",
    revokedAt: null,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    qaDomain: "inert.example.test",
    testerIdentity: "synthetic-auditor",
  }
  const authorization = {
    id: "inert-authorization",
    status: "ACTIVE",
    revokedAt: null,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    lastValidatedAt: new Date("2000-01-01T00:00:00.000Z"),
    grant,
  }
  const writes: Array<{
    data: { lastValidatedAt: Date }
    where: { id: string }
  }> = []
  const sessionDeletes: unknown[] = []
  const db = {
    qaClientAuthorization: {
      findUnique: async () => authorization,
      update: async (input: (typeof writes)[number]) => {
        writes.push(input)
        authorization.lastValidatedAt = input.data.lastValidatedAt
        return authorization
      },
    },
    session: {
      findUnique: async () => ({
        id: "inert-session",
        qaAuthorizationId: authorization.id,
        qaAuthorization: authorization,
        qaMembershipId: "inert-membership",
        qaTenantId: "inert-business",
        qaStoreId: "inert-store",
      }),
      deleteMany: async (input: unknown) => {
        sessionDeletes.push(input)
        return { count: 1 }
      },
    },
    membership: { findFirst: async () => ({ id: "inert-membership" }) },
  }
  return {
    db: db as unknown as Parameters<typeof revalidateQaClientAuthorization>[0],
    authorization,
    writes,
    sessionDeletes,
  }
}
test("actual explicit QA authorization revalidation writes lastValidatedAt through its supplied client", async () => {
  const f = fixture()
  const prior = f.authorization.lastValidatedAt.toISOString()
  const before = Date.now()
  const result = await revalidateQaClientAuthorization(f.db, {
    secret: "fixed-inert-d04-audit-secret-not-a-real-key",
    token: "inert-token-never-sent",
  })
  expect(f.writes).toHaveLength(1)
  expect(f.writes[0]?.where).toEqual({ id: "inert-authorization" })
  expect(Object.keys(f.writes[0]?.data ?? {})).toEqual(["lastValidatedAt"])
  expect(f.authorization.lastValidatedAt.getTime()).toBeGreaterThanOrEqual(
    before,
  )
  expect(f.authorization.lastValidatedAt.toISOString()).not.toBe(prior)
  expect(result).toEqual({
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    qaDomain: "inert.example.test",
    testerIdentity: "synthetic-auditor",
  })
  // updatedAt is Prisma @updatedAt behavior; this stand-in does not emulate SQL,
  // triggers, PostgreSQL jsonb serialization, historical rows or transaction commit.
})
test("actual active derived-session check reads linked authority without authorization timestamp writes", async () => {
  const f = fixture()
  expect(await validateQaDerivedSession(f.db, "inert-session")).toEqual({
    active: true,
    scope: {
      membershipId: "inert-membership",
      storeId: "inert-store",
      tenantId: "inert-business",
    },
  })
  expect(f.writes).toHaveLength(0)
  expect(f.sessionDeletes).toHaveLength(0)
})
test("inactive linked authorization is refused without validating its timestamp", async () => {
  const f = fixture()
  f.authorization.status = "REVOKED"
  await expect(
    revalidateQaClientAuthorization(f.db, {
      secret: "fixed-inert-d04-audit-secret-not-a-real-key",
      token: "inert-token-never-sent",
    }),
  ).rejects.toThrow("QA access could not be authorized")
  expect(f.writes).toHaveLength(0)
  expect(await validateQaDerivedSession(f.db, "inert-session")).toEqual({
    active: false,
    scope: null,
  })
  expect(f.sessionDeletes).toHaveLength(1)
})
