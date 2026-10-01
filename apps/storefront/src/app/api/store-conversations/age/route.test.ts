import { describe, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

mock.module("server-only", () => ({}))

const URL = "https://chat.ewatrade.example/api/store-conversations/age"

function request(input: { body?: unknown; origin?: string; cookie?: boolean }) {
  return new NextRequest(URL, {
    body: JSON.stringify(
      input.body ?? { access: "guest", ageBand: "AGE_13_TO_15" },
    ),
    headers: {
      ...(input.cookie
        ? { cookie: "ewatrade.store_conversation_guest=fake-credential" }
        : {}),
      origin: input.origin ?? "https://chat.ewatrade.example",
    },
    method: "POST",
  })
}

describe("Store Conversation age route", () => {
  test("rejects cross-origin age changes", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      request({ cookie: true, origin: "https://attacker.example" }),
    )
    expect(response.status).toBe(403)
  })

  test("requires a Guest credential before age declaration", async () => {
    const { POST } = await import("./route")
    const response = await POST(request({}))
    expect(response.status).toBe(401)
  })

  test("does not accept an under-13 age band", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      request({ body: { access: "guest", ageBand: "UNDER_13" } }),
    )
    expect(response.status).toBe(400)
  })
})
