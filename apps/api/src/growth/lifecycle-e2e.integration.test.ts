// End-to-end proof for the lifecycle engine (workstream W1) against a real
// Development database, with a fixture play registered in this test only:
//   snapshot → play → policy → ledger → QA-routed email (capture transport)
//   → Resend "delivered" webhook → signed /go click → one-click unsubscribe.
//
// Run under the verified Development database profile with
// RUN_DATABASE_INTEGRATION_TESTS=1 and LIFECYCLE_E2E_TENANT_ID set to a QA
// business whose owner email is on a QA-routed domain, after today's
// snapshots exist. Nothing is sent live: the transport is an in-memory capture.
// Rows it creates (and a preference it creates) are deleted afterwards.

import { afterAll, describe, expect, test } from "bun:test"
import { createHmac, randomBytes } from "node:crypto"
import { prisma } from "@ewatrade/db"
import { growthSnapshotDay } from "@ewatrade/db/growth-snapshot"
import type { EmailMessage } from "@ewatrade/email"
import type { LifecyclePlay } from "@ewatrade/growth/contract"
import {
  defaultLifecycleDeps,
  evaluateLifecyclePlays,
  sendLifecycleEmail,
} from "@ewatrade/jobs/lifecycle"
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerLifecycleRoutes } from "./lifecycle-routes"

const enabled =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" &&
  Boolean(process.env.LIFECYCLE_E2E_TENANT_ID)
const suite = enabled ? describe : describe.skip

const tenantId = process.env.LIFECYCLE_E2E_TENANT_ID ?? ""
const LEDGER_PLAY_ID = "P04_site_setup:e2e-fixture"
const TEMPLATE_KEY = "lifecycle-e2e-fixture"
const webhookKey = randomBytes(32)
/** In-memory capture: the QA-routed message is recorded, never sent live. */
const captured: EmailMessage[] = []
const captureTransport = {
  async send(message: EmailMessage) {
    captured.push(message)
    return {
      provider: "capture",
      providerMessageId: `capture_${randomBytes(8).toString("hex")}`,
    }
  },
}

const env = {
  ...process.env,
  APP_ENV: "local",
  GROWTH_LIFECYCLE_ENABLED: "true",
  LIFECYCLE_EMAIL_FROM: "Ishaq from EwaTrade <ishaq@mail.ewatrade.test>",
  LIFECYCLE_LINK_SECRET: randomBytes(32).toString("hex"),
  LIFECYCLE_RESEND_WEBHOOK_SECRET: `whsec_${webhookKey.toString("base64")}`,
  NEXT_PUBLIC_DASHBOARD_URL: "https://ewatrade-dashboard.localhost",
  NEXT_PUBLIC_API_URL: "https://ewatrade-api.localhost",
}

/** Registered in this test only; never part of LIFECYCLE_PLAYS. */
const fixturePlay: LifecyclePlay = {
  id: "P04_site_setup",
  family: "adoption",
  consent: "productTips",
  channels: ["email"],
  realtime: false,
  eligible: ({ snapshot }) =>
    snapshot.tenantId === tenantId
      ? {
          periodKey: `e2e:${Date.now()}`,
          ledgerPlayId: LEDGER_PLAY_ID,
          templateKey: TEMPLATE_KEY,
          data: { catalogItems: snapshot.catalogItems },
          ctaPath: "/storefront",
        }
      : null,
  success: { windowDays: 7, achieved: () => false },
}

function signedWebhook(body: object) {
  const payload = JSON.stringify(body)
  const id = `msg_${randomBytes(6).toString("hex")}`
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

suite("lifecycle engine end to end (fixture play, QA routing)", () => {
  const createdIds: string[] = []
  let ownerUserId = ""
  let hadPreference = false

  afterAll(async () => {
    await prisma.lifecycleMessage.deleteMany({
      where: { id: { in: createdIds } },
    })
    if (ownerUserId && !hadPreference)
      await prisma.marketingPreference.deleteMany({
        where: { userId: ownerUserId },
      })
  })

  test("delivers to the QA inbox and records sent, delivered and clicked", async () => {
    const day = growthSnapshotDay(new Date())
    const snapshot = await prisma.businessGrowthSnapshot.findUnique({
      where: { tenantId_day: { tenantId, day } },
      select: { tenantId: true },
    })
    expect(snapshot).not.toBeNull() // built by the sweep's snapshot step today

    const owner = await prisma.membership.findFirstOrThrow({
      where: { tenantId, role: "OWNER", status: "ACTIVE" },
      select: { userId: true },
    })
    ownerUserId = owner.userId
    hadPreference = Boolean(
      await prisma.marketingPreference.findUnique({
        where: { userId: ownerUserId },
      }),
    )

    const deps = defaultLifecycleDeps({
      env,
      transport: captureTransport,
      plays: [fixturePlay],
      templates: {
        [TEMPLATE_KEY]: (input) => ({
          subject: "E2E: your site is one step away",
          content: {
            preview: "Fixture lifecycle email",
            firstName: input.firstName,
            lead: `You have ${String(input.data.catalogItems)} items ready for a site.`,
            cta: { href: input.ctaHref, label: "Open site setup" },
            businessName: input.businessName,
            unsubscribeUrl: input.unsubscribeUrl,
            preferencesUrl: input.preferencesUrl,
          },
        }),
      },
      // Inside the 08:00–20:00 WAT window regardless of when the test runs.
      now: () => {
        const now = new Date()
        now.setUTCHours(10, 0, 0, 0)
        return now
      },
    })

    // 1. Play → policy → ledger.
    const evaluated = await evaluateLifecyclePlays(deps, {
      tenantIds: [tenantId],
    })
    expect(evaluated.createdEmailIds.length).toBeGreaterThan(0)
    createdIds.push(...evaluated.createdEmailIds)
    const messageId = evaluated.createdEmailIds[0] ?? ""
    const ownerRow = await prisma.lifecycleMessage.findUniqueOrThrow({
      where: { id: messageId },
    })
    expect(ownerRow).toMatchObject({
      playId: LEDGER_PLAY_ID,
      channel: "email",
      status: "pending",
      templateKey: TEMPLATE_KEY,
    })

    // 2. Send: QA-routed, captured instead of a live provider call.
    expect(await sendLifecycleEmail(messageId, deps)).toBe("sent")
    const sent = await prisma.lifecycleMessage.findUniqueOrThrow({
      where: { id: messageId },
    })
    expect(sent.status).toBe("sent")
    expect(sent.providerMessageId).toBeTruthy()
    expect(captured).toHaveLength(1)
    const mail = captured[0] as EmailMessage & {
      headers: Record<string, string>
    }
    expect(mail.qaRouted).toBe(true)
    expect(mail.subject).toStartWith("[QA: ")
    expect(mail.to).not.toEndWith(".test")
    expect(mail.from).toBe(env.LIFECYCLE_EMAIL_FROM)
    expect(mail.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    )

    // 3. Resend delivered webhook → deliveredAt.
    const app = new OpenAPIHono()
    registerLifecycleRoutes(app, { config: env })
    const webhook = await app.request(
      "/api/lifecycle/webhooks/resend",
      signedWebhook({
        type: "email.delivered",
        created_at: new Date().toISOString(),
        data: {
          email_id: sent.providerMessageId,
          tags: { category: "lifecycle" },
        },
      }),
    )
    expect(webhook.status).toBe(200)

    // 4. Click the CTA from the captured email → clickedAt + UTM redirect.
    const goPath = /https:\/\/ewatrade-api\.localhost(\/go\/[^"\s]+)/.exec(
      mail.html,
    )?.[1]
    expect(goPath).toBeTruthy()
    const click = await app.request(goPath ?? "")
    expect(click.status).toBe(302)
    expect(click.headers.get("location")).toBe(
      `https://ewatrade-dashboard.localhost/storefront?utm_source=lifecycle&utm_medium=email&utm_campaign=${encodeURIComponent(LEDGER_PLAY_ID)}`,
    )

    const tracked = await prisma.lifecycleMessage.findUniqueOrThrow({
      where: { id: messageId },
    })
    expect(tracked.deliveredAt).toBeInstanceOf(Date)
    expect(tracked.clickedAt).toBeInstanceOf(Date)
    console.info("[lifecycle-e2e]", {
      messageId,
      status: tracked.status,
      providerMessageId: tracked.providerMessageId,
      sentAt: tracked.sentAt,
      deliveredAt: tracked.deliveredAt,
      clickedAt: tracked.clickedAt,
      qaRoutedSubject: mail.subject.replace(/\[QA: [^\]]+\]/, "[QA: <owner>]"),
    })

    // 5. RFC 8058 one-click unsubscribe from the List-Unsubscribe header.
    if (!hadPreference) {
      const unsubscribeUrl = new URL(
        /<([^>]+)>/.exec(mail.headers["List-Unsubscribe"] ?? "")?.[1] ?? "",
      )
      const unsubscribe = await app.request(
        unsubscribeUrl.pathname + unsubscribeUrl.search,
        {
          method: "POST",
          body: "List-Unsubscribe=One-Click",
          headers: { "content-type": "application/x-www-form-urlencoded" },
        },
      )
      expect(unsubscribe.status).toBe(200)
      const preference = await prisma.marketingPreference.findUniqueOrThrow({
        where: { userId: ownerUserId },
      })
      expect(preference.unsubscribedAllAt).toBeInstanceOf(Date)
    }
  }, 60_000)
})
