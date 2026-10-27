import type { OpenAPIHono } from "@hono/zod-openapi"

/** Liveness must remain independent of database availability. */
export function registerHealthRoutes(
  app: OpenAPIHono,
  dependencies: { countAccounts: () => Promise<number> },
) {
  for (const path of ["/live", "/api/live"]) {
    app.get(path, (c) => {
      c.header("Cache-Control", "no-store")
      return c.json({ status: "ok" }, 200)
    })
  }
  for (const path of ["/health", "/api/health"]) {
    app.get(path, async (c) => {
      const start = performance.now()
      const accounts = await dependencies.countAccounts()
      c.header("Cache-Control", "no-store")
      c.header(
        "Server-Timing",
        `app;dur=${(performance.now() - start).toFixed(2)}`,
      )
      c.header("X-Server-Timestamp", Date.now().toString())
      return c.json({ status: "ok", database: { accounts } }, 200)
    })
  }
}
