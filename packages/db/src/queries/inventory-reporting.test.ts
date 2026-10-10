import { expect, test } from "bun:test"
import { listInventoryCompatibleTotalsPage } from "./inventory-compatible-pages"
import { listInventoryBalanceReport } from "./inventory-reporting"

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
    onHandQuantity: patch.onHand ?? "2",
    reservedQuantity: patch.reserved ?? "0",
    product: { catalogItem: { id: "item", name: "Eggs" } },
    variant: { name: "Large" },
    store: { name: "Shop" },
    inventoryUnit: {
      name: "Piece",
      factor: patch.factor ?? "1",
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
  const second = await listInventoryCompatibleTotalsPage(db, {
    tenantId: "tenant",
    storeId: "store",
    limit: 1,
    cursor: first.nextCursor!,
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
