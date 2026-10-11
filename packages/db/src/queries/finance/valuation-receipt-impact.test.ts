import { expect, test } from "bun:test"
import type { FinanceInventoryPool } from "../../../generated/prisma/client"
import { calculatePurchaseReceiptValuation } from "./valuation-receipt-impact"
const date = new Date("2026-09-30T12:00:00.123Z")
const base = {
  quantityBefore: "0",
  canonicalEffect: "2.125",
  quantityAfter: "2.125",
  sourceCostMinor: 125n,
  effectiveAt: date,
  movementCount: 1,
  pool: null,
}
const pool = (change: Partial<FinanceInventoryPool> = {}) =>
  ({
    quantity: { toFixed: () => "4" },
    valueMinor: 400n,
    unknownReason: null,
    lastMovementCount: 7n,
    lastSequence: 6n,
    latestEffectiveAt: new Date("2026-09-20"),
    ...change,
  }) as Pick<
    FinanceInventoryPool,
    | "quantity"
    | "valueMinor"
    | "unknownReason"
    | "lastMovementCount"
    | "lastSequence"
    | "latestEffectiveAt"
  >

test("known zero opening receives the exact original cost and decimal effect", () => {
  expect(calculatePurchaseReceiptValuation(base)).toMatchObject({
    status: "KNOWN",
    valueBeforeMinor: 0n,
    valueAfterMinor: 125n,
    valueDeltaMinor: 125n,
    canonicalEffect: "2.125",
    sequence: 1n,
    unknownReason: null,
  })
  expect(
    calculatePurchaseReceiptValuation({
      ...base,
      quantityBefore: "9007199254740993",
      canonicalEffect: "0.000000000000000001",
      quantityAfter: "9007199254740993.000000000000000001",
    }).quantityAfter,
  ).toBe("9007199254740993.000000000000000001")
})
test("known sequential pool extends exactly; stock reservations need no invented cost", () => {
  expect(
    calculatePurchaseReceiptValuation({
      ...base,
      quantityBefore: "4",
      quantityAfter: "6.125",
      movementCount: 8,
      pool: pool(),
    }),
  ).toMatchObject({
    status: "KNOWN",
    valueBeforeMinor: 400n,
    valueAfterMinor: 525n,
    sequence: 7n,
  })
})
test("missing opening, zero-net gaps, stale pool and prior unknown stay unknown despite known receipt cost", () => {
  for (const [input, reason] of [
    [
      { ...base, quantityBefore: "5", quantityAfter: "7.125" },
      "MISSING_OPENING_COST",
    ],
    [{ ...base, movementCount: 3 }, "UNCAPTURED_MOVEMENTS"],
    [
      {
        ...base,
        quantityBefore: "4",
        quantityAfter: "6.125",
        movementCount: 9,
        pool: pool(),
      },
      "UNCAPTURED_MOVEMENTS",
    ],
    [
      {
        ...base,
        quantityBefore: "3",
        quantityAfter: "5.125",
        movementCount: 8,
        pool: pool(),
      },
      "UNCAPTURED_MOVEMENTS",
    ],
    [
      {
        ...base,
        quantityBefore: "4",
        quantityAfter: "6.125",
        movementCount: 8,
        pool: pool({ valueMinor: null, unknownReason: "MISSING_OPENING_COST" }),
      },
      "MISSING_OPENING_COST",
    ],
  ] as const)
    expect(calculatePurchaseReceiptValuation(input)).toMatchObject({
      status: "UNKNOWN",
      sourceCostMinor: 125n,
      valueBeforeMinor: null,
      valueAfterMinor: null,
      valueDeltaMinor: null,
      unknownReason: reason,
    })
})
test("impact rejects zero/mismatched effects, unsafe counts, chronology and monetary/sequence bounds", () => {
  for (const change of [
    { canonicalEffect: "0", quantityAfter: "0" },
    { quantityAfter: "3" },
    { movementCount: 0 },
    { movementCount: Number.MAX_SAFE_INTEGER + 1 },
    { sourceCostMinor: 0n },
    { effectiveAt: new Date("2026-09-01"), pool: pool() },
    { pool: pool({ lastSequence: 9223372036854775807n }) },
    {
      quantityBefore: "4",
      quantityAfter: "6.125",
      movementCount: 8,
      pool: pool({ valueMinor: -1n }),
    },
    {
      quantityBefore: "4",
      quantityAfter: "6.125",
      movementCount: 8,
      pool: pool({ valueMinor: 9223372036854775807n }),
    },
  ])
    expect(() =>
      calculatePurchaseReceiptValuation({ ...base, ...change }),
    ).toThrow()
})
