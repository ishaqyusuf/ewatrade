import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import { listInventoryCompatibleTotalsPage } from "./inventory-compatible-pages"
import {
  getInventoryBalanceSource,
  listInventoryBalanceReport,
} from "./inventory-reporting"

test("exact source reads bind tenant, Store and ID without scanning, initializing or leaking unrelated fields", async () => {
  const rows = [
    { ...source("wanted"), privateProviderSecret: "withheld" },
    {
      ...source("elsewhere", { store: "other" }),
      privateProviderSecret: "withheld",
    },
    {
      ...source("foreign"),
      tenantId: "foreign",
      privateProviderSecret: "withheld",
    },
  ]
  const predicates: unknown[] = []
  let effects = 0
  const db = new Proxy(
    {
      stockBalanceSource: new Proxy(
        {
          async findFirst(args: {
            where: { id: string; tenantId: string; storeId: string }
            include: unknown
          }) {
            predicates.push(args.where)
            expect(args.include).toHaveProperty("inventoryUnit")
            return (
              rows.find(
                (row) =>
                  row.id === args.where.id &&
                  row.tenantId === args.where.tenantId &&
                  row.storeId === args.where.storeId,
              ) ?? null
            )
          },
        },
        {
          get(target, key) {
            if (key === "findFirst") return target.findFirst
            effects++
            throw Error("Only the exact source query is allowed")
          },
        },
      ),
    },
    {
      get(target, key) {
        if (key === "stockBalanceSource") return target.stockBalanceSource
        effects++
        throw Error("No transaction, writes or other delegates")
      },
    },
  )
  // Partial delegates intentionally represent an inert database transport,
  // not a production PrismaClient or real SQL acceptance.
  const read = (id: string): Promise<unknown> =>
    Reflect.apply(getInventoryBalanceSource, undefined, [
      db,
      { tenantId: "tenant", storeId: "store", balanceSourceId: id },
    ])
  const exact = await read("wanted")
  expect(exact).toEqual({
    availableQuantity: "2",
    balanceSourceId: "wanted",
    catalogItemId: "item",
    custodyReferenceId: null,
    custodyType: "STORE",
    configurationVersionId: "config-a",
    inventoryUnitFactor: "1",
    inventoryUnitId: "unit-wanted",
    inventoryUnitName: "Piece",
    inventoryUnitTransactionScale: 3,
    kind: "SHARED_POOL",
    onHandQuantity: "2",
    productId: "product",
    productName: "Eggs",
    reservedQuantity: "0",
    revision: 1,
    storeId: "store",
    storeName: "Shop",
    variantId: "variant",
    variantName: "Large",
  })
  for (const id of ["elsewhere", "foreign", "missing"])
    expect(await read(id)).toBeNull()
  expect(predicates).toEqual(
    ["wanted", "elsewhere", "foreign", "missing"].map((id) => ({
      id,
      tenantId: "tenant",
      storeId: "store",
    })),
  )
  expect(effects).toBe(0)
})

test("exact source reuses report arithmetic, preserving large decimals and nonavailable transit", async () => {
  for (const custody of ["STORE", "STAFF", "SESSION", "TRANSIT"]) {
    const row = source("exact", {
      custody,
      onHand: "9007199254740993.125",
      reserved: "0.125",
      factor: "24",
    })
    const result: unknown = await Reflect.apply(
      getInventoryBalanceSource,
      undefined,
      [
        { stockBalanceSource: { findFirst: async () => row } },
        { tenantId: "tenant", storeId: "store", balanceSourceId: "exact" },
      ],
    )
    expect(result).toMatchObject({
      onHandQuantity: "9007199254740993.125",
      reservedQuantity: "0.125",
      availableQuantity: custody === "TRANSIT" ? "0" : "9007199254740993",
      inventoryUnitFactor: "24",
      custodyType: custody,
    })
  }
})

function source(
  id: string,
  patch: {
    config?: string
    custody?: string
    store?: string
    factor?: string
    onHand?: string
    reserved?: string
  } = {},
) {
  return {
    id,
    tenantId: "tenant",
    storeId: patch.store ?? "store",
    productId: "product",
    variantId: "variant",
    inventoryUnitId: `unit-${id}`,
    revision: 1,
    custodyType: patch.custody ?? "STORE",
    custodyReferenceId: patch.custody === "TRANSIT" ? "transfer" : "",
    kind: "SHARED_POOL",
    onHandQuantity: new Prisma.Decimal(patch.onHand ?? "2"),
    reservedQuantity: new Prisma.Decimal(patch.reserved ?? "0"),
    product: { catalogItem: { id: "item", name: "Eggs" } },
    variant: { name: "Large" },
    store: { name: "Shop" },
    inventoryUnit: {
      name: "Piece",
      factor: new Prisma.Decimal(patch.factor ?? "1"),
      transactionScale: 3,
      configurationVersionId: patch.config ?? "config-a",
    },
  }
}
const report = async (rows: ReturnType<typeof source>[]) =>
  listInventoryBalanceReport(
    {
      stockBalanceSource: { findMany: async () => rows },
    } as unknown as Parameters<typeof listInventoryBalanceReport>[0],
    { tenantId: "tenant", includeCompatibleTotals: true },
  )

test("converted transit stock remains on hand but is never available to sell", async () => {
  const result = await report([
    source("transit", { custody: "TRANSIT", factor: "24" }),
  ])
  expect(result.rows[0]?.availableQuantity).toBe("0")
  expect(result.compatibleCanonicalTotals[0]?.onHandCanonicalQuantity).toBe(
    "48",
  )
  expect(result.compatibleCanonicalTotals[0]?.availableCanonicalQuantity).toBe(
    "0",
  )
})

test("converted totals separate configuration generations and preserve large exact decimals", async () => {
  const result = await report([
    source("piece", { onHand: "9007199254740993.125", reserved: "0.125" }),
    source("crate", { factor: "24", reserved: "1" }),
    source("new-config", { config: "config-b", onHand: "7" }),
    source("other-store", { store: "other", onHand: "3" }),
  ])
  expect(result.compatibleCanonicalTotals).toHaveLength(3)
  const old = result.compatibleCanonicalTotals.find((group) =>
    group.components.some((row) => row.balanceSourceId === "piece"),
  )
  expect(old?.components).toHaveLength(2)
  expect(old?.onHandCanonicalQuantity).toBe("9007199254741041.125")
  expect(old?.reservedCanonicalQuantity).toBe("24.125")
  expect(old?.availableCanonicalQuantity).toBe("9007199254741017")
  expect(old?.informationalOnly).toBe(true)
})

test("compatible pagination aggregates all sources before limiting groups", async () => {
  const rows = Array.from({ length: 51 }, (_, i) =>
    source(`source-${i}`, { onHand: "2" }),
  )
  rows.push(source("other", { config: "config-b", onHand: "7" }))
  const db = {
    stockBalanceSource: { findMany: async () => rows },
    inventoryUnit: {
      findMany: async () => [
        { id: "a", name: "Piece", configurationVersionId: "config-a" },
        { id: "b", name: "Bird", configurationVersionId: "config-b" },
      ],
    },
  } as unknown as Parameters<typeof listInventoryCompatibleTotalsPage>[0]
  const first = await listInventoryCompatibleTotalsPage(db, {
    tenantId: "tenant",
    storeId: "store",
    limit: 1,
  })
  if (!first.nextCursor) throw Error("Expected the next compatible group")
  const second = await listInventoryCompatibleTotalsPage(db, {
    tenantId: "tenant",
    storeId: "store",
    limit: 1,
    cursor: first.nextCursor,
  })
  expect(first.items[0]?.sourceCount).toBe(51)
  expect(first.items[0]?.onHandCanonicalQuantity).toBe("102")
  expect(first.items[0]?.canonicalUnitName).toBe("Piece")
  expect(second.items[0]?.onHandCanonicalQuantity).toBe("7")
  expect(second.items[0]?.canonicalUnitName).toBe("Bird")
  expect(second.nextCursor).toBeNull()
  await expect(
    listInventoryCompatibleTotalsPage(db, {
      tenantId: "tenant",
      storeId: "store",
      cursor: "foreign",
    }),
  ).rejects.toThrow("totals changed")
})
