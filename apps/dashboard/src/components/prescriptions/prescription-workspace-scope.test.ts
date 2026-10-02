import { describe, expect, test } from "bun:test"
import { prescriptionWorkspaceScopeKey } from "./prescription-workspace-scope"

describe("prescription workspace form scope", () => {
  test("changes when the Store or request changes", () => {
    const scope = prescriptionWorkspaceScopeKey("store-a", "request-a")

    expect(prescriptionWorkspaceScopeKey("store-a", "request-b")).not.toBe(
      scope,
    )
    expect(prescriptionWorkspaceScopeKey("store-b", "request-a")).not.toBe(
      scope,
    )
    expect(prescriptionWorkspaceScopeKey("store-a", "request-a")).toBe(scope)
  })
})
