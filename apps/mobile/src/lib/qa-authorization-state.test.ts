import { describe, expect, test } from "bun:test"
import { shouldSuggestQaAuthorization } from "./qa-authorization-state"

const base = {
  authorizationPresent: false,
  clientEnabled: true,
  isBusinessShell: true,
}

describe("mobile QA authorization suggestion", () => {
  test("suggests QA setup when an enabled business shell has no authorization", () => {
    expect(shouldSuggestQaAuthorization(base)).toBe(true)
  })

  test("suggests QA setup again after a revoked authorization is removed", () => {
    expect(
      shouldSuggestQaAuthorization({ ...base, authorizationPresent: false }),
    ).toBe(true)
  })

  test.each([
    { ...base, authorizationPresent: true },
    { ...base, clientEnabled: false },
    { ...base, isBusinessShell: false },
  ])("does not suggest QA setup outside its optional entry states", (input) => {
    expect(shouldSuggestQaAuthorization(input)).toBe(false)
  })
})
