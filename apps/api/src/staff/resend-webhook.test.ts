import { describe, expect, test } from "bun:test"
import { createHash, createHmac, randomBytes } from "node:crypto"
import type { StaffInvitationProviderEvent } from "@ewatrade/db/queries"
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerStaffInvitationResendWebhook } from "./resend-webhook"

const key = randomBytes(32)
const config = {
  STAFF_INVITATION_RECONCILIATION_ENABLED: "true",
  STAFF_INVITATION_RESEND_WEBHOOK_SECRET: `whsec_${key.toString("base64")}`,
}
function event(type = "email.delivered") {
  return {
    type,
    created_at: new Date().toISOString(),
    data: {
      email_id: "provider-message",
      created_at: new Date(Date.now() - 1000).toISOString(),
      to: ["tester@example.com"],
      subject: "DO NOT RETAIN",
      html: "PRIVATE LINK",
      tags: {
        category: "staff_invitation",
        tenant_id: "tenant",
        notification_id: "notification",
        payload_hash: "a".repeat(64),
        destination_digest: createHash("sha256")
          .update("tester@example.com")
          .digest("hex"),
      },
    },
  }
}
function request(
  payload: string,
  timestamp = String(Math.floor(Date.now() / 1000)),
  signingKey = key,
) {
  const id = "msg_test"
  const signature = createHmac("sha256", signingKey)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64")
  return new Request("http://localhost/api/staff/invitations/webhooks/resend", {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
  })
}
function fixture(
  env = config,
  result = { recorded: true, replay: false },
  fail = false,
) {
  const calls: StaffInvitationProviderEvent[] = []
  const app = new OpenAPIHono()
  registerStaffInvitationResendWebhook(app, {
    config: env,
    reconcile: async (input) => {
      calls.push(input)
      if (fail) throw Error("PRIVATE SQL PROVIDER CONTENT")
      return result
    },
  })
  return { app, calls }
}
describe("verified staff invitation callback", () => {
  test("default-off and missing secret cannot enter persistence", async () => {
    for (const env of [
      { ...config, STAFF_INVITATION_RECONCILIATION_ENABLED: "false" },
      { ...config, STAFF_INVITATION_RESEND_WEBHOOK_SECRET: "" },
    ]) {
      const f = fixture(env)
      expect(
        (await f.app.request(request(JSON.stringify(event())))).status,
      ).toBe(404)
      expect(f.calls).toEqual([])
    }
  })
  test("real SDK rejects stale signatures, changed raw bytes, wrong secret and missing headers", async () => {
    const f = fixture()
    const payload = JSON.stringify(event())
    const tampered = request(payload)
    const changed = new Request(tampered.url, {
      method: "POST",
      body: `${payload} `,
      headers: tampered.headers,
    })
    for (const req of [
      changed,
      request(payload, String(Math.floor(Date.now() / 1000) - 1000)),
      request(payload, undefined, randomBytes(32)),
      new Request(changed.url, { method: "POST", body: payload }),
    ])
      expect((await f.app.request(req)).status).toBe(401)
    expect(f.calls).toEqual([])
  })
  test("all six signed lifecycle events project only exact original delivery facts", async () => {
    const f = fixture()
    for (const type of [
      "email.sent",
      "email.delivered",
      "email.bounced",
      "email.failed",
      "email.complained",
      "email.suppressed",
    ] as const) {
      const response = await f.app.request(request(JSON.stringify(event(type))))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ received: true, replay: false })
      expect(f.calls.at(-1)?.type).toBe(type)
    }
    expect(Object.keys(f.calls[0] ?? {}).sort()).toEqual([
      "acceptedAt",
      "notificationId",
      "occurredAt",
      "payloadHash",
      "providerMessageId",
      "tenantId",
      "type",
    ])
    expect(JSON.stringify(f.calls)).not.toContain("PRIVATE")
    expect(JSON.stringify(f.calls)).not.toContain("tester@example.com")
  })
  test("unrelated verified events are ignored; malformed or different recipients never write", async () => {
    const f = fixture()
    expect(
      (await f.app.request(request(JSON.stringify(event("email.opened")))))
        .status,
    ).toBe(200)
    const other = event()
    other.data.tags.category = "other"
    expect((await f.app.request(request(JSON.stringify(other)))).status).toBe(
      200,
    )
    for (const value of [
      { ...event(), data: { ...event().data, to: ["different@example.com"] } },
      {
        ...event(),
        data: {
          ...event().data,
          to: ["tester@example.com", "second@example.com"],
        },
      },
      { ...event(), created_at: "invalid" },
      {
        ...event(),
        data: {
          ...event().data,
          tags: { ...event().data.tags, payload_hash: "wrong" },
        },
      },
    ])
      expect((await f.app.request(request(JSON.stringify(value)))).status).toBe(
        400,
      )
    expect(f.calls).toEqual([])
  })
  test("conflicts are retry-visible, persistence exceptions are redacted, replay acknowledged", async () => {
    const conflict = fixture(config, { recorded: false, replay: false })
    expect(
      (await conflict.app.request(request(JSON.stringify(event())))).status,
    ).toBe(409)
    const broken = fixture(config, { recorded: true, replay: false }, true)
    const response = await broken.app.request(request(JSON.stringify(event())))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("PRIVATE")
    const replay = fixture(config, { recorded: true, replay: true })
    expect(
      await (await replay.app.request(request(JSON.stringify(event())))).json(),
    ).toEqual({ received: true, replay: true })
  })
  test("oversized request is rejected before verification or persistence", async () => {
    const f = fixture()
    expect((await f.app.request(request(" ".repeat(65537)))).status).toBe(413)
    expect(f.calls).toEqual([])
  })
})
