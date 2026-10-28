import { expect, test } from "bun:test"
import { renderStorefrontTemplateUpdateTemplate } from "@ewatrade/email"
import type { TemplateUpdate } from "@ewatrade/storefront-templates"
import {
  type TemplateEmailDependencies,
  type TemplateEmailOutcome,
  dispatchTemplateUpdateEmail,
  templateUpdateEmailConfigured,
  templateUpdateEmailUrl,
} from "./storefront-template-update-email"

const update: TemplateUpdate = {
  key: "commerce-studio",
  version: "1.2.0",
  title: "Make your storefront yours",
  changes: ["Choose your welcome photo.", "Change your shop button text."],
  fromVersions: ["1.0.0", "1.1.0"],
}
const config: Partial<NodeJS.ProcessEnv> = {
  APP_ENV: "production",
  NODE_ENV: "production",
  STOREFRONT_TEMPLATE_UPDATE_EMAILS_ENABLED: "true",
  EMAIL_DELIVERY_MODE: "live",
  EMAIL_FROM: "EwaTrade <hello@ewatrade.com>",
  RESEND_API_KEY: "unit-test-not-a-key",
  NEXT_PUBLIC_DASHBOARD_URL: "https://dash.ewatrade.com",
}
function setup(overrides: Partial<TemplateEmailDependencies> = {}) {
  const outcomes: TemplateEmailOutcome[] = []
  const sent: Parameters<TemplateEmailDependencies["send"]>[0][] = []
  const deps: TemplateEmailDependencies = {
    config,
    claim: async () => true,
    recipient: async () => ({
      businessName: "Tola & Co",
      recipient: "owner@example.test",
    }),
    assertProviderAllowed: async () => {},
    start: async () => true,
    finish: async (outcome) => {
      outcomes.push(outcome)
    },
    send: async (message) => {
      sent.push(message)
      return { provider: "resend", providerMessageId: "provider-1" }
    },
    ...overrides,
  }
  const run = () =>
    dispatchTemplateUpdateEmail(
      { id: "outbox-1", tenantId: "business-1", update },
      deps,
    )
  return { run, outcomes, sent }
}
test("production opt-in, valid live transport, no capture and sender are all required", () => {
  expect(templateUpdateEmailConfigured(config)).toBe(true)
  for (const override of [
    { APP_ENV: "local" },
    { NODE_ENV: "development" as const },
    { DEV_PROFILE: "local" },
    { VERCEL_ENV: "preview" },
    { STOREFRONT_TEMPLATE_UPDATE_EMAILS_ENABLED: "false" },
    { EMAIL_DELIVERY_MODE: "console" },
    { EMAIL_CAPTURE_FILE: "/tmp/mail" },
    { RESEND_API_KEY: "" },
    { EMAIL_FROM: "" },
  ])
    expect(templateUpdateEmailConfigured({ ...config, ...override })).toBe(
      false,
    )
})
test("one accepted notice uses stable provider idempotency and a business-bound normal navigation URL", async () => {
  const { run, outcomes, sent } = setup()
  expect(await run()).toBe("accepted")
  expect(outcomes).toEqual(["accepted"])
  expect(sent).toHaveLength(1)
  expect(sent[0]?.idempotencyKey).toBe("storefront-template-update/outbox-1")
  expect(sent[0]?.text).toContain(
    "Upgrade template: https://dash.ewatrade.com/storefront/updates/business-1/commerce-studio/1.2.0",
  )
  expect(sent[0]?.text).toContain(
    "Your live website stays the same until you review and publish.",
  )
})
test("revoked membership, preference off or already upgraded recipients never send", async () => {
  const before = setup({ recipient: async () => null })
  expect(await before.run()).toBe("skipped")
  expect(before.sent).toHaveLength(0)
  const after = setup({ start: async () => false })
  expect(await after.run()).toBe("skipped")
  expect(after.sent).toHaveLength(0)
})
test("concurrent dispatcher that loses the durable claim does nothing", async () => {
  let claimed = false
  const fixture = setup({
    claim: async () => {
      if (claimed) return false
      claimed = true
      return true
    },
  })
  const results = await Promise.all([fixture.run(), fixture.run()])
  expect(results.filter((result) => result === "accepted")).toHaveLength(1)
  expect(fixture.sent).toHaveLength(1)
})
test("pre-provider failure may retry, provider timeout or unconfirmed receipt becomes unknown", async () => {
  const before = setup({
    assertProviderAllowed: async () => {
      throw Error("blocked")
    },
  })
  expect(await before.run()).toBe("retry")
  expect(before.sent).toHaveLength(0)
  for (const send of [
    async () => {
      throw Error("timeout")
    },
    async () => undefined,
    async () => ({ provider: "console", providerMessageId: "fake" }),
  ]) {
    const fixture = setup({ send })
    expect(await fixture.run()).toBe("unknown")
    expect(fixture.outcomes).toEqual(["unknown"])
  }
})
test("invalid origins fail before a send and HTML escapes merchant content", () => {
  for (const base of [
    "http://dash.ewatrade.com",
    "https://user:secret@evil.test",
    "https://dash.ewatrade.com/path",
    "https://dash.ewatrade.com/?override=1",
    "javascript:alert(1)",
  ])
    expect(() =>
      templateUpdateEmailUrl(
        { NEXT_PUBLIC_DASHBOARD_URL: base },
        "business-1",
        update,
      ),
    ).toThrow()
  const email = renderStorefrontTemplateUpdateTemplate({
    businessName: "<script>bad()</script>",
    version: "1.2.0",
    title: "Your update",
    changes: ["<img src=x onerror=bad()>"],
    upgradeUrl: "https://dash.ewatrade.com/storefront",
  })
  expect(email.html).toContain('data-email-system="warm-desk"')
  expect(email.html).not.toContain("<script>bad()")
  expect(email.html).not.toContain("<img src=x")
  expect(email.text).toContain("Upgrade template:")
})
