import { describe, expect, test } from "bun:test"
import { serviceCommerceSetupViewState } from "./service-commerce-setup-state"

describe("Service Commerce setup view state", () => {
  test("keeps loading, error, read-only and management states distinct", () => {
    expect(
      serviceCommerceSetupViewState({
        canManage: false,
        hasData: false,
        hasError: false,
        isLoading: true,
      }),
    ).toBe("loading")
    expect(
      serviceCommerceSetupViewState({
        canManage: false,
        hasData: false,
        hasError: true,
        isLoading: false,
      }),
    ).toBe("error")
    expect(
      serviceCommerceSetupViewState({
        canManage: false,
        hasData: true,
        hasError: false,
        isLoading: false,
      }),
    ).toBe("read_only")
    expect(
      serviceCommerceSetupViewState({
        canManage: true,
        hasData: true,
        hasError: false,
        isLoading: false,
      }),
    ).toBe("ready")
  })
})
