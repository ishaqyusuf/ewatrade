import { describe, expect, test } from "bun:test"
import {
  availableCatalogUnitReferences,
  resolveCatalogUnitFactors,
} from "./catalog-selling-units"

const tray = {
  id: "tray",
  referenceId: "canonical",
  relationCount: "30",
  relationDirection: "canonical_per_unit" as const,
}
const carton = {
  id: "carton",
  referenceId: "tray",
  relationCount: "6",
  relationDirection: "canonical_per_unit" as const,
}
describe("Catalog selling-unit references", () => {
  test("normalizes Egg → Tray → Carton independently of list order", () => {
    const factors = resolveCatalogUnitFactors([carton, tray])
    expect(factors.get("tray")).toBe("30")
    expect(factors.get("carton")).toBe("180")
  })
  test("retains exact fractional reference relationships", () => {
    const half = {
      id: "half",
      referenceId: "tray",
      relationCount: "2",
      relationDirection: "units_per_canonical" as const,
    }
    expect(resolveCatalogUnitFactors([tray, half]).get("half")).toBe("15")
  })
  test("refuses missing references and cycles", () => {
    expect(() => resolveCatalogUnitFactors([carton])).toThrow(
      "existing reference",
    )
    expect(() =>
      resolveCatalogUnitFactors([{ ...tray, referenceId: "carton" }, carton]),
    ).toThrow("refer back")
  })
  test("refuses inexact factors and excludes descendants from choices", () => {
    expect(() =>
      resolveCatalogUnitFactors([
        {
          ...tray,
          relationCount: "3",
          relationDirection: "units_per_canonical",
        },
      ]),
    ).toThrow("represented exactly")
    expect(availableCatalogUnitReferences([tray, carton], "tray")).toEqual([])
    expect(availableCatalogUnitReferences([tray, carton], "carton")).toEqual([
      tray,
    ])
  })
})
