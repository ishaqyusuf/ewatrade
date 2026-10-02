import { describe, expect, it } from "bun:test"
import type { MobileUnitDraft } from "./catalog-setup-model"
import {
  removeSellingUnitPreservingFactors,
  resolveSellingUnitFactors,
} from "./selling-unit-relations"
function unit(
  id: string,
  count: string,
  referenceUnitId?: string,
): MobileUnitDraft {
  return {
    id,
    name: id,
    price: "",
    relationCount: count,
    relationDirection: "canonical_per_unit",
    stockBehavior: "alternate_transaction",
    transactionScale: 2,
    referenceUnitId,
  }
}
describe("draft selling-unit references", () => {
  it("normalizes tray and carton relationships without copying price or stock behavior", () => {
    const tray = {
      ...unit("tray", "30"),
      price: "45",
      stockBehavior: "packaged_stock" as const,
    }
    const carton = { ...unit("carton", "6", "tray"), price: "250" }
    const factors = resolveSellingUnitFactors([tray, carton])
    expect(factors.get("tray")).toBe("30")
    expect(factors.get("carton")).toBe("180")
    expect(carton.price).toBe("250")
    expect(carton.stockBehavior).toBe("alternate_transaction")
  })
  it("updates descendant factors when an ancestor count changes", () => {
    expect(
      resolveSellingUnitFactors([
        unit("tray", "20"),
        unit("carton", "6", "tray"),
      ]).get("carton"),
    ).toBe("120")
  })
  it("retains canonical quantity when removing a reference parent", () => {
    const next = removeSellingUnitPreservingFactors(
      [
        unit("tray", "30"),
        unit("carton", "6", "tray"),
        unit("pallet", "10", "carton"),
      ],
      "tray",
    )
    expect(next.find((u) => u.id === "carton")?.referenceUnitId).toBeUndefined()
    expect(resolveSellingUnitFactors(next).get("carton")).toBe("180")
    expect(resolveSellingUnitFactors(next).get("pallet")).toBe("1800")
  })
  it("rejects missing parents and reference cycles", () => {
    expect(() =>
      resolveSellingUnitFactors([unit("carton", "6", "missing")]),
    ).toThrow("no longer exists")
    expect(() =>
      resolveSellingUnitFactors([
        unit("tray", "2", "carton"),
        unit("carton", "6", "tray"),
      ]),
    ).toThrow("circle")
  })
  it("keeps fractional conversions exact and rejects values requiring rounding", () => {
    const small = {
      ...unit("small", "2"),
      relationDirection: "units_per_canonical" as const,
    }
    expect(
      resolveSellingUnitFactors([small, unit("pack", "5", "small")]).get(
        "pack",
      ),
    ).toBe("2.5")
    expect(() =>
      resolveSellingUnitFactors([{ ...small, relationCount: "3" }]),
    ).toThrow()
  })
})
