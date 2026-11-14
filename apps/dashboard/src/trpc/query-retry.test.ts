import { describe, expect, spyOn, test } from "bun:test"
import {
  TRPCClientError,
  createTRPCClient,
  httpBatchStreamLink,
} from "@trpc/client"
import { initTRPC } from "@trpc/server"

import { fetchDashboardRead, shouldRetryQuery } from "./query-retry"

const t = initTRPC.create()
const router = t.router({ fixture: t.procedure.query(() => "ok") })

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

  test("timeouts, server errors and network failures get one retry", () => {
    for (const error of [
      trpcError(408, "TIMEOUT"),
      trpcError(500, "INTERNAL_SERVER_ERROR"),
      trpcError(503, "SERVICE_UNAVAILABLE"),
      new TypeError("Failed to fetch"),
      undefined,
    ]) {
      expect(shouldRetryQuery(0, error, client)).toBe(true)
      expect(shouldRetryQuery(1, error, client)).toBe(false)
    }
  })

  test("respects gateway HTTP status when no tRPC error was decoded", () => {
    for (const [status, retry] of [
      [401, false],
      [429, false],
      [503, true],
    ] as const) {
      const error = TRPCClientError.from(new SyntaxError("Invalid JSON"), {
        meta: { response: new Response("gateway", { status }) },
      })
      expect(shouldRetryQuery(0, error, client)).toBe(retry)
    }
  })

  test("does not restart aborted requests", () => {
    const aborted = new DOMException("Aborted", "AbortError")
    expect(shouldRetryQuery(0, aborted, client)).toBe(false)
    expect(shouldRetryQuery(0, TRPCClientError.from(aborted), client)).toBe(
      false,
    )
  })

  test("the streaming link preserves a gateway refusal for the retry policy", async () => {
    const mockFetch = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<p>Rate limited</p>", {
        status: 429,
        headers: { "Content-Type": "text/html" },
      }),
    )
    try {
      const trpc = createTRPCClient<typeof router>({
        links: [
          httpBatchStreamLink({
            url: "https://dashboard.invalid/api/trpc",
            fetch: fetchDashboardRead,
          }),
        ],
      })
      const error: unknown = await trpc.fixture.query().catch((cause) => cause)
      expect(error).toBeInstanceOf(TRPCClientError)
      if (!(error instanceof TRPCClientError))
        throw new Error("Expected API refusal")
      expect(error.meta?.response.status).toBe(429)
      expect(shouldRetryQuery(0, error, client)).toBe(false)
    } finally {
      mockFetch.mockRestore()
    }
  })

  test("server renders never retry", () => {
    expect(
      shouldRetryQuery(0, trpcError(500, "INTERNAL_SERVER_ERROR"), {
        isServer: true,
      }),
    ).toBe(false)
  })

  test("reads the status from a real TRPCClientError response", () => {
    const error = TRPCClientError.from({
      error: {
        code: -32004,
        data: { code: "NOT_FOUND", httpStatus: 404, path: "finance.cashCount" },
        message: "The requested information could not be found.",
      },
    } as Parameters<typeof TRPCClientError.from>[0])
    expect(shouldRetryQuery(0, error, client)).toBe(false)
  })
})
