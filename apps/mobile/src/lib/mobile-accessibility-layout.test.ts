import { describe, expect, test } from "bun:test"
import {
  resolveDisplayTextScale,
  shouldUseLargeTextLayout,
} from "./mobile-accessibility-layout"

describe("shouldUseLargeTextLayout", () => {
  test("keeps compact phone layouts at the default font scale", () => {
    expect(shouldUseLargeTextLayout({ fontScale: 1, width: 360 })).toBe(false)
  })

  test("reflows at the Android 200 percent font scale", () => {
    expect(shouldUseLargeTextLayout({ fontScale: 2, width: 360 })).toBe(true)
  })

  test("reflows when scaled text leaves too little effective width", () => {
    expect(shouldUseLargeTextLayout({ fontScale: 1.4, width: 360 })).toBe(true)
  })

  test("normalizes invalid scale values", () => {
    expect(
      shouldUseLargeTextLayout({ fontScale: Number.NaN, width: 360 }),
    ).toBe(false)
  })

  test("caps display text while body content retains the system scale", () => {
    expect(resolveDisplayTextScale(1)).toBe(1)
    expect(resolveDisplayTextScale(1.4)).toBe(1.4)
    expect(resolveDisplayTextScale(2)).toBe(1.6)
    expect(resolveDisplayTextScale(Number.NaN)).toBe(1)
  })
})
