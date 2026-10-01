import { describe, expect, test } from "bun:test"
import { app } from "../index"

describe("mobile search transport", () => {
  test("accepts a query in the POST body without URL input", async () => {
    const response = await app.request(
      "http://localhost/api/trpc/search.global",
      {
        body: JSON.stringify({ json: { limit: 6, query: "sample" } }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    )

    // The anonymous request reaches the protected procedure, rather than
    // failing tRPC's query-method check or exposing input in the URL.
    expect(response.status).toBe(401)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.text()).toContain("UNAUTHORIZED")
  })
})
