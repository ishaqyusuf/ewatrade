import { createHmac, timingSafeEqual } from "node:crypto"
import type { Server, ServerWebSocket, WebSocketHandler } from "bun"
import { paymentLinkSigningKey } from "./config"
import { manualReportIdentity } from "./manual-payment-tokens"

export type SocketData = {
  reportId: string | null
  expiresAt: number
  timer?: ReturnType<typeof setTimeout>
}
const listeners = new Map<string, Set<ServerWebSocket<SocketData>>>()
const hint = JSON.stringify({ type: "payment-report.updated" })
export const manualPaymentSocketPath = "/api/manual-payments/status"
function publishLocal(reportId: string) {
  for (const socket of listeners.get(reportId) ?? []) {
    if (socket.data.expiresAt <= Date.now())
      socket.close(1008, "Reconnect to continue")
    else socket.send(hint)
  }
}
const deliverySignature = (body: string) =>
  createHmac("sha256", paymentLinkSigningKey())
    .update(`manual-payment-socket:v1:${body}`)
    .digest("hex")

/** Delivery is an invalidation hint, never payment authority. Missed hints recover
 * through the customer's canonical status read on reconnect/fallback. */
export async function publishManualPaymentStatus(reportId: string) {
  publishLocal(reportId)
  const endpoint = process.env.PAYMENT_STATUS_SOCKET_PUBLISH_URL
  if (!endpoint) return
  const url = new URL(endpoint)
  if (url.protocol !== "https:" || url.username || url.password) return
  const body = JSON.stringify({ reportId, expiresAt: Date.now() + 30_000 })
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-payment-socket-signature": deliverySignature(body),
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    /* The committed result survives a missed socket notification. */
  }
}

export function manualPaymentStatusSocketUrl() {
  const explicit = process.env.PAYMENT_STATUS_SOCKET_URL
  if (explicit) {
    const url = new URL(explicit)
    return url.protocol === "wss:" && !url.username && !url.password
      ? url.href
      : null
  }
  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL
  if (!base) return null
  const url = new URL(base)
  if (url.protocol !== "https:" || !url.hostname.endsWith(".localhost"))
    return null
  url.protocol = "wss:"
  url.pathname = manualPaymentSocketPath
  url.search = ""
  url.hash = ""
  return url.href
}

export function upgradeManualPaymentSocket(
  request: Request,
  server: Server<SocketData>,
) {
  const origin = request.headers.get("origin")
  const allowed =
    process.env.PAYMENT_LINK_PUBLIC_ORIGIN ??
    process.env.NEXT_PUBLIC_DASHBOARD_URL
  if (!allowed || !origin || origin !== new URL(allowed).origin)
    return new Response("Forbidden", { status: 403 })
  if (
    server.upgrade(request, {
      data: { reportId: null, expiresAt: Date.now() + 5000 },
    })
  )
    return undefined
  return new Response("WebSocket upgrade required", { status: 426 })
}
export const manualPaymentWebSocket: WebSocketHandler<SocketData> = {
  maxPayloadLength: 1024,
  idleTimeout: 60,
  open(socket) {
    socket.data.timer = setTimeout(
      () => socket.close(1008, "Authentication expired"),
      5000,
    )
  },
  message(socket, bytes) {
    try {
      if (socket.data.reportId) {
        socket.close(1008, "Already subscribed")
        return
      }
      const value: unknown = JSON.parse(String(bytes))
      if (
        !value ||
        typeof value !== "object" ||
        !("reportToken" in value) ||
        typeof value.reportToken !== "string"
      )
        throw new Error("Invalid message")
      const proof = manualReportIdentity(value.reportToken)
      if (socket.data.timer) clearTimeout(socket.data.timer)
      socket.data.reportId = proof.reportId
      socket.data.expiresAt = Math.min(
        proof.expiresAt.getTime(),
        Date.now() + 15 * 60_000,
      )
      const set =
        listeners.get(proof.reportId) ?? new Set<ServerWebSocket<SocketData>>()
      set.add(socket)
      listeners.set(proof.reportId, set)
      socket.data.timer = setTimeout(
        () => socket.close(1000, "Refresh status connection"),
        socket.data.expiresAt - Date.now(),
      )
      socket.send(hint)
    } catch {
      socket.close(1008, "Invalid status access")
    }
  },
  close(socket) {
    if (socket.data.timer) clearTimeout(socket.data.timer)
    const reportId = socket.data.reportId
    if (!reportId) return
    const set = listeners.get(reportId)
    set?.delete(socket)
    if (!set?.size) listeners.delete(reportId)
  },
}

/** For a separately hosted Bun socket runtime; no database or financial writer. */
export async function receiveManualPaymentStatusHint(request: Request) {
  if (request.method !== "POST" || !request.body)
    return new Response(null, { status: 400 })
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 512) {
      void reader.cancel()
      return new Response(null, { status: 400 })
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const body = new TextDecoder().decode(bytes)
  const received = request.headers.get("x-payment-socket-signature") ?? ""
  const expected = deliverySignature(body)
  if (
    !/^[a-f0-9]{64}$/.test(received) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  )
    return new Response(null, { status: 401 })
  try {
    const value = JSON.parse(body)
    if (
      !/^[a-zA-Z0-9_-]{1,128}$/.test(value.reportId) ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt < Date.now() ||
      value.expiresAt > Date.now() + 30_000
    )
      throw new Error("Expired")
    publishLocal(value.reportId)
    return new Response(null, { status: 204 })
  } catch {
    return new Response(null, { status: 400 })
  }
}
