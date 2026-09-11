import { describe, expect, test } from "bun:test"
import { commitAppThemeSelection } from "./app-theme-selection"

describe("app theme selection", () => {
  test("rolls the runtime theme back when local persistence fails", async () => {
    const applied: string[] = []

    const result = await commitAppThemeSelection({
      apply: (value) => applied.push(value),
      current: "light",
      next: "dark",
      persist: async () => {
        throw new Error("storage unavailable")
      },
    })

    expect(result).toBe("failed")
    expect(applied).toEqual(["dark", "light"])
  })

  test("does not apply or persist an unchanged choice", async () => {
    let persistCount = 0
    const applied: string[] = []

    const result = await commitAppThemeSelection({
      apply: (value) => applied.push(value),
      current: "system",
      next: "system",
      persist: async () => {
        persistCount += 1
      },
    })

    expect(result).toBe("unchanged")
    expect(applied).toEqual([])
    expect(persistCount).toBe(0)
  })
})
