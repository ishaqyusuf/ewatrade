import { describe, expect, test } from "bun:test"
import { TRPCClientError } from "@trpc/client"

import { isAccessDrift } from "./activity-read-errors"

function trpcError(code: string) {
  const error = new TRPCClientError("refused")
  Object.assign(error, { data: { code } })
  return error
}

describe("access drift", () => {
  test("access and cursor refusals restart the read", () => {
    expect(isAccessDrift(trpcError("FORBIDDEN"))).toBe(true)
    expect(isAccessDrift(trpcError("UNAUTHORIZED"))).toBe(true)
    expect(isAccessDrift(trpcError("BAD_REQUEST"))).toBe(true)
  })

  test("transient failures may keep earlier pages", () => {
    expect(isAccessDrift(trpcError("INTERNAL_SERVER_ERROR"))).toBe(false)
    expect(isAccessDrift(new TypeError("Failed to fetch"))).toBe(false)
    expect(isAccessDrift(undefined)).toBe(false)
  })
})
