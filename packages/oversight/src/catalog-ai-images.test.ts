import { expect, test } from "bun:test"
import { createCatalogAiOversightRoutes } from "./catalog-ai-images"
import { createOversightRoutes } from "./routes"
const db = () => {
  throw new Error("Invalid requests must not reach the database")
}
test("AI controls and reconciliation require distinct write credentials and an enabled writer", async () => {
  const oldRead = process.env.OVERSIGHT_READ_KEY
  const oldWrite = process.env.OVERSIGHT_WRITE_KEY
  process.env.OVERSIGHT_READ_KEY = "read".padEnd(40, "r")
  process.env.OVERSIGHT_WRITE_KEY = "write".padEnd(40, "w")
  try {
    const app = createCatalogAiOversightRoutes(db, true)
    expect((await app.request("/")).status).toBe(401)
    const mounted = createOversightRoutes(db)
    const headers = (key: string | undefined) => ({
      Authorization: `Bearer ${key}`,
    })
    for (const path of ["/library", "/library/result/image"]) {
      expect(
        (
          await mounted.request(`/ai-images${path}`, {
            headers: headers(process.env.OVERSIGHT_READ_KEY),
          })
        ).status,
      ).toBe(401)
    }
    const library = await mounted.request(
      "/ai-images/library?cursor=invalid.cursor",
      {
        headers: headers(process.env.OVERSIGHT_WRITE_KEY),
      },
    )
    expect(library.status).toBe(400)
    expect(library.headers.get("Cache-Control")).toBe("private, no-store")
    expect(
      (
        await mounted.request("/ai-images/token-usage", {
          headers: headers(process.env.OVERSIGHT_WRITE_KEY),
        })
      ).status,
    ).toBe(401)
    for (const path of ["/", "/requests/sample/reconcile"])
      expect(
        (
          await app.request(path, {
            method: path === "/" ? "PUT" : "POST",
            headers: {
              Authorization: `Bearer ${process.env.OVERSIGHT_READ_KEY}`,
            },
            body: "{}",
          })
        ).status,
      ).toBe(401)
    expect(
      (
        await createCatalogAiOversightRoutes(db).request("/", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${process.env.OVERSIGHT_WRITE_KEY}`,
          },
          body: "{}",
        })
      ).status,
    ).toBe(503)
    expect(
      (
        await app.request("/", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${process.env.OVERSIGHT_WRITE_KEY}`,
          },
          body: "{}",
        })
      ).status,
    ).toBe(400)
    process.env.OVERSIGHT_WRITE_KEY = process.env.OVERSIGHT_READ_KEY
    expect(
      (
        await mounted.request("/ai-images/library", {
          headers: headers(process.env.OVERSIGHT_WRITE_KEY),
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await app.request("/", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${process.env.OVERSIGHT_READ_KEY}`,
          },
          body: "{}",
        })
      ).status,
    ).toBe(401)
  } finally {
    if (oldRead === undefined)
      Reflect.deleteProperty(process.env, "OVERSIGHT_READ_KEY")
    else process.env.OVERSIGHT_READ_KEY = oldRead
    if (oldWrite === undefined)
      Reflect.deleteProperty(process.env, "OVERSIGHT_WRITE_KEY")
    else process.env.OVERSIGHT_WRITE_KEY = oldWrite
  }
})
