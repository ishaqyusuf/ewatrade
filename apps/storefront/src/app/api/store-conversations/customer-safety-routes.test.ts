import { describe, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

mock.module("server-only", () => ({}))

describe("Storefront customer safety routes", () => {
  test.each(["report", "block"] as const)(
    "%s rejects cross-origin writes before credential work",
    async (action) => {
      const route =
        action === "report"
          ? await import("./report/route")
          : await import("./block/route")
      const response = await route.POST(
        new NextRequest(
          `https://chat.ewatrade.example/api/store-conversations/${action}`,
          {
            body: JSON.stringify({ access: "guest" }),
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
    },
  )

  test.each(["report", "block"] as const)(
    "%s rejects a Guest request without the HttpOnly credential",
    async (action) => {
      const route =
        action === "report"
          ? await import("./report/route")
          : await import("./block/route")
      const response = await route.POST(
        new NextRequest(
          `https://chat.ewatrade.example/api/store-conversations/${action}`,
          {
            body: JSON.stringify({ access: "guest" }),
            headers: { origin: "https://chat.ewatrade.example" },
            method: "POST",
          },
        ),
      )

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        code: "GUEST_CREDENTIAL_EXPIRED",
        message: "Start from the Store link.",
      })
    },
  )
})
