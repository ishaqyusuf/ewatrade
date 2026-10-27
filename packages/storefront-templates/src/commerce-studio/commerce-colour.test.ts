import { describe, expect, test } from "bun:test"
import { accentInk, contrastRatio, readableOn } from "./commerce"

describe("accent colours", () => {
  test("text on the accent picks whichever of light or dark reads better", () => {
    expect(readableOn("#8b4b35")).toBe("#ffffff")
    expect(readableOn("#f2c94c")).toBe("#1c211e")
    // Mid-tone green: white was chosen before at 3.4:1; dark text reaches 4.5:1.
    expect(readableOn("#3a9d5d")).toBe("#1c211e")
    for (const accent of ["#8b4b35", "#f2c94c", "#3a9d5d", "#1d5c4d"])
      expect(contrastRatio(readableOn(accent), accent)).toBeGreaterThanOrEqual(
        4.5,
      )
  })

  test("accent ink keeps a dark-enough accent and darkens a light one", () => {
    expect(accentInk("#8b4b35", "#f7f5ef")).toBe("#8b4b35")
    const ink = accentInk("#f2c94c", "#f7f5ef")
    expect(ink).not.toBe("#f2c94c")
    expect(contrastRatio(ink, "#f7f5ef")).toBeGreaterThanOrEqual(4.5)
  })

  test("accent ink lightens on a dark background", () => {
    const ink = accentInk("#1d5c4d", "#101412")
    expect(contrastRatio(ink, "#101412")).toBeGreaterThanOrEqual(4.5)
  })

  test("invalid colours fall back safely", () => {
    expect(readableOn("teal")).toBe("#ffffff")
    expect(accentInk("teal", "#ffffff")).toBe("teal")
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0)
  })
})
