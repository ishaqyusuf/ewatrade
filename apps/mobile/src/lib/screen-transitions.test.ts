import { describe, expect, test } from "bun:test"
import { stackTransitions, tabTransitions } from "./screen-transitions"

describe("stack transitions", () => {
  test("ordinary routes and full-screen modals use different directions", () => {
    const android = stackTransitions("android")
    const ios = stackTransitions("ios")
    expect(android.push.animation).toBe("ios_from_right")
    expect(ios.push).toEqual({})
    expect(android.fullScreenModal.animation).toBe("slide_from_bottom")
    expect(ios.fullScreenModal.animation).toBe("slide_from_bottom")
    // Keep child routes pushable above a workflow on the same native stack.
    expect(ios.fullScreenModal.presentation).toBeUndefined()
    expect(ios.fullScreenModal.gestureDirection).toBe("vertical")
    expect(ios.fullScreenModal.gestureResponseDistance).toEqual({ top: 56 })
    expect(ios.gate).toEqual({ animation: "fade", animationDuration: 220 })
  })

  test("full-screen modals and pushes fade under Reduce Motion", () => {
    for (const os of ["android", "ios"]) {
      const { push, fullScreenModal, gate } = stackTransitions(os, true)
      expect(push.animation).toBe("fade")
      expect(fullScreenModal).toEqual({ animation: "fade" })
      expect(gate.animation).toBe("fade")
    }
  })
})

describe("tab transitions", () => {
  // Stands in for the Animated progress value: interpolate returns its config.
  const sceneStyle = (focused: boolean) => {
    const interpolator = tabTransitions(false, focused).sceneStyleInterpolator
    if (!interpolator) throw new Error("expected an interpolator")
    const progress = { interpolate: (config: unknown) => config }
    return interpolator({
      current: { progress },
    } as unknown as Parameters<typeof interpolator>[0]).sceneStyle as {
      opacity: { inputRange: number[]; outputRange: number[] }
      transform?: {
        translateX: { inputRange: number[]; outputRange: number[] }
      }[]
    }
  }

  test("tabs use a 230ms ease-in-out timing", () => {
    const spec = tabTransitions(false, true).transitionSpec
    if (spec?.animation !== "timing") throw new Error("expected timing spec")
    expect(spec.config.duration).toBe(230)
    const easing = spec.config.easing
    if (!easing) throw new Error("expected easing")
    expect(easing(0)).toBe(0)
    expect(easing(1)).toBe(1)
    expect(easing(0.5)).toBe(0.5)
    expect(easing(0.25)).toBeLessThan(0.25)
    expect(easing(0.75)).toBeGreaterThan(0.75)
  })

  test("the tab being opened fades in place", () => {
    const style = sceneStyle(true)
    expect(style.opacity.outputRange).toEqual([0, 1, 0])
    expect(style.transform?.[0]?.translateX).toEqual({
      inputRange: [-1, 0, 1],
      outputRange: [0, 0, 0],
    })
  })

  test("the tab being left slides away in tab order and fades out early", () => {
    const style = sceneStyle(false)
    expect(style.transform?.[0]?.translateX).toEqual({
      inputRange: [-1, 0, 1],
      outputRange: [-240, 0, 240],
    })
    expect(style.opacity).toEqual({
      inputRange: [-1, -0.7, 0, 0.7, 1],
      outputRange: [0, 0, 1, 0, 0],
    })
  })

  test("reduce motion turns the tab animation off", () => {
    expect(tabTransitions(true, true)).toEqual({ animation: "none" })
    expect(tabTransitions(true, false)).toEqual({ animation: "none" })
  })
})
