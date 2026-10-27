import { afterAll, beforeAll, expect, test } from "bun:test"
import { createPaymentLinkToken } from "@ewatrade/payments"
import {
  manualPaymentWebSocket,
  publishManualPaymentStatus,
  receiveManualPaymentStatusHint,
  upgradeManualPaymentSocket,
} from "./status-socket"

const key = "manual-socket-test-key-32-characters-minimum"
// Bun supports request headers on its WebSocket client; DOM's declaration omits
// that documented server-test extension.
const BunWebSocket = WebSocket as unknown as {
  new (url: string, options: { headers: Record<string, string> }): WebSocket
}
const old = {
  key: process.env.PAYMENT_LINK_SIGNING_KEY,
  origin: process.env.PAYMENT_LINK_PUBLIC_ORIGIN,
  publish: process.env.PAYMENT_STATUS_SOCKET_PUBLISH_URL,
}
beforeAll(() => {
  process.env.PAYMENT_LINK_SIGNING_KEY = key
  process.env.PAYMENT_LINK_PUBLIC_ORIGIN =
    "https://ewatrade-dashboard.localhost"
  Reflect.deleteProperty(process.env, "PAYMENT_STATUS_SOCKET_PUBLISH_URL")
})
afterAll(() => {
  for (const [name, value] of Object.entries({
    PAYMENT_LINK_SIGNING_KEY: old.key,
    PAYMENT_LINK_PUBLIC_ORIGIN: old.origin,
    PAYMENT_STATUS_SOCKET_PUBLISH_URL: old.publish,
  })) {
    if (value === undefined) Reflect.deleteProperty(process.env, name)
    else process.env[name] = value
  }
})
const timeout = <T>(promise: Promise<T>) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Socket timeout")), 2000),
    ),
  ])

test("real sockets require report-scoped authentication and deliver no payment/PII payload", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    websocket: manualPaymentWebSocket,
    fetch: (request, instance) => upgradeManualPaymentSocket(request, instance),
  })
  const socket = new BunWebSocket(`ws://127.0.0.1:${server.port}`, {
    headers: { origin: "https://ewatrade-dashboard.localhost" },
  })
  const messages: string[] = []
  socket.addEventListener("message", (event) =>
    messages.push(String(event.data)),
  )
  try {
    await timeout(
      new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true })
        socket.addEventListener(
          "error",
          () => reject(new Error("Socket open failed")),
          { once: true },
        )
      }),
    )
    const first = new Promise<void>((resolve) =>
      socket.addEventListener("message", () => resolve(), { once: true }),
    )
    socket.send(
      JSON.stringify({
        reportToken: createPaymentLinkToken(
          { intentId: "report-a", expiresAt: new Date(Date.now() + 60000) },
          key,
          "manual-report",
        ),
      }),
    )
    await timeout(first)
    expect(messages).toEqual(['{"type":"payment-report.updated"}'])
    await publishManualPaymentStatus("report-b")
    expect(messages.length).toBe(1)
    const changed = new Promise<void>((resolve) =>
      socket.addEventListener("message", () => resolve(), { once: true }),
    )
    await publishManualPaymentStatus("report-a")
    await timeout(changed)
    expect(messages).toEqual([
      '{"type":"payment-report.updated"}',
      '{"type":"payment-report.updated"}',
    ])
  } finally {
    socket.close()
    void server.stop(true)
  }
})

test("payment-link token cannot subscribe to report changes; internal hints reject unsigned/oversized content", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    websocket: manualPaymentWebSocket,
    fetch: (request, instance) => upgradeManualPaymentSocket(request, instance),
  })
  const socket = new BunWebSocket(`ws://127.0.0.1:${server.port}`, {
    headers: { origin: "https://ewatrade-dashboard.localhost" },
  })
  try {
    await timeout(
      new Promise<void>((resolve) =>
        socket.addEventListener("open", () => resolve(), { once: true }),
      ),
    )
    const closed = new Promise<number>((resolve) =>
      socket.addEventListener("close", (event) => resolve(event.code), {
        once: true,
      }),
    )
    socket.send(
      JSON.stringify({
        reportToken: createPaymentLinkToken(
          { intentId: "report-a", expiresAt: new Date(Date.now() + 60000) },
          key,
        ),
      }),
    )
    expect(await timeout(closed)).toBe(1008)
    expect(
      (
        await receiveManualPaymentStatusHint(
          new Request("https://socket.test/internal", {
            method: "POST",
            body: '{"reportId":"a"}',
          }),
        )
      ).status,
    ).toBe(401)
    expect(
      (
        await receiveManualPaymentStatusHint(
          new Request("https://socket.test/internal", {
            method: "POST",
            body: "a".repeat(513),
          }),
        )
      ).status,
    ).toBe(400)
  } finally {
    socket.close()
    void server.stop(true)
  }
})
