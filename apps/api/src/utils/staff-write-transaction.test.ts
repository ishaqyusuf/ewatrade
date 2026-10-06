import { expect, test } from "bun:test"
import type { StaffRequestContext } from "./staff-request-access"
import { scopeStaffRequest } from "./staff-request-access"
import { withStaffWriteTransaction } from "./staff-write-transaction"

function fixture(role: "OPERATOR" | "CASHIER" = "OPERATOR", active = true) {
  const events: string[] = []
  const access = {
    role: "OPERATOR",
    status: "ACTIVE",
    staffAccessMode: "SCOPED",
    catalogEditor: false,
    staffAccessRevision: 2,
    staffStoreAssignments: [{ storeId: "store", role, status: "ACTIVE" }],
  }
  const tx = {
    $queryRaw: async () => {
      events.push("lock")
      return []
    },
    membership: {
      findFirst: async () => {
        events.push("fresh")
        return active ? access : null
      },
    },
  }
  const db = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      events.push("begin")
      try {
        const result = await callback(tx)
        events.push("commit")
        return result
      } catch (error) {
        events.push("rollback")
        throw error
      }
    },
  }
  const ctx = {
    db,
    tenantContext: {
      membership: { id: "staff", role: "OPERATOR" },
      tenant: { id: "business" },
      activeStore: { id: "store" },
      stores: [{ id: "store" }],
      staffAccess: {
        businessRole: "OPERATOR",
        mode: "SCOPED",
        status: "ACTIVE",
        catalogEditor: false,
        assignments: [{ storeId: "store", role: "OPERATOR", status: "ACTIVE" }],
      },
    },
  } as unknown as StaffRequestContext
  return { ctx, events }
}
test("accepted writes hold the Membership lock across nested repository transactions", async () => {
  const { ctx, events } = fixture()
  await withStaffWriteTransaction(ctx, async (locked) => {
    await scopeStaffRequest(
      locked,
      "inventory.postBalanceOperation",
      "mutation",
      {},
    )
    await locked.db.$transaction(async () => {
      events.push("write")
    })
  })
  expect(events).toEqual(["begin", "lock", "fresh", "write", "commit"])
})
test("a role downgrade is reread before a stock write and rolls back", async () => {
  const { ctx, events } = fixture("CASHIER")
  await expect(
    withStaffWriteTransaction(ctx, async (locked) => {
      await scopeStaffRequest(
        locked,
        "inventory.postBalanceOperation",
        "mutation",
        {},
      )
      events.push("write")
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(events).toEqual(["begin", "lock", "fresh", "rollback"])
})
test("suspended or revoked membership cannot reuse an earlier request snapshot", async () => {
  const { ctx, events } = fixture("OPERATOR", false)
  await expect(
    withStaffWriteTransaction(ctx, async () => events.push("write")),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(events).toEqual(["begin", "lock", "fresh", "rollback"])
})
test("repository failures propagate and roll back the outer write", async () => {
  const { ctx, events } = fixture()
  await expect(
    withStaffWriteTransaction(ctx, async (locked) =>
      locked.db.$transaction(async () => {
        throw new Error("ledger failed")
      }),
    ),
  ).rejects.toThrow("ledger failed")
  expect(events).toEqual(["begin", "lock", "fresh", "rollback"])
})
