import { expect, test } from "bun:test"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { Prisma } from "../../generated/prisma/client"
import {
  preparePurchaseStockReceiptInTransaction,
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
    configurationVersion: { status: "CURRENT" },
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
