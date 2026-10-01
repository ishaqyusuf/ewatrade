import { describe, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

mock.module("server-only", () => ({}))
mock.module("@/lib/store-conversation-account-session", () => ({
  getStorefrontCustomerAccount: async () => null,
}))

const URL = "https://chat.ewatrade.example/api/store-conversations/bootstrap"
const publicToken = "public-entry-token-that-is-at-least-32-characters"

function request(body: Record<string, unknown>) {
  return new NextRequest(URL, {
    body: JSON.stringify({ publicToken, ...body }),
    headers: { origin: "https://chat.ewatrade.example" },
    method: "POST",
  })
}

describe("web Store Conversation bootstrap age boundary", () => {
  test("requires an age choice before creating a new Guest", async () => {
    const { POST } = await import("./route")
    const response = await POST(request({}))
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe("NOT_READY")
  })

  test("rejects an under-13 choice", async () => {
    const { POST } = await import("./route")
    const response = await POST(request({ ageBand: "UNDER_13" }))
    expect(response.status).toBe(400)
  })
})
