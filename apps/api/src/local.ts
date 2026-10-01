import { app } from "./index"

const requestedPort = Number(
  process.env.PORT ?? process.env.PORTLESS_APP_PORT ?? 3095,
)
const port = Number.isFinite(requestedPort) ? requestedPort : 3095

export default {
  port,
  fetch: app.fetch,
  host: "0.0.0.0",
  idleTimeout: 60,
}
