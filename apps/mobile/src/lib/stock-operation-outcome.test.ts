import { describe, expect, test } from "bun:test"
import { toPublicError } from "@ewatrade/errors"
import { TRPCClientError } from "@trpc/client"
import { TRPCError } from "@trpc/server"
import { classifyStockOperationFailure } from "./stock-operation-outcome"

function serverFailure(
  code: "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" | "INTERNAL_SERVER_ERROR",
  domainCode: string,
) {
  const cause = Object.assign(new Error("Private domain detail"), {
    code: domainCode,
  })
  const error = new TRPCError({ cause, code })
  return TRPCClientError.from({
    error: {
      code: code === "CONFLICT" ? -32009 : -32600,
      data: {
        appError: toPublicError(error),
        code,
        httpStatus: code === "INTERNAL_SERVER_ERROR" ? 500 : 400,
      },
      message: toPublicError(error).message,
    },
  })
}

describe("stock mutation failure presentation", () => {
  test("terminal structured rejections are definitive before any uncertainty", () => {
    for (const code of [
      "BAD_REQUEST",
      "UNPROCESSABLE_CONTENT",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
    ])
      expect(classifyStockOperationFailure({ data: { code } })).toBe(
        "definitive",
      )
    expect(
      classifyStockOperationFailure(serverFailure("FORBIDDEN", "FORBIDDEN")),
    ).toBe("definitive")
    expect(
      classifyStockOperationFailure(
        serverFailure("BAD_REQUEST", "INVALID_STOCK_OPERATION"),
      ),
    ).toBe("definitive")
  })

  test("current public stock conflicts request a fresh review without inventing a revision subtype", () => {
    for (const domain of [
      "REVISION_CONFLICT",
      "STALE_CONFIGURATION",
      "INSUFFICIENT_STOCK",
      "OFFERING_UNAVAILABLE",
    ]) {
      const error = serverFailure("CONFLICT", domain)
      expect(error.data?.appError.code).toBe("STOCK_CONFLICT")
      expect(classifyStockOperationFailure(error)).toBe("refresh_required")
    }
    expect(
      classifyStockOperationFailure({ shape: { data: { code: "CONFLICT" } } }),
    ).toBe("refresh_required")
    expect(
      classifyStockOperationFailure({ data: { code: "PRECONDITION_FAILED" } }),
    ).toBe("refresh_required")
  })

  test("idempotency mismatch does not claim an existing operation was never recorded", () => {
    const error = serverFailure("CONFLICT", "IDEMPOTENCY_MISMATCH")
    expect(error.data?.appError.code).toBe("IDEMPOTENCY_CONFLICT")
    expect(classifyStockOperationFailure(error)).toBe("unknown")
  })

  test("lost response remains unknown after a later denial or conflict", () => {
    for (const error of [
      serverFailure("FORBIDDEN", "FORBIDDEN"),
      serverFailure("CONFLICT", "REVISION_CONFLICT"),
      { data: { code: "NOT_FOUND" } },
    ])
      expect(
        classifyStockOperationFailure(error, { previousOutcomeUnknown: true }),
      ).toBe("unknown")
  })

  test("transport, timeout, unexpected and malformed errors remain uncertain", () => {
    for (const error of [
      undefined,
      null,
      "FORBIDDEN",
      new Error("REVISION_CONFLICT: refresh and try again"),
      { code: "FORBIDDEN" },
      { data: null },
      { data: [] },
      { data: { code: "TIMEOUT" } },
      { data: { code: "TOO_MANY_REQUESTS" } },
      { data: { code: "INTERNAL_SERVER_ERROR" } },
      { data: { code: "CONFLICT", httpStatus: 503 } },
      serverFailure("INTERNAL_SERVER_ERROR", "P2028"),
    ])
      expect(classifyStockOperationFailure(error)).toBe("unknown")
  })
})
