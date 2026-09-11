import { describe, expect, test } from "bun:test"
import {
  resolveFloatingThemeToggleCoordinates,
  snapFloatingThemeTogglePosition,
} from "./floating-theme-toggle-position"

const bounds = { bottom: 700, left: 12, right: 348, top: 60 }

describe("floating theme toggle position", () => {
  test("snaps an interior drag to the nearest screen edge", () => {
    expect(
      snapFloatingThemeTogglePosition({
        bounds,
        screenWidth: 400,
        size: 40,
        x: 80,
        y: 300,
      }),
    ).toEqual({ edge: "left", verticalRatio: 0.375 })

    expect(
      snapFloatingThemeTogglePosition({
        bounds,
        screenWidth: 400,
        size: 40,
        x: 220,
        y: 300,
      }),
    ).toEqual({ edge: "right", verticalRatio: 0.375 })
  })

  test("clamps vertical position and resolves it for another screen", () => {
    expect(
      snapFloatingThemeTogglePosition({
        bounds,
        screenWidth: 400,
        size: 40,
        x: 390,
        y: 900,
      }),
    ).toEqual({ edge: "right", verticalRatio: 1 })

    expect(
      resolveFloatingThemeToggleCoordinates(
        { edge: "left", verticalRatio: 0.5 },
        { bottom: 500, left: 16, right: 244, top: 100 },
      ),
    ).toEqual({ x: 16, y: 300 })
  })
})
