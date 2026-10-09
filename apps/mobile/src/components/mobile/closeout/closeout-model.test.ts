import { expect, test } from "bun:test"
import { type CustodyBalance, closeoutLines } from "./closeout-model"
const balance: CustodyBalance = {
  availableQuantity: "500",
  balanceSourceId: "balance",
  configurationVersionId: "version",
  custodyReferenceId: null,
  custodyType: "STORE",
  inventoryUnitFactor: "1",
  inventoryUnitId: "unit",
  inventoryUnitName: "birds",
  inventoryUnitTransactionScale: 0,
  kind: "SHARED_POOL",
  onHandQuantity: "500",
  productId: "layers",
  productName: "Layers",
  reservedQuantity: "0",
  revision: 0,
  storeId: "store",
  storeName: "Farm",
  variantId: "variant",
  variantName: "Layers",
}

test("counts start at the expected balance and preserve exact variance", () => {
  expect(closeoutLines([balance], {})[0]).toMatchObject({
    declaredQuantity: "500",
    variance: "0",
    error: null,
  })
  expect(
    closeoutLines(
      [
        {
          ...balance,
          onHandQuantity: "9007199254740993.5",
          inventoryUnitTransactionScale: 1,
        },
      ],
      { balance: "9007199254740992.4" },
    )[0],
  ).toMatchObject({ variance: "-1.1", error: null })
})
test("invalid counts do not become an apparent matching or negative count", () => {
  for (const value of ["", "-1", "2.5", "abc"]) {
    const line = closeoutLines([balance], { balance: value })[0]
    expect(line?.declaredQuantity).toBeNull()
    expect(line?.variance).toBeNull()
    expect(line?.error).toContain("whole quantity")
  }
})
