import { describe, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

mock.module("server-only", () => ({}))

const URL = "https://chat.ewatrade.example/api/store-conversations/guest-terms"

function request(options: {
  body?: unknown
  cookie?: boolean
  origin?: string
}) {
  return new NextRequest(URL, {
    body: JSON.stringify(
      options.body ?? { acceptedTerms: true, version: "draft" },
    ),
    headers: {
      ...(options.cookie
        ? { cookie: "ewatrade.store_conversation_guest=fake-credential" }
        : {}),
      origin: options.origin ?? "https://chat.ewatrade.example",
    },
    method: "POST",
  })
}

describe("Guest conversation Terms route", () => {
  test("rejects cross-origin acceptance before any credential or legal work", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      request({ cookie: true, origin: "https://attacker.example" }),
    )
    expect(response.status).toBe(403)
  })

  test("requires a current HttpOnly Guest credential", async () => {
    const { POST } = await import("./route")
    const response = await POST(request({ cookie: false }))
    expect(response.status).toBe(401)
  })

  test("does not record candidate draft Terms despite a consent-looking payload", async () => {
    const { POST } = await import("./route")
    const response = await POST(request({ cookie: true }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "NOT_READY" })
  })
})
