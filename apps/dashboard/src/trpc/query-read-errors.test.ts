import { expect, test } from "bun:test"
import { TRPCClientError } from "@trpc/client"
import { isRejectedRead, readPollInterval } from "./query-read-errors"

const failure = (code: string) =>
  TRPCClientError.from({
    error: { code: -32003, data: { code }, message: "inert failure" },
  } as Parameters<typeof TRPCClientError.from>[0])

test("only the existing three rejected-read codes stop notification intervals", () => {
  for (const code of ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"]) {
    const error = failure(code)
    expect(isRejectedRead(error)).toBe(true)
    expect(readPollInterval(error, 30_000)).toBe(false)
    expect(readPollInterval(error, 60_000)).toBe(false)
  }
})

test("transient, other domain and malformed failures retain their configured cadence", () => {
  for (const error of [
    undefined,
    null,
    new TypeError("inert network failure"),
    new Error("FORBIDDEN"),
    failure("TIMEOUT"),
    failure("INTERNAL_SERVER_ERROR"),
    failure("SERVICE_UNAVAILABLE"),
    failure("CONFLICT"),
    failure("BAD_REQUEST"),
    { data: null },
    { data: { code: 403 } },
  ]) {
    expect(isRejectedRead(error)).toBe(false)
    expect(readPollInterval(error, 30_000)).toBe(30_000)
    expect(readPollInterval(error, 60_000)).toBe(60_000)
  }
})
