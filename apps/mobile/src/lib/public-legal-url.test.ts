import { describe, expect, test } from "bun:test"
import { publicLegalUrl } from "./public-legal-url"

describe("public mobile legal links", () => {
  test("opens only a configured HTTPS legal origin", () => {
    expect(publicLegalUrl("privacy", "https://www.ewatrade.com/")).toBe(
      "https://www.ewatrade.com/privacy",
    )
    expect(publicLegalUrl("delete-account", "https://preview.vercel.app")).toBe(
      "https://preview.vercel.app/delete-account",
    )
  })

  test("fails closed for absent or unsafe targets", () => {
    for (const origin of [
      "",
      "http://www.ewatrade.com",
      "https://api.validation.invalid",
      "https://localhost:3092",
      "https://127.0.0.1",
      "https://www.ewatrade.com/legal",
      "https://www.ewatrade.com?next=/privacy",
      "https://user:pass@www.ewatrade.com",
      "https://www.ewatrade.com:8443",
    ]) {
      expect(publicLegalUrl("terms", origin)).toBeNull()
    }
    expect(
      publicLegalUrl("other" as "terms", "https://www.ewatrade.com"),
    ).toBeNull()
  })
})
