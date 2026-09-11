import { describe, expect, test } from "bun:test"
import { resolveStorefrontApiOrigin } from "./api-origin"

describe("resolveStorefrontApiOrigin", () => {
  test("uses the server API origin instead of deriving authority from Host", () => {
    expect(
      resolveStorefrontApiOrigin({
        apiUrl: "http://localhost:3095/",
        publicApiUrl: "https://ewatrade.com",
      }),
    ).toBe("http://localhost:3095")
  })

  test("falls back to the public API origin when server config is absent", () => {
    expect(
      resolveStorefrontApiOrigin({ publicApiUrl: "https://ewatrade.com/" }),
    ).toBe("https://ewatrade.com")
  })

  test("uses the bounded local API default in an unconfigured development process", () => {
    expect(resolveStorefrontApiOrigin({})).toBe("http://localhost:3095")
  })
})
