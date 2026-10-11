import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { productReturnDestinationImpact } from "./product-return-destination-impact"
const date = new Date("2026-09-15T00:00:00Z")
const pool = { quantity: new Prisma.Decimal("4"), valueMinor: 200n, unknownReason: null, lastMovementCount: 1n, lastSequence: 2n, latestEffectiveAt: date }
const input = { pool, before: "4", movementCount: 2, effectiveAt: date, sourceCostMinor: 50n, sourceUnknownReason: null }

test("reconciled destination adds original cost without repricing", () => {
  expect(productReturnDestinationImpact(input)).toEqual({ valueBeforeMinor: 200n, valueAfterMinor: 250n, sequence: 3n, resolvedUnknown: null, movementCountExact: 2n })
})
test("empty first movement has zero opening value; missing nonempty history stays unknown", () => {
  expect(productReturnDestinationImpact({ ...input, pool: null, before: "0", movementCount: 1 })).toMatchObject({ valueBeforeMinor: 0n, valueAfterMinor: 50n })
  expect(productReturnDestinationImpact({ ...input, pool: null })).toMatchObject({ valueBeforeMinor: null, valueAfterMinor: null, resolvedUnknown: "MISSING_OPENING_COST" })
})
test("untracked movements and unknown original cost remain explicit", () => {
  expect(productReturnDestinationImpact({ ...input, movementCount: 3 })).toMatchObject({ valueAfterMinor: null, resolvedUnknown: "UNCAPTURED_MOVEMENTS" })
  expect(productReturnDestinationImpact({ ...input, sourceCostMinor: null, sourceUnknownReason: "MISSING_ISSUE_COST" })).toMatchObject({ valueBeforeMinor: 200n, valueAfterMinor: null, resolvedUnknown: "MISSING_ISSUE_COST" })
})
test("chronology, history count and value overflow fail", () => {
  expect(() => productReturnDestinationImpact({ ...input, effectiveAt: new Date("2026-09-14") })).toThrow("cannot precede")
  expect(() => productReturnDestinationImpact({ ...input, movementCount: 0 })).toThrow("cannot be counted")
  expect(() => productReturnDestinationImpact({ ...input, sourceCostMinor: 9223372036854775807n })).toThrow("exceeds its limit")
})
