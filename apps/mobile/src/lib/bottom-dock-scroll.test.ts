import { describe, expect, test } from "bun:test"
import {
  initialBottomDockScrollState,
  nextBottomDockScrollState,
} from "./bottom-dock-scroll"

function scroll(offsets: number[], contentHeight = 1200, viewportHeight = 500) {
  return offsets.reduce(
    (state, y) =>
      nextBottomDockScrollState(state, { y, contentHeight, viewportHeight }),
    initialBottomDockScrollState(),
  )
}

describe("bottom dock scroll intent", () => {
  test("slow small movements accumulate into a deliberate hide", () => {
    expect(scroll([40, 44, 48, 52, 56, 60, 64]).hidden).toBe(false)
    expect(scroll([40, 44, 48, 52, 56, 60, 64, 68]).hidden).toBe(true)
  })
  test("tiny direction reversals do not flicker the dock", () => {
    expect(scroll([40, 80, 78, 81, 79, 82]).hidden).toBe(true)
    expect(scroll([40, 80, 76, 72, 68]).hidden).toBe(false)
  })
  test("both edges stay visible through native overscroll and rebound", () => {
    expect(scroll([40, 100, 700, 740, 700]).hidden).toBe(false)
    expect(scroll([40, 100, 0, -80, 0]).hidden).toBe(false)
  })
  test("short content and restored scroll positions start visible", () => {
    expect(scroll([0, 40, 0], 300).hidden).toBe(false)
    expect(scroll([300]).hidden).toBe(false)
  })
  test("pagination/content growth does not become scroll intent", () => {
    const hidden = scroll([40, 80])
    const resized = nextBottomDockScrollState(hidden, {
      y: 90,
      contentHeight: 2000,
      viewportHeight: 500,
    })
    expect(resized.hidden).toBe(true)
    expect(resized.travel).toBe(0)
  })
})
