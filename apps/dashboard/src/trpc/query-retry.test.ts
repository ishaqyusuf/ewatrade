import { describe, expect, test } from "bun:test"

import { shouldRetryQuery } from "./query-retry"

const trpcError = (httpStatus: number, code: string) => ({
  data: { code, httpStatus },
  message: code,
})
const client = { isServer: false }

describe("Dashboard query retries", () => {
  test("client errors fail at once", () => {
    for (const [status, code] of [
      [400, "BAD_REQUEST"],
      [401, "UNAUTHORIZED"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [409, "CONFLICT"],
      [429, "TOO_MANY_REQUESTS"],
    ] as const)
      expect(shouldRetryQuery(0, trpcError(status, code), client)).toBe(false)
  })

  test("timeouts, server errors and network failures keep three retries", () => {
    for (const error of [
      trpcError(408, "TIMEOUT"),
      trpcError(500, "INTERNAL_SERVER_ERROR"),
      trpcError(503, "SERVICE_UNAVAILABLE"),
      new TypeError("Failed to fetch"),
      undefined,
    ]) {
      expect(shouldRetryQuery(0, error, client)).toBe(true)
      expect(shouldRetryQuery(2, error, client)).toBe(true)
      expect(shouldRetryQuery(3, error, client)).toBe(false)
    }
  })

  test("server renders never retry", () => {
    expect(
      shouldRetryQuery(0, trpcError(500, "INTERNAL_SERVER_ERROR"), {
        isServer: true,
      }),
    ).toBe(false)
  })
})
