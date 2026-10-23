import { expect, test } from "bun:test"
import type { EventMetadata } from "@ewatrade/events/metadata"
import { safeBatch } from "@ewatrade/events/policy"
import { createEventsRoute } from "@ewatrade/events/route"
import {
  captureMarketingInteraction,
  marketingInteraction,
} from "./marketing-interactions"

const cases: [string, string, string, string][] = [
  ...[
    "assistant_message",
    "assistant_answer",
    "assistant_error",
    "registration_start",
    "registration_review",
    "registration_code_sent",
    "registration_confirm",
    "registration_created",
    "registration_error",
    "registration_edit",
    "registration_open_dashboard",
  ].map((action): [string, string, string, string] => [
    action,
    "assistant_fab",
    "setup",
    "marketing_demo_interacted",
  ]),
  ["chat_open", "assistant_fab", "general", "marketing_demo_interacted"],
  ["chat_close", "assistant_fab", "general", "marketing_demo_interacted"],
  ["guide_message", "assistant_fab", "setup", "marketing_demo_interacted"],
  ["signup", "assistant_fab", "setup", "marketing_cta_clicked"],
  ["whatsapp", "assistant_fab", "whatsapp", "marketing_cta_clicked"],
  ["signup", "hero", "general", "marketing_cta_clicked"],
  ["whatsapp", "hero", "whatsapp", "marketing_cta_clicked"],
  ["whatsapp", "menu", "whatsapp", "marketing_cta_clicked"],
  ["whatsapp", "assistant", "whatsapp", "marketing_cta_clicked"],
  ["whatsapp", "closing", "whatsapp", "marketing_cta_clicked"],
  ["login", "header", "general", "marketing_cta_clicked"],
  ...["free", "starter", "growth", "pro"].map(
    (plan): [string, string, string, string] => [
      plan === "free" ? "signup" : "contact",
      "pricing",
      plan,
      "marketing_cta_clicked",
    ],
  ),
  ["conversation", "assistant", "setup", "marketing_demo_interacted"],
  ["platform", "hero", "whatsapp", "marketing_demo_interacted"],
  ["platform", "floating", "mobile", "marketing_demo_interacted"],
  ["confirm_sample", "assistant", "product", "marketing_demo_interacted"],
  ["pause", "business_ribbon", "general", "marketing_demo_interacted"],
  ["faq", "faq", "free", "marketing_demo_interacted"],
]
test("acquisition, all four plans and deliberate demo controls reach the existing metadata contract", () => {
  for (const [action, channel, category, name] of cases) {
    expect(marketingInteraction({ action, channel, category })).toEqual({
      name,
      properties: { surface: "marketing", action, channel, category },
    })
  }
  expect(
    marketingInteraction({
      action: "reply",
      channel: "assistant",
      category: "setup",
      status: "count_later",
    })?.properties.status,
  ).toBe("count_later")
  expect(
    marketingInteraction({
      action: "compare",
      channel: "pricing",
      status: "opened",
    })?.properties.status,
  ).toBe("opened")
})
test("unknown labels cannot turn chat contents, URLs or identities into analytics metadata", () => {
  for (const input of [
    { action: "https://wa.me/private", channel: "hero" },
    { action: "whatsapp", channel: "private@example.com" },
    { action: "reply", channel: "assistant", category: "private chat text" },
    { action: "reply", channel: "assistant", status: "private prompt" },
  ])
    expect(marketingInteraction(input)).toBeNull()
  const captured: { name: string; properties: EventMetadata }[] = []
  const payload = {
    action: "whatsapp",
    channel: "hero",
    category: "whatsapp",
    url: "https://wa.me/private?text=secret",
    email: "private@example.com",
    message: "private chat contents",
  }
  captureMarketingInteraction(
    (name, properties) => captured.push({ name, properties }),
    payload,
  )
  expect(JSON.stringify(captured)).not.toMatch(
    /secret|private|wa.me|email|message/,
  )
  expect(() =>
    captureMarketingInteraction(() => {
      throw new Error("offline")
    }, payload),
  ).not.toThrow()
})
test("marketing CTA and demo events survive the actual sanitizer and isolated Logly proxy", async () => {
  const previous = {
    collector: process.env.LOGLY_COLLECTOR_URL,
    key: process.env.LOGLY_MARKETING_PROJECT_KEY,
    fetch: globalThis.fetch,
  }
  let forwarded:
    | {
        project?: string
        events?: {
          name: string
          project: string
          properties: Record<string, unknown>
        }[]
      }
    | undefined
  const credential: { key: string | null } = { key: null }
  try {
    process.env.LOGLY_COLLECTOR_URL = "https://collector.example"
    process.env.LOGLY_MARKETING_PROJECT_KEY = "marketing-cta-fixture"
    globalThis.fetch = Object.assign(
      async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        forwarded = JSON.parse(String(init?.body))
        credential.key = new Headers(init?.headers).get("x-logly-project-key")
        return Response.json({ accepted: cases.length }, { status: 202 })
      },
      { preconnect: previous.fetch.preconnect },
    )
    const batch = safeBatch(
      {
        sentAt: new Date().toISOString(),
        sdk: { name: "@ishaqyusuf/logly-core", version: "0.2.0" },
        events: cases.map(([action, channel, category]) => ({
          eventId: crypto.randomUUID(),
          project: "wrong-project",
          version: 1,
          source: "browser",
          occurredAt: new Date().toISOString(),
          visitorId: "anonymous-fixture",
          route: "/?text=private",
          name:
            marketingInteraction({ action, channel, category })?.name ??
            "marketing_cta_clicked",
          properties: {
            ...marketingInteraction({ action, channel, category })?.properties,
            url: "private URL",
            message: "private prompt",
          },
        })),
      },
      "ewatrade-marketing",
    )
    const collected: NonNullable<typeof forwarded>["events"] = []
    for (let offset = 0; offset < batch.events.length; offset += 25) {
      const chunk = {
        ...batch,
        events: batch.events.slice(offset, offset + 25),
      }
      const response = await createEventsRoute("marketing")(
        new Request("https://ewatrade.com/api/analytics", {
          method: "POST",
          headers: {
            origin: "https://ewatrade.com",
            "content-type": "application/json",
          },
          body: JSON.stringify(chunk),
        }),
      )
      expect(response.status).toBe(202)
      collected.push(...(forwarded?.events ?? []))
    }
    expect(credential.key).toBe("marketing-cta-fixture")
    expect(collected).toHaveLength(cases.length)
    for (const event of collected) {
      expect(event.project).toBe("ewatrade-marketing")
      expect(event.properties.audience).toBe("anonymous")
      expect(event.properties).not.toHaveProperty("url")
      expect(event.properties).not.toHaveProperty("message")
    }
    expect(JSON.stringify(collected)).not.toContain("private")
    const denied = await createEventsRoute("marketing")(
      new Request("https://ewatrade.localhost/api/analytics", {
        method: "POST",
        headers: {
          origin: "https://ewatrade.localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify(batch),
      }),
    )
    expect(denied.status).toBe(403)
  } finally {
    globalThis.fetch = previous.fetch
    if (previous.collector === undefined)
      Reflect.deleteProperty(process.env, "LOGLY_COLLECTOR_URL")
    else process.env.LOGLY_COLLECTOR_URL = previous.collector
    if (previous.key === undefined)
      Reflect.deleteProperty(process.env, "LOGLY_MARKETING_PROJECT_KEY")
    else process.env.LOGLY_MARKETING_PROJECT_KEY = previous.key
  }
})
