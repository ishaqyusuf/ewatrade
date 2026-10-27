import {
  manualPaymentSocketPath,
  manualPaymentWebSocket,
  receiveManualPaymentStatusHint,
  upgradeManualPaymentSocket,
} from "./status-socket"
// Optional deployment entrypoint for a WebSocket-capable host. Vercel HTTP
// functions cannot host this socket. No process/provider is started by imports.
if (import.meta.main) {
  Bun.serve({
    hostname: "0.0.0.0",
    port: Number(process.env.PORT ?? 3096),
    websocket: manualPaymentWebSocket,
    fetch(request, server) {
      const path = new URL(request.url).pathname
      if (path === manualPaymentSocketPath)
        return upgradeManualPaymentSocket(request, server)
      if (path === "/internal/manual-payment-status")
        return receiveManualPaymentStatusHint(request)
      return new Response(null, { status: 404 })
    },
  })
}
