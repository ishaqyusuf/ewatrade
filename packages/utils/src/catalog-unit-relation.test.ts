import { describe, expect, test } from "bun:test"

import { CATALOG_SETUP_HELPERS } from "./catalog-setup-helpers"
import {
  catalogUnitFactorToRelation,
  catalogUnitRelationToFactor,
  transposeCatalogUnitRelation,
} from "./catalog-unit-relation"

describe("catalog unit relationships", () => {
  test.each([
    ["0.02", "50"],
    ["0.25", "4"],
    ["0.001", "1000"],
  ])(
    "presents stored factor %s as added units per main unit",
    (factor, count) => {
      const relation = catalogUnitFactorToRelation(factor)

      expect(relation).toEqual({
        count,
        direction: "units_per_canonical",
      })
      expect(String(catalogUnitRelationToFactor(relation))).toBe(factor)
    },
  )

  test.each(["12", "144"])(
    "keeps larger-unit factor %s in the main-units-per-added-unit direction",
    (factor) => {
      const relation = catalogUnitFactorToRelation(factor)

      expect(relation).toEqual({
        count: factor,
        direction: "canonical_per_unit",
      })
      expect(String(catalogUnitRelationToFactor(relation))).toBe(factor)
    },
  )

  test("uses the transposed direction for an equivalent factor of one", () => {
    expect(catalogUnitFactorToRelation("1")).toEqual({
      count: "1",
      direction: "units_per_canonical",
    })
  })

  test("can explicitly transpose an exact relationship", () => {
    expect(
      transposeCatalogUnitRelation(
        { count: "50", direction: "units_per_canonical" },
        "canonical_per_unit",
      ),
    ).toEqual({ count: "0.02", direction: "canonical_per_unit" })
    expect(
      transposeCatalogUnitRelation(
        { count: "0.02", direction: "canonical_per_unit" },
        "units_per_canonical",
      ),
    ).toEqual({ count: "50", direction: "units_per_canonical" })
  })

  test("does not round an inexact reciprocal", () => {
    expect(() =>
      catalogUnitRelationToFactor({
        count: "3",
        direction: "units_per_canonical",
      }),
    ).toThrow("cannot be represented exactly")
  })

  test("falls back to the stored-factor direction for an inexact reciprocal", () => {
    expect(catalogUnitFactorToRelation("0.333333333333")).toEqual({
      count: "0.333333333333",
      direction: "canonical_per_unit",
    })
  })

  test("round-trips every product quick-setup factor", () => {
    for (const helper of CATALOG_SETUP_HELPERS) {
      if (helper.kind !== "product") continue

      for (const unit of helper.setup.units) {
        const relation = catalogUnitFactorToRelation(unit.factor)
        expect(String(catalogUnitRelationToFactor(relation))).toBe(unit.factor)
      }
    }
  })

  test.each(["", "0", "-1", "not-a-number"])(
    "rejects invalid count %p",
    (count) => {
      expect(() =>
        catalogUnitRelationToFactor({
          count,
          direction: "units_per_canonical",
        }),
      ).toThrow()
    },
  )
})
