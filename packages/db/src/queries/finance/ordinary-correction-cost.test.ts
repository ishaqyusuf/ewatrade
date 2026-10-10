import { expect, test } from "bun:test"
import { calculateOrdinaryCorrectionCost } from "./ordinary-correction-cost"
const input = {
  originalEffectNegative: true,
  originalSourceCostMinor: 200n,
  valueBeforeMinor: 800n,
  unknownReason: null,
  inverseCanonicalBefore: "8",
  originalCanonical: "2",
  replacementEffect: "-3",
  inverseAfterCanonical: "10",
  replacementCanonical: "3",
}
test("correction restores original issue cost then prices replacement at weighted average", () => {
  const result = calculateOrdinaryCorrectionCost(input)
  expect(result.inverseValue).toMatchObject({ valueBeforeMinor: 800n, valueDeltaMinor: 200n, valueAfterMinor: 1000n })
  expect(result.replacementValue).toMatchObject({ sourceCostMinor: 300n, valueDeltaMinor: -300n, valueAfterMinor: 700n, unknownReason: null })
})
test("missing original issue cost propagates unknown instead of guessing", () => {
  const result = calculateOrdinaryCorrectionCost({ ...input, originalSourceCostMinor: null })
  expect(result.inverseValue.valueAfterMinor).toBeNull()
  expect(result.replacementValue).toMatchObject({ valueAfterMinor: null, unknownReason: "PRIOR_UNKNOWN_COST" })
})
test("a replacement increase is uncosted even when the reversed receipt pool was known", () => {
  const result = calculateOrdinaryCorrectionCost({ ...input, originalEffectNegative: false, inverseCanonicalBefore: "10", originalCanonical: "2", inverseAfterCanonical: "8", replacementEffect: "3" })
  expect(result.inverseValue.valueAfterMinor).toBe(640n)
  expect(result.replacementValue).toMatchObject({ sourceCostMinor: null, valueAfterMinor: null, unknownReason: "UNCAPTURED_MOVEMENTS" })
})
test("known restored issue cost cannot make an unknown pool known", () => {
  const result = calculateOrdinaryCorrectionCost({ ...input, valueBeforeMinor: null, unknownReason: "UNCAPTURED_MOVEMENTS" })
  expect(result.inverseValue.sourceCostMinor).toBe(200n)
  expect(result.replacementValue.valueAfterMinor).toBeNull()
})
