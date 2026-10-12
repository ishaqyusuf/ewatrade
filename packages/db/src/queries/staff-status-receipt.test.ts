import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  getStaffStatusReceipt,
  getStaffStatusReceiptInTransaction,
} from "./staff-status-receipt"

const scope = {
  tenantId: "business",
  actorUserId: "owner",
  eventId: "original",
}
function fixture(actorStatus = "ACTIVE", actorRole = "OWNER") {
  const calls: Array<{ operation: string; input: unknown }> = []
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ operation: "lock", input: { sql: parts.join("?"), values } })
      return parts.join("").includes('FROM "Membership"')
        ? [{ role: actorRole, status: actorStatus }]
        : [{ id: "business" }]
    },
    retailOpsStaffLifecycleEvent: {
      findFirst: async (input: unknown) => {
        calls.push({ operation: "event", input })
        return {
          id: "original",
          membershipId: "staff-member",
          staffUserId: "staff",
          actorUserId: "owner",
          happenedAt: new Date("2026-10-01T10:00:00.123Z"),
          type: "SUSPENDED",
          reason: "Original reason",
          fromRole: "CASHIER",
          toRole: "CASHIER",
          fromStatus: "ACTIVE",
          toStatus: "SUSPENDED",
        }
      },
    },
    membership: {
      findMany: async (input: unknown) => {
        calls.push({ operation: "directory", input })
        return [
          {
            id: "staff-member",
            userId: "staff",
            role: "OPERATOR",
            status: "ACTIVE",
            staffAccessRevision: 12,
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

test("original status outcome stays distinct from current directory and membership", async () => {
  const f = fixture()
  const record = await getStaffStatusReceiptInTransaction(f.tx, scope)
  expect(record.after).toEqual({ role: "CASHIER", status: "SUSPENDED" })
  expect(record.before).toEqual({ role: "CASHIER", status: "ACTIVE" })
  expect(record.reason).toBe("Original reason")
  expect(record.happenedAt).toBe("2026-10-01T10:00:00.123Z")
  expect(record.currentMembership).toEqual({
    membershipId: "staff-member",
    role: "OPERATOR",
    status: "ACTIVE",
    accessRevision: 12,
  })
  expect(record.subject).toEqual({
    name: "Current name",
    email: "current@example.test",
    coverage: "current_directory",
  })
  expect(record.actor).toEqual({
    name: null,
    email: null,
    coverage: "unavailable",
  })
  expect(record.originalActorUserId).toBe("owner")
  expect(
    f.calls.find((call) => call.operation === "event")?.input,
  ).toMatchObject({
    where: {
      id: "original",
      tenantId: "business",
      type: { in: ["SUSPENDED", "REACTIVATED"] },
    },
  })
  expect(
    f.calls.find((call) => call.operation === "directory")?.input,
  ).toMatchObject({
    where: { tenantId: "business", userId: { in: ["staff", "owner"] } },
  })
})

test("fresh revoked or nonadministrative actor cannot read original reasons or directory contacts", async () => {
  for (const [status, role] of [
    ["SUSPENDED", "OWNER"],
    ["ACTIVE", "MANAGER"],
    ["ACTIVE", "CASHIER"],
  ]) {
    const f = fixture(status, role)
    await expect(
      getStaffStatusReceiptInTransaction(f.tx, scope),
    ).rejects.toThrow("Owner/Admin")
    expect(f.calls.some((call) => call.operation !== "lock")).toBe(false)
  }
})

test("receipt root wrapper owns one bounded snapshot", async () => {
  const f = fixture()
  let count = 0
  const db = {
    $transaction: async (
      run: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: unknown,
    ) => {
      count++
      expect(options).toEqual({
        maxWait: 10000,
        timeout: 30000,
        isolationLevel: "RepeatableRead",
      })
      return run(f.tx)
    },
  } as unknown as PrismaClient
  await getStaffStatusReceipt(db, scope)
  expect(count).toBe(1)
})
