import { describe, expect, test } from "bun:test"
import { getQaWebRequestOrigin } from "./qa-request-origin"

function request(input: {
  headers?: Record<string, string>
  origin?: string
  protocol?: string
}) {
  const headers = new Map(Object.entries(input.headers ?? {}))
  return {
    headers: { get: (name: string) => headers.get(name) ?? null },
    nextUrl: {
      origin: input.origin ?? "http://internal-next-origin:3000",
      protocol: input.protocol ?? "http:",
    },
  }
}

describe("QA website request origin", () => {
  test("uses the browser-facing Host in local development", () => {
    expect(
      getQaWebRequestOrigin(request({ headers: { host: "127.0.0.1:3292" } })),
    ).toBe("http://127.0.0.1:3292")
  })

  test("prefers the first forwarded host and protocol behind preview proxies", () => {
    expect(
      getQaWebRequestOrigin(
        request({
          headers: {
            host: "internal:3000",
            "x-forwarded-host": "preview.example.test, internal:3000",
            "x-forwarded-proto": "https, http",
          },
        }),
      ),
    ).toBe("https://preview.example.test")
  })

  test("falls back to the Next origin when request headers are unavailable", () => {
    expect(getQaWebRequestOrigin(request({}))).toBe(
      "http://internal-next-origin:3000",
    )
  })
})
