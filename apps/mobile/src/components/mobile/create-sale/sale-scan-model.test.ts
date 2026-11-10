import { expect, test } from "bun:test"
import {
  saleScanMatchName,
  saleScanNoticeCopy,
  scannedQuantity,
  scannedSaleChoice,
} from "./sale-scan-model"

test("a repeat scan adds exactly one, keeping decimal quantities", () => {
  expect(scannedQuantity("1")).toBe("2")
  expect(scannedQuantity("2.5")).toBe("3.5")
  expect(scannedQuantity("")).toBe("1")
  expect(scannedQuantity("x")).toBe("1")
})

test("scanned offerings resolve to an addable row or a reason", () => {
  const rows = [
    { id: "o1", name: "Oud" },
    { id: "o2", disabledReason: "Out of stock in this Store." },
  ]
  expect(scannedSaleChoice("o1", rows)).toEqual({ row: rows[0] })
  expect(scannedSaleChoice("o2", rows)).toEqual({
    reason: "Out of stock in this Store.",
  })
  expect(scannedSaleChoice("o3", rows)).toBeNull()
})

test("notices show the exact code and never present a link as an item", () => {
  expect(saleScanNoticeCopy({ kind: "unknown", code: "0012" }).message).toBe(
    "Code 0012 is not on any item in this business.",
  )
  expect(saleScanNoticeCopy({ kind: "link" }).message).toContain(
    "was not opened",
  )
  expect(
    saleScanMatchName({
      catalogItemId: "i",
      offeringId: "o",
      itemName: "Jalabiya Cream",
      variantName: "M",
      offeringName: "Default",
      unitName: "piece",
      matchedBy: "barcode",
    }),
  ).toBe("Jalabiya Cream · M")
})
