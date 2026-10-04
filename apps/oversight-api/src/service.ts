import { Hono } from "hono"
import { secureHeaders } from "hono/secure-headers"
import { createOversightReadClient } from "@ewatrade/db/oversight-client"
import { createOversightRoutes } from "@ewatrade/oversight"
export function createOversightApp(createClient = createOversightReadClient) {
  let client: ReturnType<typeof createOversightReadClient> | undefined
  const getDb = () => (client ??= createClient())
  const app = new Hono()
  app.use(secureHeaders())
  app.route("/api/oversight/v1", createOversightRoutes(getDb))
  app.get("/health", (c) =>
    c.json({ service: "ewatrade-oversight", version: 1, status: "ok" }),
  )
  app.onError((_error, c) =>
    c.json({ error: "Project data is unavailable" }, 503),
  )
  return app
}
export default createOversightApp()
