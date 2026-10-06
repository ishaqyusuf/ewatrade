import { describe, expect, test } from "bun:test"
import { pruneInlineSelection } from "./inline-selection"
import { pruneRowSelection } from "./selection"

describe("loaded row selection", () => {
  test("drops IDs that are no longer loaded", () => {
    expect(pruneRowSelection({ a: true, b: true }, new Set(["a"]))).toEqual({
      a: true,
    })
  })

  test("returns the same object when every selected ID is still loaded", () => {
    const previous = { a: true, b: true }
    expect(pruneRowSelection(previous, new Set(["a", "b", "c"]))).toBe(previous)
  })

  test("discards explicitly unselected entries", () => {
    expect(
      pruneRowSelection({ a: false, b: true }, new Set(["a", "b"])),
    ).toEqual({ b: true })
  })
})

describe("inline table selection", () => {
  test("drops IDs that are no longer loaded", () => {
    expect([...pruneInlineSelection(new Set(["a", "b"]), ["b", "c"])]).toEqual([
      "b",
    ])
  })

  test("returns the same set when every selected ID is still loaded", () => {
    const previous = new Set(["a"])
    expect(pruneInlineSelection(previous, ["a", "b"])).toBe(previous)
  })
})
