import { describe, expect, test } from "bun:test"
import { stackTransitions, tabTransitions } from "./screen-transitions"

describe("stack transitions", () => {
  test("Android gets explicit native animations instead of its static default", () => {
    const android = stackTransitions("android")
    expect(android.push.animation).toBe("ios_from_right")
    expect(android.modal).toEqual({
      presentation: "modal",
      animation: "slide_from_bottom",
    })
    expect(android.gate.animation).toBe("fade")
  })

  test("iOS keeps its native push, swipe-back and modal sheet", () => {
    const ios = stackTransitions("ios")
    expect(ios.push).toEqual({})
    expect(ios.modal).toEqual({ presentation: "modal" })
    expect(ios.gate).toEqual({ animation: "fade", animationDuration: 220 })
  })
})

describe("tab transitions", () => {
  test("tabs cross-fade with an ease-out curve", () => {
    const options = tabTransitions(false)
    expect(options.animation).toBe("fade")
    const spec = options.transitionSpec
    if (spec?.animation !== "timing") throw new Error("expected timing spec")
    expect(spec.config.duration).toBe(180)
    expect(spec.config.easing?.(0)).toBe(0)
    expect(spec.config.easing?.(1)).toBe(1)
    expect(spec.config.easing?.(0.5)).toBeGreaterThan(0.5)
  })

  test("reduce motion turns the tab animation off", () => {
    expect(tabTransitions(true)).toEqual({ animation: "none" })
  })
})
