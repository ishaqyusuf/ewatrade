import { expect, test } from "bun:test"
import { decidePackagedTransformationRestoration } from "./valuation-transformation-reversals"

const known = (value: number) => ({ value: BigInt(value), reason: null })
const unknown = {
  value: null,
  reason: "MISSING_OPENING_COST" as const,
}
const base = {
  movedValueMinor: BigInt(5),
  originalTargetKnown: true,
  originalSourceKnown: true,
  target: known(12),
  source: known(8),
  targetQuantityAfter: "6",
}

test("known restoration moves back exactly the original value", () => {
  expect(decidePackagedTransformationRestoration(base)).toEqual({
    target: {
      valueBeforeMinor: BigInt(12),
      valueDeltaMinor: BigInt(-5),
      valueAfterMinor: BigInt(7),
      unknownReason: null,
    },
    source: {
      valueBeforeMinor: BigInt(8),
      valueDeltaMinor: BigInt(5),
      valueAfterMinor: BigInt(13),
      unknownReason: null,
    },
    sourceCostMinor: BigInt(5),
  })
})

test("refuses rather than inventing value", () => {
  expect(() =>
    decidePackagedTransformationRestoration({ ...base, target: known(4) }),
  ).toThrow("less than the value the original transformation added")
  expect(() =>
    decidePackagedTransformationRestoration({ ...base, target: unknown }),
  ).toThrow("target stock value is now UNKNOWN")
  expect(() =>
    decidePackagedTransformationRestoration({ ...base, source: unknown }),
  ).toThrow("source stock value is now UNKNOWN")
  expect(() =>
    decidePackagedTransformationRestoration({
      ...base,
      target: known(6),
      targetQuantityAfter: "0",
    }),
  ).toThrow("empty target balance")
})

test("UNKNOWN originals stay UNKNOWN and an unknown target keeps the known source restoration", () => {
  expect(
    decidePackagedTransformationRestoration({
      ...base,
      movedValueMinor: null,
      originalTargetKnown: false,
      originalSourceKnown: false,
    }),
  ).toEqual({
    target: {
      valueBeforeMinor: BigInt(12),
      valueDeltaMinor: null,
      valueAfterMinor: null,
      unknownReason: "PRIOR_UNKNOWN_COST",
    },
    source: {
      valueBeforeMinor: BigInt(8),
      valueDeltaMinor: null,
      valueAfterMinor: null,
      unknownReason: "PRIOR_UNKNOWN_COST",
    },
    sourceCostMinor: null,
  })
  expect(
    decidePackagedTransformationRestoration({
      ...base,
      originalTargetKnown: false,
      target: unknown,
    }),
  ).toMatchObject({
    target: { valueAfterMinor: null, unknownReason: "MISSING_OPENING_COST" },
    source: { valueDeltaMinor: BigInt(5), valueAfterMinor: BigInt(13) },
  })
  expect(
    decidePackagedTransformationRestoration({
      ...base,
      movedValueMinor: null,
      unregisteredReason: "UNCAPTURED_MOVEMENTS",
    }).target.unknownReason,
  ).toBe("UNCAPTURED_MOVEMENTS")
})
