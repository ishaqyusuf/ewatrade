import { describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import {
  signLifecycleClickToken,
  signLifecyclePreferenceToken,
} from "@ewatrade/growth/links"
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerLifecycleRoutes } from "./lifecycle-routes"

const secret = "k".repeat(40)
const webhookKey = Buffer.from("w".repeat(32))
const webhookSecret = `whsec_${webhookKey.toString("base64")}`
const config = {
  LIFECYCLE_LINK_SECRET: secret,
  LIFECYCLE_RESEND_WEBHOOK_SECRET: webhookSecret,
  NEXT_PUBLIC_DASHBOARD_URL: "https://dash.ewatrade.test",
}

function app(overrides: Parameters<typeof registerLifecycleRoutes>[1] = {}) {
  const calls: Array<[string, unknown]> = []
  const instance = new OpenAPIHono()
  registerLifecycleRoutes(instance, {
    config,
    clicked: async (_db, id) => {
      calls.push(["clicked", id])
      return { id, playId: "P04_site_setup" }
    },
    unsubscribe: async (userId) => calls.push(["unsubscribe", userId]),
    delivered: async (id) => {
      calls.push(["delivered", id])
      return true
    },
    opened: async (id) => {
      calls.push(["opened", id])
      return true
    },
    bounced: async (input) => {
      calls.push([input.kind, input.providerMessageId])
      return "user_1"
    },
    ...overrides,
  })
  return { instance, calls }
}

function signed(body: object) {
  const payload = JSON.stringify(body)
  const id = "msg_test"
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac("sha256", webhookKey)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64")
  return {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
  }
}

describe("lifecycle routes", () => {
  test("click records and redirects to the Dashboard path with UTM", async () => {
    const { instance, calls } = app()
    const token = signLifecycleClickToken(
      { m: "msg_1", p: "/storefront" },
      secret,
    )
    const response = await instance.request(`/go/${token}`)
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://dash.ewatrade.test/storefront?utm_source=lifecycle&utm_medium=email&utm_campaign=P04_site_setup",
    )
    expect(calls).toEqual([["clicked", "msg_1"]])
  })

  test("a bad click token goes home without recording", async () => {
    const { instance, calls } = app()
    const response = await instance.request("/go/not.valid")
    expect(response.headers.get("location")).toBe("https://dash.ewatrade.test/")
    expect(calls).toEqual([])
  })

  test("one-click POST unsubscribes; GET only shows the page", async () => {
    const { instance, calls } = app()
    const token = signLifecyclePreferenceToken("user_1", secret)
    const get = await instance.request(`/lifecycle/unsubscribe?token=${token}`)
    expect(get.status).toBe(302)
    expect(get.headers.get("location")).toContain("/email-preferences?token=")
    expect(calls).toEqual([])
    const post = await instance.request(
      `/lifecycle/unsubscribe?token=${token}`,
      {
        method: "POST",
        body: "List-Unsubscribe=One-Click",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      },
    )
    expect(post.status).toBe(200)
    expect(calls).toEqual([["unsubscribe", "user_1"]])
    const forged = await instance.request("/lifecycle/unsubscribe?token=x.y", {
      method: "POST",
    })
    expect(forged.status).toBe(400)
  })

  test("Resend events update lifecycle messages; other categories are ignored", async () => {
    const { instance, calls } = app()
    const event = (
      type: string,
      extra: object = {},
      category = "lifecycle",
    ) => ({
      type,
      created_at: "2026-11-12T10:00:00.000Z",
      data: { email_id: `re_${type}`, tags: { category }, ...extra },
    })
    for (const body of [
      event("email.delivered"),
      event("email.opened"),
      event("email.bounced", { bounce: { type: "Transient" } }),
      event("email.bounced", { bounce: { type: "Permanent" } }),
      event("email.complained"),
      event("email.delivered", {}, "staff_invitation"),
    ]) {
      const response = await instance.request(
        "/api/lifecycle/webhooks/resend",
        signed(body),
      )
      expect(response.status).toBe(200)
    }
    expect(calls).toEqual([
      ["delivered", "re_email.delivered"],
      ["opened", "re_email.opened"],
      ["bounced", "re_email.bounced"],
      ["complained", "re_email.complained"],
    ])
    const unsigned = await instance.request("/api/lifecycle/webhooks/resend", {
      method: "POST",
      body: JSON.stringify(event("email.delivered")),
    })
    expect(unsigned.status).toBe(401)
  })
})
