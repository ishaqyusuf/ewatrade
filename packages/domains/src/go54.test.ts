import { describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"

import { createGo54Token } from "./go54"

describe("GO54 authentication", () => {
  test("matches the documented HMAC hex then base64 algorithm", () => {
    const date = new Date("2026-07-24T15:30:00.000Z")
    const hex = createHmac("sha256", "secret")
      .update("owner@example.com:26-07-24 15")
      .digest("hex")

    expect(
      createGo54Token({
        apiKey: "secret",
        date,
        username: "owner@example.com",
      }),
    ).toBe(Buffer.from(hex, "utf8").toString("base64"))
  })
})
