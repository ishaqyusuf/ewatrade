// Lifecycle marketing tracking routes (plan §4.2, workstream W1):
//   GET  /go/:token                       signed click redirect → Dashboard + UTM
//   POST /lifecycle/unsubscribe?token=    RFC 8058 one-click unsubscribe
//   GET  /lifecycle/unsubscribe?token=    human fallback → preference page
//   POST /api/lifecycle/webhooks/resend   delivered/opened/bounced/complained
//
// Click and unsubscribe work whenever LIFECYCLE_LINK_SECRET is set, even with
// GROWTH_LIFECYCLE_ENABLED off, so links in mail already sent keep working.

import { prisma } from "@ewatrade/db"
import {
  markLifecycleMessageClicked,
  markLifecycleMessageDelivered,
  markLifecycleMessageOpened,
  recordLifecycleMessageBounce,
  setMarketingPreference,
} from "@ewatrade/db/lifecycle-messages"
import {
  lifecycleLinkSecret,
  lifecycleRedirectUrl,
  verifyLifecycleClickToken,
  verifyLifecyclePreferenceToken,
} from "@ewatrade/growth/links"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import { Resend } from "resend"
import { z } from "zod"

type Env = Partial<Record<string, string | undefined>>

export type LifecycleRouteDependencies = {
  config?: Env
  clicked?: typeof markLifecycleMessageClicked
  unsubscribe?: (userId: string) => Promise<unknown>
  delivered?: (providerMessageId: string, at: Date) => Promise<boolean>
  opened?: (providerMessageId: string, at: Date) => Promise<boolean>
  bounced?: (input: {
    providerMessageId: string
    kind: "bounced" | "complained"
    at: Date
  }) => Promise<string | null>
}

export function lifecycleDashboardOrigin(config: Env) {
  try {
    const url = new URL(
      config.NEXT_PUBLIC_DASHBOARD_URL ??
        `https://dash.${config.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"}`,
    )
    return url.protocol === "https:" ? url.origin : null
  } catch {
    return null
  }
}

const noStore = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
}

const resendEventSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z
    .object({
      email_id: z.string().min(1).max(200),
      created_at: z.string().optional(),
      tags: z.record(z.string(), z.string()).optional(),
      bounce: z.object({ type: z.string().optional() }).optional(),
    })
    .passthrough(),
})

export function registerLifecycleRoutes(
  app: OpenAPIHono,
  dependencies: LifecycleRouteDependencies = {},
) {
  const config = () => dependencies.config ?? process.env

  app.get("/go/:token", async (c) => {
    const env = config()
    const origin = lifecycleDashboardOrigin(env)
    const secret = lifecycleLinkSecret(env)
    if (!origin) return c.json({ error: "Unavailable" }, 404)
    const home = new URL("/", origin).href
    const token = secret
      ? verifyLifecycleClickToken(c.req.param("token"), secret)
      : null
    if (!token) return c.redirect(home, 302)
    let playId = "lifecycle"
    try {
      const clicked = await (
        dependencies.clicked ?? markLifecycleMessageClicked
      )(prisma, token.m)
      if (clicked) playId = clicked.playId
    } catch (error) {
      // Never strand the owner on an error page because tracking failed.
      console.error("[lifecycle] click record failed", {
        error: error instanceof Error ? error.message : "unknown",
      })
    }
    for (const [key, value] of Object.entries(noStore)) c.header(key, value)
    return c.redirect(lifecycleRedirectUrl(origin, token.p, playId).href, 302)
  })

  const unsubscribePath = "/lifecycle/unsubscribe"
  app.use(unsubscribePath, bodyLimit({ maxSize: 4 * 1024 }))
  app.post(unsubscribePath, async (c) => {
    const secret = lifecycleLinkSecret(config())
    const token = secret
      ? verifyLifecyclePreferenceToken(c.req.query("token") ?? "", secret)
      : null
    if (!token) return c.json({ error: "Invalid link" }, 400)
    await (
      dependencies.unsubscribe ??
      ((userId) =>
        setMarketingPreference(prisma, userId, { unsubscribeAll: true }))
    )(token.u)
    for (const [key, value] of Object.entries(noStore)) c.header(key, value)
    return c.json({ unsubscribed: true }, 200)
  })
  // A GET must never unsubscribe (link scanners prefetch); show the page instead.
  app.get(unsubscribePath, (c) => {
    const origin = lifecycleDashboardOrigin(config())
    if (!origin) return c.json({ error: "Unavailable" }, 404)
    const page = new URL("/email-preferences", origin)
    const token = c.req.query("token")
    if (token && token.length <= 2048) {
      page.searchParams.set("token", token)
      page.searchParams.set("unsubscribe", "1")
    }
    for (const [key, value] of Object.entries(noStore)) c.header(key, value)
    return c.redirect(page.href, 302)
  })

  const webhookPath = "/api/lifecycle/webhooks/resend"
  app.use(webhookPath, bodyLimit({ maxSize: 64 * 1024 }))
  app.post(webhookPath, async (c) => {
    const env = config()
    const secret = env.LIFECYCLE_RESEND_WEBHOOK_SECRET?.trim()
    if (!secret) return c.json({ error: "Unavailable" }, 404)
    let event: unknown
    try {
      event = new Resend(
        env.RESEND_API_KEY?.trim() || "verification-only",
      ).webhooks.verify({
        payload: await c.req.text(),
        webhookSecret: secret,
        headers: {
          id: c.req.header("svix-id") ?? "",
          timestamp: c.req.header("svix-timestamp") ?? "",
          signature: c.req.header("svix-signature") ?? "",
        },
      })
    } catch {
      return c.json({ error: "Invalid signature" }, 401)
    }
    const parsed = resendEventSchema.safeParse(event)
    if (!parsed.success || parsed.data.data.tags?.category !== "lifecycle")
      return c.json({ received: true, relevant: false }, 200)
    const { type, data } = parsed.data
    const at = new Date(parsed.data.created_at ?? Date.now())
    const occurredAt = Number.isNaN(at.getTime()) ? new Date() : at
    try {
      switch (type) {
        case "email.delivered":
          await (
            dependencies.delivered ??
            ((id, when) => markLifecycleMessageDelivered(prisma, id, when))
          )(data.email_id, occurredAt)
          break
        case "email.opened":
          await (
            dependencies.opened ??
            ((id, when) => markLifecycleMessageOpened(prisma, id, when))
          )(data.email_id, occurredAt)
          break
        case "email.bounced":
          // Soft bounces arrive as delivery_delayed; only a permanent bounce stops mail.
          if (data.bounce?.type && data.bounce.type !== "Permanent") break
          await (
            dependencies.bounced ??
            ((input) => recordLifecycleMessageBounce(prisma, input))
          )({
            providerMessageId: data.email_id,
            kind: "bounced",
            at: occurredAt,
          })
          break
        case "email.complained":
          await (
            dependencies.bounced ??
            ((input) => recordLifecycleMessageBounce(prisma, input))
          )({
            providerMessageId: data.email_id,
            kind: "complained",
            at: occurredAt,
          })
          break
        default:
          return c.json({ received: true, relevant: false }, 200)
      }
      return c.json({ received: true }, 200)
    } catch {
      return c.json({ error: "Delivery reconciliation unavailable" }, 503)
    }
  })
}
