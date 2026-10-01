import { expect, test } from "bun:test"
import { GET } from "./route"

test("production storefront does not offer signup with draft policies", async () => {
  const previousAppEnv = process.env.APP_ENV
  process.env.APP_ENV = "production"
  try {
    const response = GET()
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      effective: false,
      signupAvailable: false,
      version: null,
      effectiveDate: null,
    })
  } finally {
    process.env.APP_ENV = previousAppEnv ?? ""
  }
})
