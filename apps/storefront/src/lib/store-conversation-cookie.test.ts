import { describe, expect, test } from "bun:test"

import {
  STORE_CONVERSATION_GUEST_COOKIE_OPTIONS,
  requestIsSameOrigin,
} from "./store-conversation-cookie"

describe("Store Conversation guest cookie boundary", () => {
  test("uses a secure script-inaccessible site credential", () => {
    expect(STORE_CONVERSATION_GUEST_COOKIE_OPTIONS).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    })
  })

  test("rejects a cross-origin write request", () => {
    expect(
      requestIsSameOrigin(
        new Request(
          "https://chat.ewatrade.com/api/store-conversations/messages",
          { method: "POST" },
        ),
      ),
    ).toBe(false)
    expect(
      requestIsSameOrigin(
        new Request(
          "https://chat.ewatrade.com/api/store-conversations/messages",
          {
            headers: { origin: "https://hostile.example" },
            method: "POST",
          },
        ),
      ),
    ).toBe(false)
    expect(
      requestIsSameOrigin(
        new Request(
          "https://chat.ewatrade.com/api/store-conversations/messages",
          {
            headers: { origin: "https://chat.ewatrade.com" },
            method: "POST",
          },
        ),
      ),
    ).toBe(true)
  })

  test("accepts the public origin behind a TLS-terminating reverse proxy", () => {
    expect(
      requestIsSameOrigin(
        new Request("http://127.0.0.1:3091/api/store-conversations/messages", {
          headers: {
            host: "chat.ewatrade.com",
            origin: "https://chat.ewatrade.com",
            "x-forwarded-proto": "https",
          },
          method: "POST",
        }),
      ),
    ).toBe(true)
    expect(
      requestIsSameOrigin(
        new Request("http://127.0.0.1:3091/api/store-conversations/messages", {
          headers: {
            host: "chat.ewatrade.com",
            origin: "https://hostile.example",
            "x-forwarded-proto": "https",
          },
          method: "POST",
        }),
      ),
    ).toBe(false)
  })
})
