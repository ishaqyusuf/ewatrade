import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { listCustomerLedgerReceivables } from "./receivables"
function fixture(authorized = true, validCursor = true) {
  const cursorReads: unknown[] = []
  const reads: unknown[] = []
  const scopes: unknown[] = []
  const tx = {
    $queryRaw: async () => [],
    membership: {
      findFirst: async () =>
        authorized ? { tenant: { isActive: true } } : null,
    },
    customerLedgerAccount: {
      findFirst: async (args: unknown) => {
        cursorReads.push(args)
        return validCursor ? { id: "previous" } : null
      },
      findMany: async (args: unknown) => {
        reads.push(args)
        return ["a", "b"].map((id) => ({
          id,
          customer: { id: `c-${id}`, name: id, phone: null, email: null },
          currencyCode: "NGN",
          lastSequence: 9n,
        }))
      },
    },
    customerLedgerEntry: {
      aggregate: async (args: { where: { side: string } }) => {
        scopes.push(args)
        return {
          _sum: {
            amountMinor: args.where.side === "DEBIT" ? 9007199254740993n : 200n,
          },
        }
      },
    },
    customerLedgerAllocation: {
      aggregate: async (args: unknown) => {
        scopes.push(args)
        return { _sum: { amountMinor: 100n } }
      },
    },
    customerLedgerAllocationRelease: {
      aggregate: async (args: unknown) => {
        scopes.push(args)
        return { _sum: { amountMinor: 25n } }
      },
    },
  }
  const db = {
    $transaction: async (run: (tx: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaClient
  return { db, reads, scopes, cursorReads }
}
const actor = { tenantId: "tenant", actorUserId: "owner" }
test("receivables is tenant scoped, bounded, and retains exact debt and credit separately", async () => {
  const f = fixture()
  const result = await listCustomerLedgerReceivables(f.db, {
    ...actor,
    cursor: "previous",
    query: "Amina",
    limit: 1,
  })
  expect(result.nextCursor).toBe("a")
  expect(result.items).toHaveLength(1)
  expect(result.items[0]?.totals).toMatchObject({
    outstandingDebtMinor: "9007199254740918",
    availableCreditMinor: "125",
    netBalanceMinor: "9007199254740793",
  })
  expect(f.reads[0]).toMatchObject({
    where: { tenantId: "tenant", id: { gt: "previous" } },
    take: 2,
    orderBy: { id: "asc" },
  })
  expect(f.scopes[0]).toMatchObject({
    where: { accountId: "a", sequence: { lte: 9n } },
  })
  expect(result.scope).toBe("ACCOUNT_PAGE")
})
test("unauthorized readers never load accounts", async () => {
  const f = fixture(false)
  await expect(listCustomerLedgerReceivables(f.db, actor)).rejects.toThrow(
    "Owners and Admins",
  )
  expect(f.reads).toHaveLength(0)
})
test("unbounded and invalid pages fail before reads", async () => {
  for (const patch of [
    { limit: 0 },
    { limit: 11 },
    { limit: 1.5 },
    { query: "x".repeat(161) },
    { cursor: "" },
  ]) {
    const f = fixture()
    await expect(
      listCustomerLedgerReceivables(f.db, { ...actor, ...patch }),
    ).rejects.toThrow("Invalid receivables")
    expect(f.reads).toHaveLength(0)
  }
})


test("cursor validation is tenant/filter scoped and precedes account reads", async () => {
  const f = fixture(true, false)
  await expect(listCustomerLedgerReceivables(f.db, { ...actor, query: "%", cursor: "foreign" })).rejects.toThrow("list changed")
  expect(f.reads).toHaveLength(0)
  expect(f.cursorReads[0]).toMatchObject({ where: { AND: [
    { tenantId: "tenant", customer: { OR: [
      { name: { contains: "\\%", mode: "insensitive" } },
      { phone: { contains: "\\%", mode: "insensitive" } },
      { email: { contains: "\\%", mode: "insensitive" } },
    ] } }, { id: "foreign" },
  ] } })
})
