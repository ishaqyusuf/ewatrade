import { describe, expect, test } from "bun:test"
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
