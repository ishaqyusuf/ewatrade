import { describe, expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  type CommitCatalogStockReservationInput,
  commitCatalogStockReservationInTransaction as commit,
  commitCatalogStockReservation,
} from "./catalog-inventory"

const input: CommitCatalogStockReservationInput = {
  tenantId: "tenant",
  actorUserId: "operator",
  reservationId: "reservation",
  clientOperationId: "command",
  schemaVersion: 1,
  source: "inventory",
}
const decimal = (value: string) => new Prisma.Decimal(value)

function fixture(options: { packaged?: boolean; lineId?: string } = {}) {
  const events: string[] = []
  const locks: Array<{ sql: string; values: unknown[] }> = []
  const balanceUpdates: Array<Record<string, unknown>> = []
  const reservationUpdates: Array<Record<string, unknown>> = []
  const operationWrites: Array<Record<string, unknown>> = []
  const movementWrites: Array<Record<string, unknown>> = []
  const identity = {
    id: "reservation",
    storeId: "store",
    balanceSourceId: "balance",
  }
  let balanceLockId = "balance"
  const reservation = {
    ...identity,
    tenantId: "tenant",
    status: "ACTIVE",
    committedOperationId: null as string | null,
    committedAt: null as Date | null,
    commercialOrderLineId: options.lineId ?? null,
    configurationVersionId: "configuration",
    enteredInventoryUnitId: "unit",
    enteredQuantity: decimal("0.5"),
    canonicalQuantity: decimal("6"),
    unitFactorSnapshot: decimal("12"),
    enteredInventoryUnit: {
      stockBehavior: options.packaged
        ? "PACKAGED_STOCK"
        : "ALTERNATE_TRANSACTION",
      transactionScale: 3,
    },
    balanceSource: {
      onHandQuantity: decimal(options.packaged ? "4" : "48"),
      reservedQuantity: decimal(options.packaged ? "0.5" : "6"),
      revision: 8,
    },
  }
  let saved: Record<string, unknown> | null = null
  let reads = 0
  let missFirstRead = false
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?")
      locks.push({ sql, values })
      if (sql.includes('FROM "StockReservation"')) {
        events.push("lock:reservation")
        return [identity]
      }
      if (sql.includes('FROM "StockBalanceSource"')) {
        events.push("lock:balance")
        return [{ id: balanceLockId }]
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
    stockOperation: {
      findUnique: async () => {
        events.push("read:command")
        reads++
        return missFirstRead && reads === 1 ? null : saved
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push("write:operation")
        operationWrites.push(data)
        saved = { id: "operation", ...data, movements: movementWrites }
        return saved
      },
    },
    stockReservation: {
      findFirst: async () => {
        events.push("read:reservation")
        return reservation
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        events.push("write:reservation")
        reservationUpdates.push(data)
        Object.assign(reservation, data)
        return reservation
      },
    },
    stockBalanceSource: {
      updateMany: async (args: Record<string, unknown>) => {
        events.push("write:balance")
        balanceUpdates.push(args)
        return { count: 1 }
      },
    },
    stockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push("write:movement")
        const movement = {
          id: "movement",
          ...data,
          resultingOnHandQuantity: decimal(
            String(data.resultingOnHandQuantity),
          ),
          signedCanonicalEffect: decimal(String(data.signedCanonicalEffect)),
        }
        movementWrites.push(movement)
        return movement
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    events,
    locks,
    balanceUpdates,
    reservationUpdates,
    operationWrites,
    movementWrites,
    identity,
    reservation,
    replaceBalanceLock: (id: string) => {
      balanceLockId = id
    },
    concurrentReplay: () => {
      reads = 0
      missFirstRead = true
      events.length = 0
      locks.length = 0
    },
    saved: () => saved,
  }
}

describe("reservation commitment physical/source composition", () => {
  test("fresh no-Book commits retain exact entered units, canonical effect and owning date", async () => {
    for (const packaged of [false, true]) {
      const f = fixture({ packaged })
      const before = Date.now()
      const result = await commit(f.tx, input, {
        expectedStoreId: "store",
        financialContext: null,
      })
      expect(result).toEqual({
        id: "operation",
        movements: [
          {
            balanceSourceId: "balance",
            enteredQuantity: "0.5",
            resultingOnHandQuantity: packaged ? "3.5" : "42",
            signedCanonicalEffect: "-6",
          },
        ],
      })
      expect(f.events.slice(0, 5)).toEqual([
        "read:command",
        "lock:reservation",
        "read:command",
        "lock:balance",
        "read:reservation",
      ])
      expect(f.locks[0]?.values).toEqual(["reservation", "tenant"])
      expect(f.locks[1]?.values).toEqual(["balance", "tenant", "store"])
      expect(f.balanceUpdates).toEqual([
        {
          where: {
            id: "balance",
            tenantId: "tenant",
            storeId: "store",
            revision: 8,
          },
          data: {
            onHandQuantity: packaged ? "3.5" : "42",
            reservedQuantity: "0",
            revision: { increment: 1 },
          },
        },
      ])
      expect(f.operationWrites[0]?.type).toBe("RESERVATION_COMMIT")
      const effectiveAt = f.operationWrites[0]?.effectiveAt
      expect(effectiveAt).toBeInstanceOf(Date)
      expect((effectiveAt as Date).getTime()).toBeGreaterThanOrEqual(before)
      expect((effectiveAt as Date).getTime()).toBeLessThanOrEqual(Date.now())
      expect(f.reservationUpdates).toEqual([
        {
          committedOperationId: "operation",
          committedAt: effectiveAt,
          status: "COMMITTED",
        },
      ])
      expect(f.movementWrites).toHaveLength(1)
      // The fixture has no finance delegates: an accidental cost/journal hook fails.
    }
  })

  test("standalone rejects Commerce ownership before any physical writes", async () => {
    const f = fixture({ lineId: "line" })
    await expect(
      commit(f.tx, input, { financialContext: null }),
    ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
    expect(f.balanceUpdates).toHaveLength(0)
    expect(f.operationWrites).toHaveLength(0)
    expect(f.reservationUpdates).toHaveLength(0)
  })

  test("trusted Product commit requires its exact Order line and skips generic costing", async () => {
    const f = fixture({ lineId: "line" })
    await commit(
      f.tx,
      { ...input, operationType: "sale_fulfillment" },
      {
        expectedStoreId: "store",
        expectedCommercialOrderLineId: "line",
        financialContext: { bookId: "book" },
      },
    )
    expect(f.operationWrites[0]?.type).toBe("SALE_FULFILLMENT")
    expect(f.reservationUpdates[0]?.committedOperationId).toBe("operation")
    for (const lineId of [undefined, "different"]) {
      const rejected = fixture({ lineId: "line" })
      await expect(
        commit(
          rejected.tx,
          { ...input, operationType: "sale_fulfillment" },
          { expectedCommercialOrderLineId: lineId, financialContext: null },
        ),
      ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
      expect(rejected.balanceUpdates).toHaveLength(0)
    }
  })

  test("the post-lock command reread replays a concurrent no-Book commit before ACTIVE gates", async () => {
    const f = fixture()
    const first = await commit(f.tx, input, { financialContext: null })
    f.concurrentReplay()
    const replay = await commit(f.tx, input, {
      expectedStoreId: "changed",
      financialContext: null,
    })
    expect(replay).toEqual(first)
    expect(f.events).toEqual([
      "read:command",
      "lock:reservation",
      "read:command",
    ])
    expect(f.balanceUpdates).toHaveLength(1)
    expect(f.operationWrites).toHaveLength(1)
    expect(f.reservationUpdates).toHaveLength(1)
  })

  test("exact legacy replay cannot backfill links or cost, while changed input rejects", async () => {
    const f = fixture()
    const first = await commit(f.tx, input, { financialContext: null })
    f.reservation.committedOperationId = null
    f.reservation.committedAt = null
    f.events.length = 0
    expect(
      await commit(f.tx, input, { financialContext: { bookId: "book" } }),
    ).toEqual(first)
    expect(f.events).toEqual(["read:command"])
    expect(f.reservation.committedOperationId).toBeNull()
    expect(f.reservationUpdates).toHaveLength(1)
    await expect(
      commit(f.tx, { ...input, reason: "changed" }, { financialContext: null }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
    expect(f.operationWrites).toHaveLength(1)
  })

  test("changed Store identity and foreign balance locks reject before any writes", async () => {
    const store = fixture()
    await expect(
      commit(store.tx, input, {
        expectedStoreId: "other",
        financialContext: null,
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
    expect(store.events).not.toContain("lock:balance")
    expect(store.balanceUpdates).toHaveLength(0)
    const balance = fixture()
    balance.replaceBalanceLock("foreign")
    await expect(
      commit(balance.tx, input, { financialContext: null }),
    ).rejects.toMatchObject({ code: "RESERVATION_NOT_FOUND" })
    expect(balance.events).not.toContain("read:reservation")
    expect(balance.operationWrites).toHaveLength(0)
  })

  test("the public wrapper cannot select the trusted Product operation", async () => {
    const db = {
      $transaction: () => {
        throw new Error("Transaction must not start")
      },
    } as unknown as PrismaClient
    await expect(
      commitCatalogStockReservation(db, {
        ...input,
        operationType: "sale_fulfillment",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
  })
})
