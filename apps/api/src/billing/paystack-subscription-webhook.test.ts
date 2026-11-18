import { expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerPaystackSubscriptionWebhook } from "./paystack-subscription-webhook"

function fixture() {
  const state = { configured: true, fail: false, calls: [] as unknown[] }
  const app = new OpenAPIHono()
  registerPaystackSubscriptionWebhook(app, {
    configured: () => state.configured,
    secrets: () => [
      { kind: "signing", secret: "whsec_fixture" },
      { kind: "legacy", secret: "fixture-secret" },
    ],
    process: async (payload) => {
      state.calls.push(payload)
      if (state.fail) throw new Error("private provider payload")
    },
  })
  const request = (body: string, headers: Record<string, string>) =>
    app.request("/api/billing/webhooks/paystack", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json", ...headers },
    })
  const send = (
    body: string,
    signature: string | null = createHmac("sha512", "fixture-secret")
      .update(body)
      .digest("hex"),
  ) => request(body, signature ? { "x-paystack-signature": signature } : {})
  return { state, send, request }
}

test("the webhook authenticates raw bytes before parsing or processing any receipt", async () => {
  const { state, send } = fixture()
  const body = '{"event":"charge.success", "data":{"reference":"fixture"}}'
  expect((await send(body, null)).status).toBe(401)
  expect((await send(body, "0".repeat(128))).status).toBe(401)
  const signature = createHmac("sha512", "fixture-secret")
    .update(body)
    .digest("hex")
  expect((await send(body.replace(" ", ""), signature)).status).toBe(401)
  expect(state.calls).toHaveLength(0)
  expect((await send("invalid json")).status).toBe(400)
  expect((await send(body)).status).toBe(200)
  expect(state.calls).toEqual([JSON.parse(body)])
})

test("Paystack-Signature events authenticate with the signing secret and reject replays", async () => {
  const { state, request } = fixture()
  const body = '{"event":"charge.success","data":{"reference":"signed"}}'
  const now = Math.floor(Date.now() / 1000)
  const header = (t: number, secret = "whsec_fixture") =>
    `t=${t},v1=whk_fixture:${createHmac("sha512", secret)
      .update(`${t}.`)
      .update(body)
      .digest("hex")}`
  const post = (value: string) => request(body, { "paystack-signature": value })
  expect((await post(header(now - 301))).status).toBe(401)
  expect((await post(header(now, "whsec_other"))).status).toBe(401)
  expect(state.calls).toHaveLength(0)
  expect((await post(header(now))).status).toBe(200)
  expect(state.calls).toEqual([JSON.parse(body)])
})

test("unconfigured or unresolved events stay retryable without leaking private errors", async () => {
  const { state, send } = fixture()
  const body = '{"event":"charge.success","data":{}}'
  state.configured = false
  expect((await send(body)).status).toBe(503)
  expect(state.calls).toHaveLength(0)
  state.configured = true
  state.fail = true
  const response = await send(body)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain("private")
  expect((await send("x".repeat(256001))).status).toBe(413)
  expect(state.calls).toHaveLength(1)
})
