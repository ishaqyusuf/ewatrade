import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  getStaffAccessReceipt,
  getStaffAccessReceiptInTransaction,
} from "./staff-access-receipt"

const scope = {
  tenantId: "business",
  actorUserId: "owner",
  eventId: "original",
}
function fixture(actorStatus = "ACTIVE") {
  const calls: Array<{ kind: string; input: unknown }> = []
  const tx = {
    $transaction: () => {
      throw Error("nested transaction")
    },
    $queryRaw: async (sql: TemplateStringsArray) =>
      sql.join("").includes('JOIN "Tenant"')
        ? [{ role: "OWNER", status: actorStatus }]
        : [{ id: "business" }],
    staffAccessAuditEvent: {
      findFirst: async (input: unknown) => {
        calls.push({ kind: "event", input })
        return {
          id: "original",
          membershipId: "member",
          actorUserId: "owner",
          operation: "access_changed",
          revision: 8,
          createdAt: new Date("2026-10-12T10:00:00.123Z"),
          before: {
            mode: "SCOPED",
            catalogEditor: false,
            defaultStoreId: "farm",
            assignments: [
              { storeId: "farm", role: "CASHIER", status: "ACTIVE" },
              { storeId: "foreign", role: "MANAGER" },
            ],
            private: "must-not-leak",
          },
          after: {
            mode: "SCOPED",
            catalogEditor: false,
            defaultStoreId: null,
            assignments: [],
          },
        }
      },
    },
    store: {
      findMany: async (input: unknown) => {
        calls.push({ kind: "stores", input })
        return [{ id: "farm", name: "Current Farm label" }]
      },
    },
    membership: {
      findMany: async (input: unknown) => {
        calls.push({ kind: "directory", input })
        return [
          {
            id: "member",
            userId: "staff",
            role: "OPERATOR",
            status: "SUSPENDED",
            staffAccessMode: "SCOPED",
            staffAccessRevision: 12,
            catalogEditor: false,
            retailOpsStaffProfile: { defaultStoreId: null },
            user: {
              name: "Current name",
              displayName: null,
              email: "current@example.test",
            },
          },
        ]
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, calls }
}
test("original access snapshots remain separate from current membership and missing provenance", async () => {
  const f = fixture()
  const receipt = await getStaffAccessReceiptInTransaction(f.tx, scope)
  expect(receipt.eventId).toBe("original")
  expect(receipt.revision).toBe(8)
  expect(receipt.happenedAt).toBe("2026-10-12T10:00:00.123Z")
  expect(receipt.after).toMatchObject({
    mode: "SCOPED",
    assignments: [],
    defaultStore: null,
  })
  expect(receipt.before).toMatchObject({
    coverage: "partial",
    hiddenStoreReferences: 1,
  })
  expect(receipt.currentMembership).toMatchObject({
    role: "OPERATOR",
    status: "SUSPENDED",
    accessRevision: 12,
  })
  expect(receipt.provenance).toEqual({
    reason: "not_recorded",
    handover: "not_recorded",
    historicalNames: "not_recorded",
  })
  expect(JSON.stringify(receipt)).not.toContain("must-not-leak")
  expect(JSON.stringify(receipt)).not.toContain('"foreign"')
  expect(f.calls.find((row) => row.kind === "event")?.input).toMatchObject({
    where: { id: "original", tenantId: "business" },
  })
  expect(f.calls.find((row) => row.kind === "stores")?.input).toMatchObject({
    where: { tenantId: "business" },
  })
})
test("fresh revoked actor cannot read original snapshots or current contacts", async () => {
  const f = fixture("SUSPENDED")
  await expect(getStaffAccessReceiptInTransaction(f.tx, scope)).rejects.toThrow(
    "Only Owner/Admin",
  )
  expect(f.calls).toHaveLength(0)
})
test("receipt root opens exactly one bounded repeatable snapshot", async () => {
  const f = fixture()
  let count = 0
  const db = {
    $transaction: async (
      work: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: unknown,
    ) => {
      count++
      expect(options).toEqual({
        maxWait: 10_000,
        timeout: 30_000,
        isolationLevel: "RepeatableRead",
      })
      return work(f.tx)
    },
  } as unknown as PrismaClient
  await getStaffAccessReceipt(db, scope)
  expect(count).toBe(1)
})
