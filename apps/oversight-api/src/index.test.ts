import { afterEach, expect, test } from "bun:test"
import { createOversightApp } from "./service"

const originalKey = process.env.OVERSIGHT_READ_KEY
afterEach(() => {
  if (originalKey === undefined) delete process.env.OVERSIGHT_READ_KEY
  else process.env.OVERSIGHT_READ_KEY = originalKey
})

test("health and rejected requests do not initialize the database", async () => {
  process.env.OVERSIGHT_READ_KEY = "a".repeat(64)
  let initializations = 0
  const app = createOversightApp(() => {
    initializations += 1
    throw new Error("Private database connection details")
  })
  const headers = { Authorization: `Bearer ${process.env.OVERSIGHT_READ_KEY}` }
  expect((await app.request("/health")).status).toBe(200)
  for (const path of ["summary", "businesses", "users", "records"]) {
    const rejected = await app.request(`/api/oversight/v1/${path}`)
    expect(rejected.status).toBe(401)
    expect(rejected.headers.get("Cache-Control")).toBe("no-store")
  }
  const invalidPeriod = await app.request("/api/oversight/v1/summary?days=31", {
    headers,
  })
  expect(invalidPeriod.status).toBe(400)
  for (const path of ["businesses", "users", "records"]) {
    const invalid = await app.request(
      `/api/oversight/v1/${path}?search=${"a".repeat(101)}`,
      { headers },
    )
    expect(invalid.status).toBe(400)
  }
  expect(initializations).toBe(0)

  const unavailable = await app.request("/api/oversight/v1/summary", { headers })
  expect(initializations).toBe(1)
  expect(unavailable.status).toBe(503)
  expect(unavailable.headers.get("Cache-Control")).toBe("no-store")
  expect(await unavailable.json()).toEqual({
    error: "Project data is unavailable",
  })
})
