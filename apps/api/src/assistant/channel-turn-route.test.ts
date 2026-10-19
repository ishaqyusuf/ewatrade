import { expect, test } from "bun:test"
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerAssistantChannelTurnRoute } from "./channel-turn-route"

test("worker HTTP operation requires a configured constant-time key and an identifier-only body", async () => {
  const app = new OpenAPIHono()
  const calls: string[] = []
  registerAssistantChannelTurnRoute(app, {
    secret: () => "synthetic-internal-key",
    process: async (id) => {
      calls.push(id)
      return { status: "completed" }
    },
  })
  const post = (input: unknown, key = "synthetic-internal-key") =>
    app.request("/api/internal/assistant/channel-turn", {
      method: "POST",
      headers: { "x-internal-key": key },
      body: JSON.stringify(input),
    })
  expect((await post({ ingressId: "inbox-1" }, "wrong")).status).toBe(401)
  expect(
    (await post({ ingressId: "inbox-1", actorUserId: "foreign" })).status,
  ).toBe(400)
  expect(
    (await post({ ingressId: "inbox-1", tenantId: "foreign" })).status,
  ).toBe(400)
  expect((await post({ ingressId: "a".repeat(600) })).status).toBe(413)
  const response = await post({ ingressId: "inbox-1" })
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(await response.json()).toEqual({ status: "completed" })
  expect(calls).toEqual(["inbox-1"])
})
test("worker errors are safe and an absent machine key never authorizes a request", async () => {
  const app = new OpenAPIHono()
  registerAssistantChannelTurnRoute(app, {
    secret: () => "synthetic-internal-key",
    process: async () => {
      throw Error("private-data-and-credentials")
    },
  })
  const response = await app.request("/api/internal/assistant/channel-turn", {
    method: "POST",
    headers: { "x-internal-key": "synthetic-internal-key" },
    body: JSON.stringify({ ingressId: "inbox-1" }),
  })
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain("private-data-and-credentials")
  const disabled = new OpenAPIHono()
  registerAssistantChannelTurnRoute(disabled, {
    secret: () => undefined,
    process: async () => {
      throw Error("must not run")
    },
  })
  expect(
    (
      await disabled.request("/api/internal/assistant/channel-turn", {
        method: "POST",
        body: "{}",
      })
    ).status,
  ).toBe(401)
})
