import { expect, test } from "bun:test"
import { groupInventoryStores } from "./inventory-store-totals"
const base = {
  balanceSourceId: "main",
  productId: "eggs",
  variantId: "big",
  inventoryUnitId: "egg",
  configurationVersionId: "v1",
  custodyType: "STORE",
  custodyReferenceId: null,
  storeId: "main",
  storeName: "Main store",
  onHandQuantity: "80.000000000000000001",
  reservedQuantity: "5",
  availableQuantity: "75.000000000000000001",
}
test("combines exact balances once and retains individual store identities", () => {
  const second = {
    ...base,
    balanceSourceId: "branch",
    storeId: "branch",
    storeName: "Branch",
    onHandQuantity: "20",
    reservedQuantity: "0",
    availableQuantity: "20",
  }
  const [group] = groupInventoryStores([base, second])
  expect(group?.onHandQuantity).toBe("100.000000000000000001")
  expect(group?.availableQuantity).toBe("95.000000000000000001")
  expect(group?.storeBalances.map((row) => row.balanceSourceId)).toEqual([
    "main",
    "branch",
  ])
  expect(base.onHandQuantity).toBe("80.000000000000000001")
})
test("never combines different variants, units, configurations or custody, and excludes transit from availability", () => {
  const groups = groupInventoryStores([
    base,
    { ...base, variantId: "small" },
    { ...base, inventoryUnitId: "pack" },
    { ...base, configurationVersionId: "v2" },
    { ...base, custodyType: "TRANSIT", custodyReferenceId: "transfer1" },
  ])
  expect(groups).toHaveLength(5)
  expect(
    groups.find((row) => row.custodyType === "TRANSIT")?.availableQuantity,
  ).toBe("0")
})
