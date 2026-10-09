import { describe, expect, test } from "bun:test"
import {
  rankBySearch,
  searchMatch,
  searchStem,
  searchTokens,
} from "./search-rank"

const items = [
  { name: "Eggs", detail: "Small · Crate" },
  { name: "Eggs", detail: "Big · Egg" },
  { name: "Crate of eggs", detail: "Crate" },
  { name: "Broiler chicken", detail: "Piece" },
  { name: "Layer feed", detail: "Bag" },
]
const fields = (item: (typeof items)[number]) => [
  { text: item.name },
  { text: item.detail, weight: 0.9 },
]

describe("deep search", () => {
  test("splits words, drops filler words and keeps stems", () => {
    expect(searchTokens("  Crate OF  Eggs ")).toEqual(["crate", "eggs"])
    expect(searchStem("eggs")).toBe("egg")
    expect(searchStem("boxes")).toBe("box")
    expect(searchStem("glass")).toBe("glass")
  })

  test("finds words in any order and ranks the fullest match first", () => {
    const ranked = rankBySearch(items, "small crate egg", fields)
    expect(ranked[0]).toEqual({ name: "Eggs", detail: "Small · Crate" })
    expect(ranked).toContainEqual({ name: "Crate of eggs", detail: "Crate" })
    expect(ranked).not.toContainEqual({ name: "Layer feed", detail: "Bag" })
  })

  test("prefers the name and the typed phrase", () => {
    const ranked = rankBySearch(items, "crate of eggs", fields)
    expect(ranked[0]?.name).toBe("Crate of eggs")
  })

  test("tolerates small typos and prefixes", () => {
    expect(rankBySearch(items, "brioler", fields)[0]?.name).toBe(
      "Broiler chicken",
    )
    expect(rankBySearch(items, "chick", fields)[0]?.name).toBe(
      "Broiler chicken",
    )
    expect(searchMatch("zzz", fields(items[0] as (typeof items)[number]))).toBe(
      null,
    )
  })

  test("needs at least half of the words by default", () => {
    expect(rankBySearch(items, "layer bag crate", fields)).toEqual([
      { name: "Layer feed", detail: "Bag" },
    ])
    expect(rankBySearch(items, "", fields)).toHaveLength(items.length)
  })
})
