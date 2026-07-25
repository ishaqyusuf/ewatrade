import { describe, expect, test } from "bun:test"

import { globalSearchSchema } from "./search"

describe("global search schema", () => {
  test("normalizes bounded aggregate search input", () => {
    expect(
      globalSearchSchema.parse({
        query: "  Ada  ",
      }),
    ).toEqual({
      limit: 6,
      query: "Ada",
    })
  })

  test("rejects one-character and oversized searches", () => {
    expect(() => globalSearchSchema.parse({ query: "a" })).toThrow()
    expect(() =>
      globalSearchSchema.parse({ limit: 11, query: "valid" }),
    ).toThrow()
  })
})
