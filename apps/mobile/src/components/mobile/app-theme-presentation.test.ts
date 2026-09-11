import { describe, expect, test } from "bun:test"
import { buildAppThemeOptions } from "./app-theme-presentation"

describe("app theme presentation", () => {
  test("reports the appearance currently resolved by the system setting", () => {
    expect(
      buildAppThemeOptions({
        resolvedColorScheme: "dark",
        themeOverride: "system",
      }),
    ).toEqual([
      {
        detail: "Follow device setting · currently Dark",
        label: "System",
        preview: "system",
        selected: true,
        value: "system",
      },
      {
        detail: "Always use a light background",
        label: "Light",
        preview: "light",
        selected: false,
        value: "light",
      },
      {
        detail: "Always use a dark background",
        label: "Dark",
        preview: "dark",
        selected: false,
        value: "dark",
      },
    ])
  })

  test("keeps an explicit appearance selected independently of the device", () => {
    const options = buildAppThemeOptions({
      resolvedColorScheme: "light",
      themeOverride: "dark",
    })

    expect(options.find((option) => option.selected)?.value).toBe("dark")
    expect(options[0]?.detail).toBe(
      "Follow device setting · currently Light",
    )
  })
})
