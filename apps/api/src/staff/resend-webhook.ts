import { createHash } from "node:crypto"
import { prisma } from "@ewatrade/db"
import {
  type StaffInvitationProviderEvent,
  reconcileStaffInvitationProviderEvent,
} from "@ewatrade/db/queries"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import { Resend } from "resend"
import { z } from "zod"
import { staffInvitationProviderEventSchema } from "../schemas/staff-invitation-provider-event"

export function registerStaffInvitationResendWebhook(
  app: OpenAPIHono,
  dependencies: {
    config?: NodeJS.ProcessEnv
    reconcile?: (
      input: StaffInvitationProviderEvent,
    ) => Promise<{ recorded: boolean; replay?: boolean }>
  } = {},
) {
  const path = "/api/staff/invitations/webhooks/resend"
  app.use(path, bodyLimit({ maxSize: 64 * 1024 }))
  app.post(path, async (c) => {
    const config = dependencies.config ?? process.env
    const secret = config.STAFF_INVITATION_RESEND_WEBHOOK_SECRET?.trim()
    if (config.STAFF_INVITATION_RECONCILIATION_ENABLED !== "true" || !secret)
      return c.json({ error: "Unavailable" }, 404)
    let event: unknown
    try {
      event = new Resend(
        config.RESEND_API_KEY?.trim() || "verification-only",
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
    const envelope = z
      .object({
        type: z.string(),
        data: z
          .object({ tags: z.object({ category: z.string() }).optional() })
          .optional(),
      })
      .safeParse(event)
    if (
      !envelope.success ||
      envelope.data.data?.tags?.category !== "staff_invitation" ||
      ![
        "email.sent",
        "email.delivered",
        "email.bounced",
        "email.failed",
        "email.complained",
        "email.suppressed",
      ].includes(envelope.data.type)
    )
      return c.json({ received: true, relevant: false }, 200)
    const parsed = staffInvitationProviderEventSchema.safeParse(event)
    if (!parsed.success) return c.json({ error: "Invalid delivery event" }, 400)
    const { data, type, created_at } = parsed.data
    const recipient = data.to[0]
    if (
      !recipient ||
      createHash("sha256")
        .update(recipient.trim().toLowerCase())
        .digest("hex") !== data.tags.destination_digest
    )
      return c.json({ error: "Invalid delivery destination" }, 400)
    try {
      const input: StaffInvitationProviderEvent = {
        type,
        tenantId: data.tags.tenant_id,
        notificationId: data.tags.notification_id,
        payloadHash: data.tags.payload_hash,
        providerMessageId: data.email_id,
        acceptedAt: new Date(data.created_at),
        occurredAt: new Date(created_at),
      }
      const result = await (
        dependencies.reconcile ??
        ((input) => reconcileStaffInvitationProviderEvent(prisma, input))
      )(input)
      return result.recorded
        ? c.json({ received: true, replay: result.replay === true }, 200)
        : c.json({ error: "Delivery could not be reconciled" }, 409)
    } catch {
      return c.json({ error: "Delivery reconciliation unavailable" }, 503)
    }
  })
}
