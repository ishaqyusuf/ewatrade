import { describe, expect, mock, test } from "bun:test"

// The helper's only native dependency is Platform; no real module needed.
mock.module("react-native", () => ({ Platform: { OS: "ios" } }))
const { statusBarStyleOptionFor } = await import("./native-stack-status-bar")

describe("native-stack status bar option", () => {
  test("iOS never passes statusBarStyle (expo-status-bar owns it)", () => {
    expect(statusBarStyleOptionFor("light", "ios")).toEqual({})
    expect(statusBarStyleOptionFor("dark", "ios")).toEqual({})
  })

  test("Android keeps the native-stack style unchanged", () => {
    expect(statusBarStyleOptionFor("light", "android")).toEqual({
      statusBarStyle: "light",
    })
    expect(statusBarStyleOptionFor("dark", "android")).toEqual({
      statusBarStyle: "dark",
    })
  })
})
