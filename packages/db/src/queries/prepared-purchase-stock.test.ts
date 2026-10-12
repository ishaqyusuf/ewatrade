import { expect, test } from "bun:test"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { Prisma } from "../../generated/prisma/client"
import {
  preparePurchaseStockReceiptInTransaction,
  preparePurchaseStockReceiptsInTransaction,
  type SingleBalanceInput,
} from "./inventory-operations"

const input = {
  tenantId: "tenant",
  storeId: "store",
  balanceSourceId: "balance",
  enteredInventoryUnitId: "unit",
  enteredQuantity: "2.125",
  expectedConfigurationVersionId: "config",
}
function fixture(packaged = false) {
  const unit = {
    id: "unit",
    name: "bag",
    factor: new Prisma.Decimal(packaged ? "12" : "1"),
    transactionScale: 3,
    stockBehavior: packaged ? "PACKAGED_STOCK" : "CANONICAL_SHARED",
    configurationVersionId: "config",
    configurationVersion: { status: "CURRENT", productId: "product-owner" },
  }
  const balance = {
    id: "balance",
    tenantId: "tenant",
    storeId: "store",
    kind: packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
    custodyType: "STORE",
    revision: 3,
    onHandQuantity: new Prisma.Decimal(packaged ? "2" : "0"),
    reservedQuantity: new Prisma.Decimal("0"),
    inventoryUnitId: "unit",
    inventoryUnit: unit,
    product: { catalogItemId: "product" },
    productId: "product-owner",
    variant: { name: "Default" },
    store: { currencyCode: "NGN" },
  }
  const state = {
    lockedUnit: true,
    balanceReads: 0,
    unitReads: 0,
    revision: balance.revision,
    writes: [] as Array<Record<string, unknown>>,
    movement: null as Record<string, unknown> | null,
    operation: null as Record<string, unknown> | null,
  }
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray) =>
      sql.join(" ").includes("InventoryUnit")
        ? state.lockedUnit
          ? [{ id: "unit" }]
          : []
        : [{ id: "balance" }],
    stockBalanceSource: {
      findFirst: async () => {
        state.balanceReads++
        return balance
      },
      updateMany: async ({
        where,
        data,
      }: { where: { revision: number }; data: Record<string, unknown> }) => {
        if (where.revision !== state.revision) return { count: 0 }
        state.revision++
        state.writes.push(data)
        return { count: 1 }
      },
    },
    inventoryUnit: {
      findFirst: async () => {
        state.unitReads++
        return unit
      },
      findMany: async () => [{ name: "bag" }],
    },
    catalogItem: { findUniqueOrThrow: async () => ({ name: "Flour" }) },
    stockOperation: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.operation = { ...data, id: "operation" }
        state.writes.push(data)
        return state.operation
      },
      findUniqueOrThrow: async () => ({
        ...state.operation,
        categories: [],
        movements: [{ ...state.movement, id: "movement" }],
      }),
    },
    stockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.writes.push(data)
        state.movement = {
          ...data,
          enteredQuantity: new Prisma.Decimal(String(data.enteredQuantity)),
          signedCanonicalEffect: new Prisma.Decimal(
            String(data.signedCanonicalEffect),
          ),
          resultingOnHandQuantity: new Prisma.Decimal(
            String(data.resultingOnHandQuantity),
          ),
        }
        return state.movement
      },
    },
  } as unknown as Prisma.TransactionClient
  const command: SingleBalanceInput = {
    ...input,
    actorUserId: "owner",
    clientOperationId: "receipt",
    direction: "increase",
    type: "receipt",
    source: "finance_purchase",
    schemaVersion: 1,
    expectedBalanceRevision: 3,
    reason: "Original goods",
    effectiveAt: new Date("2026-10-04T12:00:00.123Z"),
  }
  return { tx, state, command, balance, unit }
}

test("purchase preview and confirmed movement share exact locked quantities; repeated confirmation has one effect", async () => {
  for (const packaged of [false, true]) {
    const f = fixture(packaged)
    const prepared = await preparePurchaseStockReceiptInTransaction(f.tx, input)
    expect(f.state.writes).toHaveLength(0)
    expect(prepared.preview.after).toBe(
      parseExactDecimal(packaged ? "4.125" : "2.125"),
    )
    expect(prepared.preview.canonicalQuantity).toBe(
      parseExactDecimal(packaged ? "25.5" : "2.125"),
    )
    const result = await prepared.execute(f.command)
    expect(result.movements[0]).toMatchObject({
      resultingOnHandQuantity: prepared.preview.after,
      signedCanonicalEffect: prepared.preview.canonicalQuantity,
      enteredQuantity: "2.125",
      configurationVersionId: "config",
    })
    expect(await prepared.execute(f.command)).toEqual(result)
    expect(f.state.revision).toBe(4)
    expect(f.state.writes).toHaveLength(3)
    expect(f.state.balanceReads).toBe(1)
    expect(f.state.unitReads).toBe(1)
    expect(() =>
      prepared.execute({ ...f.command, clientOperationId: "other" }),
    ).toThrow("prepared stock receipt command changed")
  }
})

test("prepared purchase stock refuses replacement scope, source, price, quantity, units and revision before effects", async () => {
  const f = fixture()
  const prepared = await preparePurchaseStockReceiptInTransaction(f.tx, input)
  for (const patch of [
    { tenantId: "other" },
    { storeId: "other" },
    { balanceSourceId: "other" },
    { enteredInventoryUnitId: "other" },
    { enteredQuantity: "3" },
    { expectedConfigurationVersionId: "other" },
    { expectedBalanceRevision: 4 },
    { source: "ordinary_stock" },
    { unitCostMinor: 10 },
    { direction: "decrease" as const },
    { type: "adjustment" as const },
  ])
    expect(() => prepared.execute({ ...f.command, ...patch })).toThrow(
      "prepared purchase receipt source changed",
    )
  expect(f.state.writes).toHaveLength(0)
})

test("prepared receipt retains custody/current-unit guards and stock compare-and-swap refusal", async () => {
  const missing = fixture()
  missing.state.lockedUnit = false
  await expect(
    preparePurchaseStockReceiptInTransaction(missing.tx, input),
  ).rejects.toMatchObject({ code: "STALE_CONFIGURATION" })
  expect(missing.state.balanceReads).toBe(0)
  const custody = fixture()
  custody.balance.custodyType = "REP"
  await expect(
    preparePurchaseStockReceiptInTransaction(custody.tx, input),
  ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
  const retired = fixture()
  retired.unit.configurationVersion.status = "SUPERSEDED"
  await expect(
    preparePurchaseStockReceiptInTransaction(retired.tx, input),
  ).rejects.toMatchObject({ code: "STALE_CONFIGURATION" })
  const stale = fixture()
  const prepared = await preparePurchaseStockReceiptInTransaction(
    stale.tx,
    input,
  )
  stale.state.revision++
  await expect(prepared.execute(stale.command)).rejects.toMatchObject({
    code: "REVISION_CONFLICT",
  })
  expect(stale.state.writes).toHaveLength(0)
})

function batchFixture(count = 10) {
  const f = fixture()
  const balances = Array.from({ length: count }, (_, index) => {
    const packaged = index % 2 === 1
    const unit = {
      ...f.unit,
      id: `unit-${index}`,
      name: packaged ? "crate" : "bag",
      factor: new Prisma.Decimal(packaged ? "12" : "1"),
      stockBehavior: packaged ? "PACKAGED_STOCK" : "CANONICAL_SHARED",
      configurationVersionId: `config-${index}`,
      configurationVersion: {
        status: "CURRENT",
        productId: `product-${index}`,
      },
    }
    return {
      ...f.balance,
      id: `balance-${index}`,
      productId: `product-${index}`,
      product: { catalogItemId: `item-${index}` },
      kind: packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
      onHandQuantity: new Prisma.Decimal(packaged ? "2" : "0"),
      inventoryUnitId: unit.id,
      inventoryUnit: unit,
    }
  })
  const units = balances.map((balance) => balance.inventoryUnit)
  const items = balances.map((balance, index) => ({
    id: balance.product.catalogItemId,
    name: `Goods ${index}`,
  }))
  const lines = balances.map((balance) => ({
    balanceSourceId: balance.id,
    enteredInventoryUnitId: balance.inventoryUnit.id,
    enteredQuantity: "2.125",
    expectedConfigurationVersionId:
      balance.inventoryUnit.configurationVersionId,
  }))
  const queries: Array<{ kind: string; args: unknown }> = []
  const scope = {
    tenantId: "tenant",
    storeId: "store",
    lines: [...lines].reverse(),
  }
  const batch = {
    lockedBalances: balances.map(({ id }) => ({ id })),
    lockedUnits: units.map(({ id, configurationVersionId }) => ({
      id,
      configurationVersionId,
    })),
    balances,
    units,
    items,
  }
  const tx = {
    ...f.tx,
    $queryRaw: async (sql: TemplateStringsArray, ...args: unknown[]) => {
      const unitLock = sql.join(" ").includes("InventoryUnit")
      queries.push({ kind: unitLock ? "unit-lock" : "balance-lock", args })
      return unitLock ? batch.lockedUnits : batch.lockedBalances
    },
    stockBalanceSource: {
      ...f.tx.stockBalanceSource,
      findMany: async (args: unknown) => {
        queries.push({ kind: "balances", args })
        return batch.balances
      },
    },
    inventoryUnit: {
      ...f.tx.inventoryUnit,
      findMany: async (args: { include?: unknown; where?: unknown }) => {
        queries.push({ kind: args.include ? "units" : "labels", args })
        return args.include
          ? batch.units
          : units.filter((unit) => unit.stockBehavior === "CANONICAL_SHARED")
      },
    },
    catalogItem: {
      ...f.tx.catalogItem,
      findMany: async (args: unknown) => {
        queries.push({ kind: "items", args })
        return batch.items
      },
    },
  } as unknown as Prisma.TransactionClient
  return { ...f, tx, scope, batch, queries, lines }
}

test("one and ten mixed goods sources use six preparation database calls with sorted scoped locks and exact previews", async () => {
  for (const count of [1, 10]) {
    const f = batchFixture(count)
    const stock = await preparePurchaseStockReceiptsInTransaction(f.tx, f.scope)
    expect(stock.sources.size).toBe(count)
    expect(f.queries.map((query) => query.kind)).toEqual([
      "balance-lock",
      "unit-lock",
      "balances",
      "units",
      "labels",
      "items",
    ])
    expect(f.queries[0]!.args).toEqual([
      f.lines.map((line) => line.balanceSourceId),
      "tenant",
      "store",
    ])
    expect(f.queries[2]!.args).toMatchObject({
      where: { tenantId: "tenant", storeId: "store" },
    })
    expect(f.queries[3]!.args).toMatchObject({
      where: {
        configurationVersion: {
          product: { catalogItem: { tenantId: "tenant" } },
        },
      },
    })
    expect(f.queries[5]!.args).toMatchObject({ where: { tenantId: "tenant" } })
    for (let index = 0; index < count; index++) {
      const preview = stock.sources.get(`balance-${index}`)!.preview
      expect(preview.productName).toBe(`Goods ${index}`)
      expect(preview.after).toBe(
        parseExactDecimal(index % 2 ? "4.125" : "2.125"),
      )
      expect(preview.canonicalQuantity).toBe(
        parseExactDecimal(index % 2 ? "25.5" : "2.125"),
      )
      expect(preview.balanceUnitName).toBe(index % 2 ? "crate" : "bag")
      expect(preview.revision).toBe(3)
    }
    expect(f.state.writes).toHaveLength(0)
    expect(f.state.balanceReads).toBe(0)
    expect(f.state.unitReads).toBe(0)
  }
})

test("batch rejects unsupported bounds and conflicting repeated units before querying", async () => {
  for (const lines of [
    [],
    Array.from({ length: 11 }, (_, index) => ({
      ...input,
      balanceSourceId: `source-${index}`,
    })),
    [input, input],
  ]) {
    const f = batchFixture()
    await expect(
      preparePurchaseStockReceiptsInTransaction(f.tx, { ...f.scope, lines }),
    ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
    expect(f.queries).toHaveLength(0)
  }
  const f = batchFixture()
  f.scope.lines[0]!.enteredInventoryUnitId =
    f.scope.lines[1]!.enteredInventoryUnitId
  await expect(
    preparePurchaseStockReceiptsInTransaction(f.tx, f.scope),
  ).rejects.toMatchObject({ code: "STALE_CONFIGURATION" })
  expect(f.queries).toHaveLength(0)
})

test("incomplete locks, missing sources, foreign products and stale units are refused without effects", async () => {
  const probes = [
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.lockedBalances.pop()
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.lockedBalances[0]!.id = "foreign"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.lockedUnits.pop()
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.lockedUnits[0]!.configurationVersionId = "other"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.balances.pop()
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.items.pop()
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.units.pop()
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.balances[0]!.tenantId = "other"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.balances[0]!.storeId = "other"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.balances[0]!.custodyType = "REP"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.units[0]!.configurationVersion.productId = "other"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.units[0]!.configurationVersion.status = "SUPERSEDED"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.units[0]!.configurationVersionId = "other"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.units[0]!.stockBehavior = "PACKAGED_STOCK"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.batch.balances[1]!.inventoryUnitId = "other"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.scope.lines[0]!.enteredQuantity = "2.1251"
    },
  ]
  for (const probe of probes) {
    const f = batchFixture()
    probe(f)
    await expect(
      preparePurchaseStockReceiptsInTransaction(f.tx, f.scope),
    ).rejects.toThrow()
    expect(f.state.writes).toHaveLength(0)
  }
})

test("batch execution retains payload binding, single execution and compare-and-swap", async () => {
  const f = batchFixture(1)
  const source = f.scope.lines[0]!
  const stock = await preparePurchaseStockReceiptsInTransaction(f.tx, f.scope)
  const prepared = stock.sources.get(source.balanceSourceId)!
  const command = { ...f.command, ...source }
  // Caller mutations after preparation cannot change the bound source.
  source.enteredQuantity = "9"
  expect(() => prepared.execute({ ...command, enteredQuantity: "9" })).toThrow(
    "prepared purchase receipt source changed",
  )
  const [first, second] = await Promise.all([
    prepared.execute(command),
    prepared.execute(command),
  ])
  expect(second).toEqual(first)
  expect(first.movements[0]!.resultingOnHandQuantity).toBe(
    prepared.preview.after,
  )
  expect(f.state.writes).toHaveLength(3)
  expect(() => prepared.execute({ ...command, reason: "Changed" })).toThrow(
    "prepared stock receipt command changed",
  )
  const stale = batchFixture(1)
  const preparedStale = (
    await preparePurchaseStockReceiptsInTransaction(stale.tx, stale.scope)
  ).sources.get("balance-0")!
  stale.state.revision++
  await expect(
    preparedStale.execute({ ...stale.command, ...stale.scope.lines[0]! }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  expect(stale.state.writes).toHaveLength(0)
})

function postingFixture(count = 10) {
  const f = batchFixture(count)
  const state = {
    prior: false,
    stale: false,
    partial: false,
    incomplete: false,
    changedMovement: false,
    queries: [] as string[],
    operations: [] as Record<string, any>[],
    movements: [] as Record<string, any>[],
  }
  const originalRaw = f.tx.$queryRaw
  const tx = {
    ...f.tx,
    $queryRaw: async (sql: any, ...values: unknown[]) => {
      if (Array.isArray(sql)) return (originalRaw as any)(sql, ...values)
      state.queries.push("balances-CAS")
      return state.stale
        ? []
        : f.batch.balances
            .slice(0, state.partial ? -1 : undefined)
            .map(({ id }) => ({ id }))
    },
    stockOperation: {
      ...f.tx.stockOperation,
      count: async () => {
        state.queries.push("identities")
        return Number(state.prior)
      },
      createMany: async ({ data }: { data: Record<string, any>[] }) => {
        state.queries.push("operations")
        state.operations = data
        return { count: data.length }
      },
      findMany: async () => {
        state.queries.push("saved")
        const saved = state.operations.map((operation) => ({
          ...operation,
          categories: [],
          movements: state.movements.filter(
            (movement) => movement.operationId === operation.id,
          ),
        }))
        if (state.incomplete) saved.pop()
        if (state.changedMovement)
          saved[0]!.movements[0]!.resultingOnHandQuantity = new Prisma.Decimal(
            "999",
          )
        return saved
      },
    },
    stockMovement: {
      ...f.tx.stockMovement,
      createMany: async ({ data }: { data: Record<string, any>[] }) => {
        state.queries.push("movements")
        state.movements = data.map((movement) => ({
          ...movement,
          enteredQuantity: new Prisma.Decimal(movement.enteredQuantity),
          signedCanonicalEffect: new Prisma.Decimal(
            movement.signedCanonicalEffect,
          ),
          resultingOnHandQuantity: new Prisma.Decimal(
            movement.resultingOnHandQuantity,
          ),
        }))
        return { count: data.length }
      },
    },
  } as unknown as Prisma.TransactionClient
  const commands = f.lines.map((source, index) => ({
    ...f.command,
    ...source,
    clientOperationId: `receipt-${index}`,
  }))
  return { ...f, tx, posting: state, commands }
}

test("ten goods post in one bounded batch with exact persisted readback and one concurrent execution", async () => {
  const f = postingFixture()
  const prepared = await preparePurchaseStockReceiptsInTransaction(
    f.tx,
    f.scope,
  )
  // Displayed preview is not write authority.
  prepared.sources.get("balance-0")!.preview.after = parseExactDecimal("999")
  const [first, second] = await Promise.all([
    prepared.execute(f.commands),
    prepared.execute([...f.commands].reverse()),
  ])
  expect(first).toEqual(second)
  expect(first.size).toBe(10)
  expect(f.posting.queries).toEqual([
    "identities",
    "balances-CAS",
    "operations",
    "movements",
    "saved",
  ])
  for (let index = 0; index < 10; index++) {
    const operation = first.get(`balance-${index}`)!
    expect(operation.clientOperationId).toBe(`receipt-${index}`)
    expect(operation.movements[0]!.resultingOnHandQuantity).toBe(
      index % 2 ? "4.125" : "2.125",
    )
    expect(operation.movements[0]!.signedCanonicalEffect).toBe(
      index % 2 ? "25.5" : "2.125",
    )
    expect(operation.movements[0]!.unitCostMinorSnapshot).toBeUndefined()
  }
  expect(() =>
    prepared.execute(
      f.commands.map((command, index) =>
        index ? command : { ...command, reason: "Changed" },
      ),
    ),
  ).toThrow("prepared stock receipt command changed")
})

test("whole stock batch refuses omitted, repeated, substituted, mixed actor/date and changed source commands before writes", async () => {
  const f = postingFixture()
  const prepared = await preparePurchaseStockReceiptsInTransaction(
    f.tx,
    f.scope,
  )
  const replaceFirst = (patch: Partial<SingleBalanceInput>) =>
    f.commands.map((command, index) =>
      index ? command : { ...command, ...patch },
    )
  const invalid = [
    f.commands.slice(1),
    [f.commands[0]!, ...f.commands.slice(0, 9)],
    replaceFirst({ balanceSourceId: "foreign" }),
    replaceFirst({ enteredQuantity: "3" }),
    replaceFirst({ expectedBalanceRevision: 4 }),
    replaceFirst({ actorUserId: "other" }),
    replaceFirst({ effectiveAt: undefined }),
    replaceFirst({ effectiveAt: new Date("2026-10-05") }),
    replaceFirst({ clientOperationId: f.commands[1]!.clientOperationId }),
    replaceFirst({ unitCostMinor: 100 }),
  ]
  for (const commands of invalid)
    expect(() => prepared.execute(commands)).toThrow()
  expect(f.posting.queries).toHaveLength(0)
})

test("batch refuses preexisting identity, stale CAS and incomplete or changed saved movements", async () => {
  for (const flag of [
    "prior",
    "stale",
    "partial",
    "incomplete",
    "changedMovement",
  ] as const) {
    const f = postingFixture()
    f.posting[flag] = true
    const prepared = await preparePurchaseStockReceiptsInTransaction(
      f.tx,
      f.scope,
    )
    await expect(prepared.execute(f.commands)).rejects.toThrow()
    if (flag === "prior") expect(f.posting.queries).toEqual(["identities"])
    if (flag === "stale" || flag === "partial")
      expect(f.posting.queries).toEqual(["identities", "balances-CAS"])
  }
})
