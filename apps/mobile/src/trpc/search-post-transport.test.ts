import { describe, expect, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { createTRPCClient } from "@trpc/client"
import superjson from "superjson"
import { searchPostLink } from "./search-post-link"

describe("mobile search transport", () => {
  test("keeps search text out of the request URL", async () => {
    let sent: { body: string; method: string; url: string } | undefined
    const client = createTRPCClient<AppRouter>({
      links: [
        searchPostLink({
          fetch: async (input, init) => {
            const request = new Request(input, init)
            sent = {
              body: await request.clone().text(),
              method: request.method,
              url: request.url,
            }
            return Response.json(
              { error: { message: "Unauthorized" } },
              { status: 401 },
            )
          },
          transformer: superjson,
          url: "http://localhost/api/trpc",
        }),
      ],
    })

    await expect(
      client.search.global.query({ limit: 6, query: "sample" }),
    ).rejects.toThrow()
    expect(sent?.method).toBe("POST")
    expect(sent?.url).toBe("http://localhost/api/trpc/search.global")
    expect(sent?.body).toContain("sample")
  })
})
