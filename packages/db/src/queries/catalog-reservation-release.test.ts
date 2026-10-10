import { expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  releaseCatalogStockReservationInTransaction as release,
  releaseCatalogStockReservation,
} from "./catalog-inventory"
const input = { tenantId: "tenant", reservationId: "reservation" }
const options = {
  expectedStoreId: "store",
  expectedCommercialOrderLineId: "line",
  requireUncommitted: true,
}
function fixture(packaged = false) {
  const events: string[] = []
  const writes: Array<{
    where: Record<string, unknown>
    data: { reservedQuantity: string; revision: unknown }
  }> = []
  const row = {
    id: "reservation",
    tenantId: "tenant",
    storeId: "store",
    balanceSourceId: "balance",
    commercialOrderLineId: "line",
    status: "ACTIVE",
    committedAt: null as Date | null,
    committedOperationId: null as string | null,
    enteredQuantity: new Prisma.Decimal("0.5"),
    canonicalQuantity: new Prisma.Decimal("6"),
    unitFactorSnapshot: new Prisma.Decimal("12"),
    enteredInventoryUnit: {
      stockBehavior: packaged ? "PACKAGED_STOCK" : "ALTERNATE_TRANSACTION",
    },
    balanceSource: {
      revision: 3,
      reservedQuantity: new Prisma.Decimal(packaged ? "1.5" : "18"),
    },
  }
  let lockedId = "balance"
  let changed = 1
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?")
      expect(values).toContain("tenant")
      if (sql.includes('FROM "StockReservation"')) {
        events.push("reservation")
        return [
          { id: "reservation", storeId: "store", balanceSourceId: "balance" },
        ]
      }
      events.push("balance")
      expect(values).toContain("store")
      return [{ id: lockedId }]
    },
    stockReservation: {
      findFirst: async () => {
        events.push("read")
        return row
      },
      update: async ({ data }: { data: { status: string } }) => {
        events.push("release")
        Object.assign(row, data)
        return row
      },
    },
    stockBalanceSource: {
      updateMany: async (args: (typeof writes)[number]) => {
        writes.push(args)
        return { count: changed }
      },
    },
  } as unknown as Prisma.TransactionClient
  return {
    row,
    tx,
    events,
    writes,
    setLockedId: (id: string) => {
      lockedId = id
    },
    setChanged: (count: number) => {
      changed = count
    },
  }
}
test("caller-owned release locks then subtracts exact canonical stock and replays once", async () => {
  const f = fixture()
  expect((await release(f.tx, input, options)).status).toBe("released")
  expect(f.events).toEqual(["reservation", "balance", "read", "release"])
  expect(f.writes[0]).toEqual({
    where: { id: "balance", tenantId: "tenant", storeId: "store", revision: 3 },
    data: { reservedQuantity: "12", revision: { increment: 1 } },
  })
  expect((await release(f.tx, input, options)).status).toBe("released")
  expect(f.writes).toHaveLength(1)
})
test("packaged reservations release entered quantity rather than canonical quantity", async () => {
  const f = fixture(true)
  await release(f.tx, input, options)
  expect(f.writes[0]?.data.reservedQuantity).toBe("1")
})
test("foreign Store or commercial line cannot release a reservation", async () => {
  for (const patch of [
    { expectedStoreId: "foreign" },
    { expectedCommercialOrderLineId: "foreign" },
  ]) {
    const f = fixture()
    await expect(
      release(f.tx, input, { ...options, ...patch }),
    ).rejects.toThrow("ownership changed")
    expect(f.writes).toHaveLength(0)
  }
})
test("commit evidence cannot be hidden by restoring active status", async () => {
  for (const patch of [
    { status: "COMMITTED" },
    { committedOperationId: "operation" },
    { committedAt: new Date() },
  ]) {
    const f = fixture()
    Object.assign(f.row, patch)
    await expect(release(f.tx, input, options)).rejects.toThrow(
      "requires a return",
    )
    expect(f.writes).toHaveLength(0)
  }
})
test("insufficient reservation evidence cannot produce negative reserved stock", async () => {
  const f = fixture()
  f.row.balanceSource.reservedQuantity = new Prisma.Decimal("5")
  await expect(release(f.tx, input, options)).rejects.toThrow("does not cover")
  expect(f.writes).toHaveLength(0)
})
test("missing locked balance and concurrent balance revision refuse release", async () => {
  const f = fixture()
  f.setLockedId("foreign")
  await expect(release(f.tx, input, options)).rejects.toThrow("not found")
  expect(f.writes).toHaveLength(0)
  const g = fixture()
  g.setChanged(0)
  await expect(release(g.tx, input, options)).rejects.toThrow("balance changed")
  expect(g.row.status).toBe("ACTIVE")
})
test("public wrapper uses one transaction and preserves terminal replay", async () => {
  const f = fixture()
  f.row.status = "COMMITTED"
  let calls = 0
  const db = {
    $transaction: async (
      action: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => {
      calls++
      return action(f.tx)
    },
  } as unknown as PrismaClient
  expect((await releaseCatalogStockReservation(db, input)).status).toBe(
    "committed",
  )
  expect(calls).toBe(1)
  expect(f.writes).toHaveLength(0)
})
