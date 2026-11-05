import { expect, test } from "bun:test"
import { listCatalogRunningLow } from "./catalog-running-low"

const decimal = (value: string) => ({ toFixed: () => value })

function source(
  id: string,
  name: string,
  onHand: string,
  reserved: string,
  level: string | null,
) {
  return {
    id,
    onHandQuantity: decimal(onHand),
    reservedQuantity: decimal(reserved),
    inventoryUnit: { name: "crate" },
    variant: { name: "Default" },
    product: {
      lowStockLevel: level == null ? null : decimal(level),
      catalogItem: { id: `item-${id}`, name },
    },
  }
}

function database(sources: unknown[]) {
  const calls: Array<{ where: Record<string, unknown> }> = []
  const counts: Array<{ where: Record<string, unknown> }> = []
  const db = {
    stockBalanceSource: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        calls.push(args)
        return sources
      },
    },
    catalogProduct: {
      count: async (args: { where: Record<string, unknown> }) => {
        counts.push(args)
        return counts.length === 1 ? 3 : 2
      },
    },
  }
  return { db: db as never, calls, counts }
}

test("lists loose Store stock at or below each saved level, and names out-of-stock and least-stocked products without one", async () => {
  const { db, calls, counts } = database([
    source("a", "Eggs", "40", "0", "30"),
    source("b", "Feed", "12", "2", "10"),
    source("c", "Broilers", "3", "3", "5"),
    source("d", "Turkey", "5", "0", "5"),
    source("e", "Grower feed", "0", "0", null),
    source("f", "Notebook", "8", "0", null),
    source("g", "Layers", "1495", "0", null),
  ])
  const result = await listCatalogRunningLow(db, {
    tenantId: "tenant-1",
    storeId: "store-1",
  })
  expect(calls[0]?.where).toMatchObject({
    tenantId: "tenant-1",
    storeId: "store-1",
    custodyType: "STORE",
    kind: "SHARED_POOL",
  })
  expect(counts[0]?.where).toMatchObject({ lowStockLevel: { not: null } })
  expect(counts[1]?.where).toMatchObject({ lowStockLevel: null })
  expect(result.items.map((item) => [item.productName, item.out])).toEqual([
    ["Broilers", true],
    ["Turkey", false],
    ["Feed", false],
  ])
  expect(result.items[2]).toMatchObject({
    availableQuantity: "10",
    lowStockLevel: "10",
    unitName: "crate",
  })
  expect(result.withoutLevel.out.map((item) => item.productName)).toEqual([
    "Grower feed",
  ])
  expect(
    result.withoutLevel.fewestLeft.map((item) => item.productName),
  ).toEqual(["Notebook", "Layers"])
  expect(result).toMatchObject({
    levelsSet: 3,
    levelsMissing: 2,
    partial: false,
  })
})
