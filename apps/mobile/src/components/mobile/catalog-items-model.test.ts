import { describe, expect, test } from "bun:test"
import { shouldShowCatalogFirstItemGate } from "./catalog-items-model"

const settledEmptyTab = {
  hasCatalogItems: false,
  isError: false,
  isPending: false,
  presentation: "tab" as const,
  rowCount: 0,
}

describe("catalog first-item gate", () => {
  test("shows only for a settled empty catalog tab", () => {
    expect(shouldShowCatalogFirstItemGate(settledEmptyTab)).toBe(true)
    expect(
      shouldShowCatalogFirstItemGate({
        ...settledEmptyTab,
        presentation: "modal",
      }),
    ).toBe(false)
  })

  test("keeps loading, error, and populated list states unchanged", () => {
    expect(
      shouldShowCatalogFirstItemGate({ ...settledEmptyTab, isPending: true }),
    ).toBe(false)
    expect(
      shouldShowCatalogFirstItemGate({ ...settledEmptyTab, isError: true }),
    ).toBe(false)
    expect(
      shouldShowCatalogFirstItemGate({
        ...settledEmptyTab,
        hasCatalogItems: true,
        rowCount: 1,
      }),
    ).toBe(false)
  })
})
