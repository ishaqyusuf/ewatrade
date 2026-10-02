import { expect, test } from "bun:test"
import { purchaseRecognitionCategories } from "./purchase-recognition-receipt-source"
import {
  assertPurchaseRecognitionReversal,
  purchaseRecognitionPosting,
} from "./purchase-recognition-rules"

test("independent invoice, ownership and receipt timing conserves one acquisition and one payable", () => {
  const cases = [
    ["INVOICE", [], "1340", "2000"],
    ["OWNERSHIP", [], "1310", "2050"],
    ["RECEIPT", [], "1300", "2050"],
    ["OWNERSHIP", ["INVOICE"], "1310", "1340"],
    ["RECEIPT", ["INVOICE"], "1300", "1340"],
    ["RECEIPT", ["OWNERSHIP"], "1300", "1310"],
    ["INVOICE", ["OWNERSHIP"], "2050", "2000"],
    ["INVOICE", ["RECEIPT"], "2050", "2000"],
    ["RECEIPT", ["INVOICE", "OWNERSHIP"], "1300", "1310"],
    ["INVOICE", ["OWNERSHIP", "RECEIPT"], "2050", "2000"],
  ] as const
  for (const [stage, prior, debit, credit] of cases)
    expect(purchaseRecognitionPosting(stage, new Set(prior))).toEqual({
      debit,
      credit,
    })
})

test("source replay is command-owned; repeated stages and post-receipt transit are rejected", () => {
  for (const stage of ["INVOICE", "OWNERSHIP", "RECEIPT"] as const)
    expect(() => purchaseRecognitionPosting(stage, new Set([stage]))).toThrow(
      "already been recognized",
    )
  expect(() =>
    purchaseRecognitionPosting("OWNERSHIP", new Set(["RECEIPT"])),
  ).toThrow("cannot be recognized in transit")
})

test("correction ordering preserves dependents and physical receipt ownership", () => {
  expect(() =>
    assertPurchaseRecognitionReversal("INVOICE", BigInt(1), [
      BigInt(1),
      BigInt(2),
    ]),
  ).toThrow("dependent")
  expect(() =>
    assertPurchaseRecognitionReversal("RECEIPT", BigInt(2), [
      BigInt(1),
      BigInt(2),
    ]),
  ).toThrow("supplier return")
  expect(() =>
    assertPurchaseRecognitionReversal("INVOICE", BigInt(2), [
      BigInt(1),
      BigInt(2),
    ]),
  ).not.toThrow()
  expect(() =>
    assertPurchaseRecognitionReversal("OWNERSHIP", BigInt(1), [BigInt(1)]),
  ).not.toThrow()
})

test("saved category snapshots cannot smuggle malformed authority into receipt operations", () => {
  expect(purchaseRecognitionCategories([{ name: " Restock " }])).toEqual([
    { name: "restock" },
  ])
  for (const value of [
    null,
    {},
    [null],
    [{ categoryNameId: 0 }],
    [{ name: "Restock", tenantId: "foreign" }],
  ])
    expect(() => purchaseRecognitionCategories(value)).toThrow()
})
