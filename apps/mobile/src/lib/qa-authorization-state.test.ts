import { describe, expect, test } from "bun:test"
import {
  classifyQaRevalidation,
  describeQaAuthorizationError,
} from "./qa-authorization-state"

describe("mobile QA revalidation", () => {
  test("keeps a valid authorization", () => {
    expect(classifyQaRevalidation({ isError: false })).toBe("valid")
  })

  test("renews when the server rejects the saved token", () => {
    expect(
      classifyQaRevalidation({ errorCode: "UNAUTHORIZED", isError: true }),
    ).toBe("renew")
  })

  test.each([undefined, null, "INTERNAL_SERVER_ERROR", "TOO_MANY_REQUESTS"])(
    "keeps the authorization through %p failures",
    (errorCode) => {
      expect(classifyQaRevalidation({ errorCode, isError: true })).toBe(
        "unavailable",
      )
    },
  )
})

describe("mobile QA authorization errors", () => {
  test("explains an unknown domain", () => {
    expect(describeQaAuthorizationError({ errorCode: "BAD_REQUEST" })).toBe(
      "This domain isn’t set up for QA on this server.",
    )
  })

  test("explains an unreachable server", () => {
    expect(
      describeQaAuthorizationError({ message: "Network request failed" }),
    ).toBe("Can’t reach the server. Check it is running.")
  })

  test("explains a lockout", () => {
    expect(
      describeQaAuthorizationError({ errorCode: "TOO_MANY_REQUESTS" }),
    ).toBe("Too many tries. Wait a minute, then try again.")
  })
})
