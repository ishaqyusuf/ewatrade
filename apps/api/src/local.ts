import type { Server } from "bun"
import {
  type SocketData,
  manualPaymentSocketPath,
  manualPaymentWebSocket,
  upgradeManualPaymentSocket,
} from "./banking/status-socket"
import { app } from "./index"

const requestedPort = Number(
  process.env.PORT ?? process.env.PORTLESS_APP_PORT ?? 3095,
)
const port = Number.isFinite(requestedPort) ? requestedPort : 3095

export default {
  port,
  fetch(request: Request, server: Server<SocketData>) {
    if (new URL(request.url).pathname === manualPaymentSocketPath)
      return upgradeManualPaymentSocket(request, server)
    return app.fetch(request)
  },
  websocket: manualPaymentWebSocket,
  host: "0.0.0.0",
  idleTimeout: 60,
}
