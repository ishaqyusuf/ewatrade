import { describe, expect, mock, test } from "bun:test"

import { NextRequest } from "next/server"

mock.module("server-only", () => ({}))

describe("Storefront WhatsApp bridge route", () => {
  test("rejects a cross-origin request before credential or bridge work", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      new NextRequest(
        "https://chat.ewatrade.example/api/store-conversations/whatsapp-bridge",
        {
          body: JSON.stringify({
            access: "guest",
            bridgeToken: "b".repeat(43),
            clientOperationId: "bridge-operation-0001",
            conversationId: "conversation_1",
            publicToken: "public-token-with-enough-entropy",
          }),
          headers: { origin: "https://attacker.example" },
          method: "POST",
        },
      ),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      code: "FORBIDDEN",
      message: "This request is unavailable.",
    })
  })
})
