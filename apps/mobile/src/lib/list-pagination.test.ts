import { describe, expect, test } from "bun:test"

import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "./list-pagination"

describe("mobile list pagination", () => {
  test("shows search only after ten total records", () => {
    expect(shouldShowListSearch(0)).toBe(false)
    expect(shouldShowListSearch(10)).toBe(false)
    expect(shouldShowListSearch(11)).toBe(true)
  })

  test("uses a bounded page size and avoids duplicate page requests", () => {
    expect(LIST_PAGE_SIZE).toBe(20)
    expect(
      shouldFetchNextListPage({
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    ).toBe(true)
    expect(
      shouldFetchNextListPage({
        hasNextPage: true,
        isFetchingNextPage: true,
      }),
    ).toBe(false)
  })
})
