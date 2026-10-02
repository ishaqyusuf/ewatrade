import { expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { closeoutFixture } from "./finance/inventory-closeout-test-fixture"
import { finalizeInventoryCloseout as finalize } from "./inventory-custody-transfers"

const input = {
  actorUserId: "finalizer",
  clientOperationId: "confirmation",
  closeoutId: "closeout",
  reason: "Approved custody reconciliation",
  schemaVersion: 1 as const,
  tenantId: "tenant",
}
const decimal = (value: string) => new Prisma.Decimal(value)

function fixture(
  options: { gain?: boolean; zero?: boolean; packaged?: boolean } = {},
) {
  const f = closeoutFixture({ ...options, noBook: true })
  f.closeout.status = "DRAFT"
  f.balance.onHandQuantity = decimal("4")
  f.balance.revision = 4
  const balance = { ...f.balance, reservedQuantity: decimal("0") }
  f.line.balanceSource = balance
  const log: string[] = []
  const movements: Array<Record<string, unknown>> = []
  const updates: Array<Record<string, unknown>> = []
  let operation: Record<string, unknown> | null = null
  let commandReads = 0
  let missFirst = false
  let lockedBalances = [{ id: "balance" }]
  const tx = {
    store: { findMany: async () => [{ id: "store", currencyCode: "NGN" }] },
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("?")
      if (sql.includes('"FinanceBook"')) {
        log.push("book-lock")
        return []
      }
      if (sql.includes('"InventoryCloseout"')) {
        log.push("closeout-lock")
        return [{ id: "closeout" }]
      }
      if (sql.includes('"StockBalanceSource"')) {
        log.push("balance-lock")
        return lockedBalances
      }
      throw new Error("Unexpected lock")
    },
    stockOperation: {
      findUnique: async () => {
        commandReads++
        log.push("command-read")
        return missFirst && commandReads === 1 ? null : operation
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        log.push("operation-write")
        operation = { id: "operation", ...data }
        return operation
      },
    },
    inventoryCloseout: {
      findFirst: async ({ select }: { select?: unknown }) => {
        log.push(select ? "identity-read" : "graph-read")
        return select ? { id: "closeout", storeId: "store" } : f.closeout
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        log.push("source-write")
        Object.assign(f.closeout, data)
        return f.closeout
      },
    },
    inventoryCloseoutLine: {
      findMany: async () => [{ balanceSourceId: "balance" }],
    },
    stockBalanceSource: {
      updateMany: async ({
        data,
        where,
      }: { data: Record<string, unknown>; where: Record<string, unknown> }) => {
        log.push("balance-write")
        updates.push(where)
        balance.onHandQuantity = decimal(String(data.onHandQuantity))
        balance.revision++
        return { count: 1 }
      },
    },
    stockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        movements.push(data)
        return { id: "movement", ...data }
      },
    },
  }
  const db = {
    $transaction: async (
      run: (client: typeof tx) => Promise<unknown>,
      settings: unknown,
    ) => {
      expect(settings).toEqual({ maxWait: 10_000, timeout: 30_000 })
      return run(tx)
    },
  } as unknown as PrismaClient
  return {
    ...f,
    balance,
    log,
    movements,
    updates,
    db,
    operation: () => operation,
    raceReplay: () => {
      commandReads = 0
      missFirst = true
      log.length = 0
    },
    setLockedBalances: (rows: Array<{ id: string }>) => {
      lockedBalances = rows
    },
  }
}

test("no-Book closeout retains exact shortage/gain stock, custody ownership and one finalized date", async () => {
  for (const gain of [false, true])
    for (const packaged of [false, true]) {
      const f = fixture({ gain, packaged })
      const operation = await finalize(f.db, input)
      expect(f.closeout.finalizedAt).toBe(operation.effectiveAt)
      expect(f.closeout.finalizedOperationId).toBe(operation.id)
      expect(f.closeout.status).toBe("FINALIZED")
      expect(f.balance.onHandQuantity.toFixed()).toBe(gain ? "5" : "3")
      expect(f.movements).toHaveLength(1)
      expect(f.movements[0]?.signedCanonicalEffect).toBe(
        packaged ? (gain ? "12" : "-12") : gain ? "1" : "-1",
      )
      expect(f.updates).toEqual([
        { id: "balance", tenantId: "tenant", storeId: "store", revision: 4 },
      ])
      expect(f.log.indexOf("book-lock")).toBeLessThan(
        f.log.indexOf("closeout-lock"),
      )
      expect(f.log.indexOf("balance-lock")).toBeLessThan(
        f.log.indexOf("graph-read"),
      )
      expect(f.bookReads()).toBe(0)
    }
})

test("zero variance finalizes without a stock movement or revision increment", async () => {
  const f = fixture({ zero: true })
  await finalize(f.db, input)
  expect(f.closeout.status).toBe("FINALIZED")
  expect(f.balance.revision).toBe(4)
  expect(f.movements).toEqual([])
  expect(f.updates).toEqual([])
})

test("a command committed while waiting for the closeout lock replays before mutable source gates", async () => {
  const f = fixture()
  const original = await finalize(f.db, input)
  f.raceReplay()
  expect(await finalize(f.db, input)).toEqual(original)
  expect(f.log).toEqual([
    "identity-read",
    "book-lock",
    "command-read",
    "closeout-lock",
    "command-read",
  ])
  expect(f.movements).toHaveLength(1)
  await expect(
    finalize(f.db, { ...input, reason: "Different approval" }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
})

test("foreign, missing and duplicate balance locks refuse finalization before mutable reads or writes", async () => {
  for (const rows of [
    [],
    [{ id: "foreign" }],
    [{ id: "balance" }, { id: "balance" }],
  ]) {
    const f = fixture()
    f.setLockedBalances(rows)
    await expect(finalize(f.db, input)).rejects.toMatchObject({
      code: "INVALID_STOCK_OPERATION",
    })
    expect(f.log).not.toContain("graph-read")
    expect(f.operation()).toBeNull()
  }
})

test("custody mismatch, stale declarations/revisions and reserved stock reject before stock writes", async () => {
  const probes: Array<{
    code: string
    mutate: (f: ReturnType<typeof fixture>) => void
  }> = [
    {
      code: "INVALID_STOCK_OPERATION",
      mutate: (f) => {
        f.balance.custodyReferenceId = "other-staff"
      },
    },
    {
      code: "INVALID_STOCK_OPERATION",
      mutate: (f) => {
        f.balance.tenantId = "other-tenant"
      },
    },
    {
      code: "INVALID_STOCK_OPERATION",
      mutate: (f) => {
        f.balance.onHandQuantity = decimal("9")
      },
    },
    {
      code: "REVISION_CONFLICT",
      mutate: (f) => {
        f.balance.revision = 8
      },
    },
    {
      code: "INSUFFICIENT_STOCK",
      mutate: (f) => {
        f.balance.reservedQuantity = decimal("4")
      },
    },
  ]
  for (const probe of probes) {
    const f = fixture()
    probe.mutate(f)
    await expect(finalize(f.db, input)).rejects.toMatchObject({
      code: probe.code,
    })
    expect(f.operation()).toBeNull()
    expect(f.movements).toEqual([])
    expect(f.closeout.status).toBe("DRAFT")
  }
})
