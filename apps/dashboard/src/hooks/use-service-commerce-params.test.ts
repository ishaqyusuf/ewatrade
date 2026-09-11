import { describe, expect, test } from "bun:test"

import { withServiceCommerceUserNavigation } from "./use-service-commerce-params"

describe("Service Commerce URL state", () => {
  test("pushes navigable sheet and Store changes into browser history", () => {
    const writes: Array<{
      options: { history: "push" }
      values: {
        serviceCommerceSheet?: "availability" | null
        storeId?: string | null
      }
    }> = []
    const setUserParams = withServiceCommerceUserNavigation(
      (
        values: {
          serviceCommerceSheet?: "availability" | null
          storeId?: string | null
        },
        options: { history: "push" },
      ) => writes.push({ options, values }),
    )

    setUserParams({
      serviceCommerceSheet: "availability",
      storeId: "store_1",
    })
    setUserParams({ serviceCommerceSheet: null })

    expect(writes).toEqual([
      {
        options: { history: "push" },
        values: {
          serviceCommerceSheet: "availability",
          storeId: "store_1",
        },
      },
      {
        options: { history: "push" },
        values: { serviceCommerceSheet: null },
      },
    ])
  })
})
