import { describe, expect, test } from "bun:test"
import {
  type ScrollToTopState,
  initialScrollToTopState,
  nextScrollToTopState,
  startScrollToTop,
} from "./scroll-to-top"

function scroll(
  offsets: number[],
  state: ScrollToTopState = initialScrollToTopState(),
  contentHeight = 3000,
  viewportHeight = 800,
) {
  return offsets.reduce(
    (current, y) =>
      nextScrollToTopState(current, { y, contentHeight, viewportHeight }),
    state,
  )
}

describe("scroll to top visibility", () => {
  test("hysteresis: shows past 0.8 of a screen, stays until under 0.4", () => {
    const shown = scroll([300, 640, 700])
    expect(shown.visible).toBe(true)
    expect(scroll([500], shown).visible).toBe(true)
    expect(scroll([310], shown).visible).toBe(false)
    expect(scroll([500], scroll([310], shown)).visible).toBe(false)
  })

  test("short content never reaches the threshold, even with overscroll", () => {
    // 600 of scroll range is under 0.8 × 800; bounce reports 900.
    expect(scroll([200, 600, 900], undefined, 1400).visible).toBe(false)
  })

  test("a list that shrinks to a short range hides the arrow", () => {
    const shown = scroll([1200])
    // 600 of range is still above the 0.4 hide line but under the 0.8 show line.
    for (const contentHeight of [1400, 900]) {
      expect(
        nextScrollToTopState(shown, {
          contentHeight,
          viewportHeight: 800,
          y: 1200,
        }).visible,
      ).toBe(false)
    }
  })

  test("tapping hides it for the whole return, then it works again", () => {
    let state = startScrollToTop(scroll([1600]))
    for (const y of [1500, 1100, 700]) {
      state = scroll([y], state)
      expect(state.visible).toBe(false)
    }
    state = scroll([0], state)
    expect(state.returning).toBe(false)
    expect(scroll([700], state).visible).toBe(true)
  })

  test("scrolling down during the return hands control back", () => {
    const state = scroll([1500, 1200], startScrollToTop(scroll([1600])))
    expect(state.visible).toBe(false)
    const takenOver = scroll([1250], state)
    expect(takenOver.returning).toBe(false)
    expect(takenOver.visible).toBe(true)
  })

  test("an unmeasured viewport keeps the arrow hidden", () => {
    expect(scroll([1000], undefined, 3000, 0).visible).toBe(false)
  })
})
