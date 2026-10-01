import { expect, test } from "bun:test"

test("production direct Better Auth signup cannot bypass versioned acceptance", async () => {
  const previousAppEnv = process.env.APP_ENV
  process.env.APP_ENV = "production"
  try {
    const { app } = await import("../index")
    const response = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not JSON",
    })
    expect(response.status).toBe(404)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      error: "Account creation is unavailable here.",
    })
  } finally {
    process.env.APP_ENV = previousAppEnv ?? ""
  }
})

test("anonymous Better Auth session probe remains available for API health checks", async () => {
  const { app } = await import("../index")
  const response = await app.request("/api/auth/get-session")
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("application/json")
  expect(await response.json()).toBeNull()
})
