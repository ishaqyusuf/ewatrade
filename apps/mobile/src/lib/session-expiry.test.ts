import { expect, test } from "bun:test"
import { TRPCClientError } from "@trpc/client"
import {
  classifySessionError,
  isSessionExpiryOperation,
  notifySessionExpired,
  subscribeSessionExpired,
} from "./session-expiry"

function serverError(code: string, httpStatus: number) {
  return TRPCClientError.from({
    error: {
      code: -32001,
      data: { code, httpStatus, path: "serviceCommerce.accountAgeStatus" },
      message: code,
    },
  })
}

test("a rejected session token is classified as unauthorized", () => {
  expect(classifySessionError(serverError("UNAUTHORIZED", 401))).toBe(
    "unauthorized",
  )
  expect(classifySessionError({ data: { httpStatus: 401 } })).toBe(
    "unauthorized",
  )
})

test("network and server failures stay on the retry path", () => {
  expect(
    classifySessionError(
      TRPCClientError.from(new TypeError("Network request failed")),
    ),
  ).toBe("other")
  expect(classifySessionError(serverError("INTERNAL_SERVER_ERROR", 500))).toBe(
    "other",
  )
  expect(classifySessionError(serverError("FORBIDDEN", 403))).toBe("other")
  expect(classifySessionError(new Error("timeout"))).toBe("other")
  expect(classifySessionError(null)).toBe("other")
})

test("only protected reads can end the session", () => {
  expect(
    isSessionExpiryOperation({
      path: "serviceCommerce.accountAgeStatus",
      type: "query",
    }),
  ).toBe(true)
  expect(
    isSessionExpiryOperation({
      path: "auth.mobileOwnerPassword",
      type: "query",
    }),
  ).toBe(false)
  expect(
    isSessionExpiryOperation({ path: "orders.create", type: "mutation" }),
  ).toBe(false)
})

test("parallel rejections for one token sign out once", () => {
  const seen: string[] = []
  const unsubscribe = subscribeSessionExpired((token) => seen.push(token))
  notifySessionExpired("token-a")
  notifySessionExpired("token-a")
  notifySessionExpired(null)
  notifySessionExpired("token-b")
  unsubscribe()
  notifySessionExpired("token-c")
  expect(seen).toEqual(["token-a", "token-b"])
})
