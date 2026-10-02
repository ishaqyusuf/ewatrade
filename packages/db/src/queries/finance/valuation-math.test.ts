import { describe, expect, test } from "bun:test"
import {
  addQuantities,
  calculateWeightedAverageIssue,
  normalizeQuantity,
  subtractQuantities,
} from "./valuation-math"

describe("exact weighted-average valuation math", () => {
  test("allocates fractional issues proportionally without floating point", () => {
    expect(
      calculateWeightedAverageIssue({
        quantityBefore: "3.000000000000000001",
        valueBeforeMinor: BigInt(101),
        quantityIssued: "1.000000000000000001",
      }),
    ).toEqual({
      quantityAfter: "2",
      valueIssuedMinor: BigInt(34),
      valueAfterMinor: BigInt(67),
    })
  })

  test("uses round-half-to-even for exact half-minor ties", () => {
    const roundsDownToEven = calculateWeightedAverageIssue({
      quantityBefore: "4",
      valueBeforeMinor: BigInt(2),
      quantityIssued: "1",
    })
    const roundsUpToEven = calculateWeightedAverageIssue({
      quantityBefore: "4",
      valueBeforeMinor: BigInt(6),
      quantityIssued: "1",
    })

    expect(roundsDownToEven.valueIssuedMinor).toBe(BigInt(0))
    expect(roundsUpToEven.valueIssuedMinor).toBe(BigInt(2))
  })

  test("conserves value across partitioned issues and assigns residual on depletion", () => {
    let quantityBefore = "7.25"
    let valueBeforeMinor = BigInt(1001)
    let issuedTotal = BigInt(0)

    for (const quantityIssued of ["1.2", "0.05", "3", "2.999999999999999999"]) {
      const issue = calculateWeightedAverageIssue({
        quantityBefore,
        valueBeforeMinor,
        quantityIssued,
      })
      issuedTotal += issue.valueIssuedMinor
      quantityBefore = issue.quantityAfter
      valueBeforeMinor = issue.valueAfterMinor
    }

    expect(quantityBefore).toBe("0.000000000000000001")
    const finalIssue = calculateWeightedAverageIssue({
      quantityBefore,
      valueBeforeMinor,
      quantityIssued: quantityBefore,
    })
    expect(finalIssue.quantityAfter).toBe("0")
    expect(finalIssue.valueIssuedMinor).toBe(valueBeforeMinor)
    expect(issuedTotal + finalIssue.valueIssuedMinor).toBe(BigInt(1001))
    expect(finalIssue.valueAfterMinor).toBe(BigInt(0))
  })

  test("supports Decimal(38,18) quantities and database-sized exact minor values", () => {
    const maxQuantity = "99999999999999999999.999999999999999999"
    expect(normalizeQuantity(maxQuantity)).toBe(maxQuantity)
    expect(
      calculateWeightedAverageIssue({
        quantityBefore: maxQuantity,
        valueBeforeMinor: BigInt("9007199254740993"),
        quantityIssued: "0.000000000000000001",
      }).quantityAfter,
    ).toBe("99999999999999999999.999999999999999998")

    expect(addQuantities("9007199254740993", "0.000000000000000001")).toBe(
      "9007199254740993.000000000000000001",
    )
    expect(
      subtractQuantities("1.000000000000000001", "0.000000000000000002"),
    ).toBe("0.999999999999999999")
  })

  test("normalizes exact decimals and bounds quantity arithmetic", () => {
    expect(() => normalizeQuantity("000")).toThrow()
    expect(normalizeQuantity("1.230000000000000000")).toBe("1.23")
    expect(addQuantities("0.000000000000000009", "0.000000000000000001")).toBe(
      "0.00000000000000001",
    )
    expect(() =>
      addQuantities(
        "99999999999999999999.999999999999999999",
        "0.000000000000000001",
      ),
    ).toThrow("Decimal(38,18)")
    expect(() => subtractQuantities("1", "1.000000000000000001")).toThrow(
      "cannot be negative",
    )
  })

  test("retains known zero cost and exact database-sized half-even allocation", () => {
    expect(
      calculateWeightedAverageIssue({
        quantityBefore: "2",
        valueBeforeMinor: BigInt(0),
        quantityIssued: "1",
      }),
    ).toEqual({
      quantityAfter: "1",
      valueIssuedMinor: BigInt(0),
      valueAfterMinor: BigInt(0),
    })
    const issue = calculateWeightedAverageIssue({
      quantityBefore: "2",
      valueBeforeMinor: BigInt("9223372036854775807"),
      quantityIssued: "1",
    })
    expect(issue.valueIssuedMinor).toBe(BigInt("4611686018427387904"))
    expect(issue.valueAfterMinor).toBe(BigInt("4611686018427387903"))
    expect(
      calculateWeightedAverageIssue({
        quantityBefore: issue.quantityAfter,
        valueBeforeMinor: issue.valueAfterMinor,
        quantityIssued: issue.quantityAfter,
      }).valueIssuedMinor,
    ).toBe(BigInt("4611686018427387903"))
  })

  test("rejects invalid, excessive, negative and empty-pool quantities or values", () => {
    for (const quantity of [
      "",
      " 1",
      "+1",
      "-1",
      "01",
      "1e3",
      ".5",
      "1.",
      "1.0000000000000000001",
      "100000000000000000000",
    ]) {
      expect(() => normalizeQuantity(quantity)).toThrow()
    }

    const issue = (
      quantityBefore: string,
      quantityIssued: string,
      value = BigInt(1),
    ) =>
      calculateWeightedAverageIssue({
        quantityBefore,
        valueBeforeMinor: value,
        quantityIssued,
      })

    expect(() => issue("0", "1")).toThrow("pool quantity must be positive")
    expect(() => issue("1", "0")).toThrow("Issued quantity must be positive")
    expect(() => issue("1", "1.000000000000000001")).toThrow(
      "cannot exceed the pool quantity",
    )
    expect(() => issue("1", "1", BigInt(-1))).toThrow("non-negative")
    expect(() => issue("1", "1", BigInt("9223372036854775808"))).toThrow(
      "database BigInt",
    )
  })
})
