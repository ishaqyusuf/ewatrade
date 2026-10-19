import { expect, test } from "bun:test"
import { GET } from "./route"

test("production storefront advertises the approved adult-chat publication without caching", async () => {
  const previousAppEnv = process.env.APP_ENV
  process.env.APP_ENV = "production"
  try {
    const response = GET()
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      effective: true,
      signupAvailable: true,
      version: "2026-10-15-adult-chat-1",
      effectiveDate: "2026-10-15",
    })
  } finally {
    process.env.APP_ENV = previousAppEnv ?? ""
  }
})
