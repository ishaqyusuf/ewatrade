import { describe, expect, test } from "bun:test"
import { getCustomerBookPresentation } from "./customer-book-presentation-model"

const settledEmptyDirectory = {
  customerCount: 0,
  filter: "all" as const,
  hasError: false,
  isLoading: false,
  isOffline: false,
  search: "",
}

describe("customer book presentation", () => {
  test("gives the settled empty directory one labelled first-customer action", () => {
    expect(getCustomerBookPresentation(settledEmptyDirectory)).toEqual({
      showFilters: false,
      showInitialCreateAction: true,
      showStandardCreateFab: false,
    })
  })

  test("restores list controls once customers or an active query exist", () => {
    expect(
      getCustomerBookPresentation({
        ...settledEmptyDirectory,
        customerCount: 1,
      }),
    ).toEqual({
      showFilters: true,
      showInitialCreateAction: false,
      showStandardCreateFab: true,
    })
    expect(
      getCustomerBookPresentation({
        ...settledEmptyDirectory,
        filter: "pending",
      }),
    ).toEqual({
      showFilters: true,
      showInitialCreateAction: false,
      showStandardCreateFab: true,
    })
  })

  test("does not offer a first-record action while data is unresolved or unavailable", () => {
    for (const unavailableState of [
      { isLoading: true },
      { hasError: true },
      { isOffline: true },
    ]) {
      expect(
        getCustomerBookPresentation({
          ...settledEmptyDirectory,
          ...unavailableState,
        }),
      ).toEqual({
        showFilters: true,
        showInitialCreateAction: false,
        showStandardCreateFab: true,
      })
    }
  })
})
