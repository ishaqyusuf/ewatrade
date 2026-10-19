import { expect, test } from "bun:test"
import {
  type PackTargetInput,
  derivePackTargetResult,
} from "@ewatrade/assistant/general/stock-transform"
import {
  ExactDecimalError,
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

const base: PackTargetInput = {
  sourceQuantity: "2",
  sourceFactor: "30",
  sourceScale: 0,
  targetFactor: "1",
  targetScale: 0,
  sourceUnitName: "crate",
  targetUnitName: "piece",
}

test("shared pack arithmetic derives the correct direction and exact canonical conservation without floating point", () => {
  const examples: Array<{
    input: PackTargetInput
    source: string
    target: string
    canonical: string
  }> = [
    { input: base, source: "2", target: "60", canonical: "60" },
    {
      input: {
        ...base,
        sourceQuantity: "45",
        sourceFactor: "1",
        targetFactor: "30",
        targetScale: 1,
      },
      source: "45",
      target: "1.5",
      canonical: "45",
    },
    {
      input: {
        ...base,
        sourceQuantity: "0.1",
        sourceScale: 1,
        sourceFactor: "0.2",
        targetFactor: "0.01",
      },
      source: "0.1",
      target: "2",
      canonical: "0.02",
    },
    {
      input: {
        ...base,
        sourceQuantity: "999999999999",
        sourceFactor: "1000000000",
      },
      source: "999999999999",
      target: "999999999999000000000",
      canonical: "999999999999000000000",
    },
    {
      input: {
        ...base,
        sourceQuantity: " 0001.2500000 ",
        sourceScale: 2,
        sourceFactor: "1",
        targetFactor: "4",
        targetScale: 4,
      },
      source: "1.25",
      target: "0.3125",
      canonical: "1.25",
    },
  ]
  for (const { input, source, target, canonical } of examples) {
    const before = { ...input }
    const result = derivePackTargetResult(input)
    expect(result).toEqual({
      ok: true,
      value: {
        sourceQuantity: source,
        targetQuantity: target,
        canonical: parseExactDecimal(canonical),
      },
    })
    if (!result.ok) throw Error("Expected exact supported conversion")
    expect(
      multiplyExactDecimals(result.value.targetQuantity, input.targetFactor),
    ).toBe(result.value.canonical)
    expect(input).toEqual(before)
  }
})

test("source precision and malformed/zero/negative/exponent inputs retain exact source refusal text", () => {
  for (const sourceQuantity of [
    "1.5",
    "0",
    "-1",
    "1e3",
    "NaN",
    "Infinity",
    "",
    "1,000",
  ]) {
    expect(derivePackTargetResult({ ...base, sourceQuantity })).toEqual({
      ok: false,
      refused: `${sourceQuantity} cannot be represented in crate.`,
    })
  }
  expect(
    derivePackTargetResult({
      ...base,
      sourceQuantity: "0.000001",
      sourceScale: 5,
    }),
  ).toEqual({ ok: false, refused: "0.000001 cannot be represented in crate." })
})

test("target scale boundaries and inexact division refuse without rounding using the exact existing wording", () => {
  expect(
    derivePackTargetResult({
      ...base,
      sourceQuantity: "45",
      sourceFactor: "1",
      targetFactor: "30",
      sourceUnitName: "piece",
      targetUnitName: "crate",
    }),
  ).toEqual({ ok: false, refused: "45 piece does not make whole crate." })
  const fraction: PackTargetInput = {
    ...base,
    sourceQuantity: "1",
    sourceFactor: "1",
    targetFactor: "4",
    targetScale: 2,
    sourceUnitName: "piece",
    targetUnitName: "tray",
  }
  expect(derivePackTargetResult(fraction)).toEqual({
    ok: true,
    value: {
      sourceQuantity: "1",
      targetQuantity: "0.25",
      canonical: parseExactDecimal("1"),
    },
  })
  expect(derivePackTargetResult({ ...fraction, targetScale: 1 })).toEqual({
    ok: false,
    refused: "1 piece cannot be represented in tray.",
  })
  expect(
    derivePackTargetResult({ ...fraction, targetFactor: "3", targetScale: 6 }),
  ).toEqual({ ok: false, refused: "1 piece cannot be represented in tray." })
  expect(derivePackTargetResult({ ...fraction, targetFactor: "0" })).toEqual({
    ok: false,
    refused: "1 piece cannot be represented in tray.",
  })
  expect(derivePackTargetResult({ ...fraction, sourceFactor: "0" })).toEqual({
    ok: false,
    refused: "1 piece does not make any tray.",
  })
  expect(derivePackTargetResult({ ...fraction, sourceFactor: "-1" })).toEqual({
    ok: false,
    refused: "1 piece does not make any tray.",
  })
})

test("six-place quantities and twelve-place configured factors retain exact eighteen-place canonical values", () => {
  const input: PackTargetInput = {
    ...base,
    sourceQuantity: "999999999999.999999",
    sourceFactor: "0.000000000001",
    sourceScale: 6,
    targetFactor: "0.000000000001",
    targetScale: 6,
  }
  expect(derivePackTargetResult(input)).toEqual({
    ok: true,
    value: {
      sourceQuantity: "999999999999.999999",
      targetQuantity: "999999999999.999999",
      canonical: parseExactDecimal("0.999999999999999999"),
    },
  })
  expect(
    derivePackTargetResult({
      ...base,
      sourceQuantity: "0.000001",
      sourceScale: 6,
      sourceFactor: "1",
      targetScale: 6,
    }),
  ).toEqual({
    ok: true,
    value: {
      sourceQuantity: "0.000001",
      targetQuantity: "0.000001",
      canonical: parseExactDecimal("0.000001"),
    },
  })
  expect(
    derivePackTargetResult({
      ...base,
      sourceQuantity: "0.000001",
      sourceScale: 6,
      sourceFactor: "1",
      targetScale: 5,
    }),
  ).toEqual({
    ok: false,
    refused: "0.000001 crate cannot be represented in piece.",
  })
})

test("invalid saved source-factor exceptions remain fail-closed and unchanged rather than being rounded or relabeled", () => {
  for (const sourceFactor of ["invalid", "0.0000000000000000001"]) {
    expect(() => derivePackTargetResult({ ...base, sourceFactor })).toThrow(
      ExactDecimalError,
    )
  }
})
