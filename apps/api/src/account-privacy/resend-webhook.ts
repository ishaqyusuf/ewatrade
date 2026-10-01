import { prisma } from "@ewatrade/db"
import {
  bindAccountPrivacyNoticeProviderEvent,
  recordAccountPrivacyNoticeDelivery,
  recordAccountPrivacyNoticeFailure,
} from "@ewatrade/db/queries"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import { Resend } from "resend"

export function registerAccountPrivacyResendWebhook(
  app: OpenAPIHono,
  dependencies: {
    recordDelivery?: typeof recordAccountPrivacyNoticeDelivery
    recordFailure?: typeof recordAccountPrivacyNoticeFailure
    bindProviderEvent?: typeof bindAccountPrivacyNoticeProviderEvent
  } = {},
) {
  app.use(
    "/api/account-privacy/webhooks/resend",
    bodyLimit({ maxSize: 64 * 1024 }),
  )
  app.post("/api/account-privacy/webhooks/resend", async (c) => {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    const webhookSecret =
      process.env.ACCOUNT_PRIVACY_RESEND_WEBHOOK_SECRET?.trim()
    const recipientHmacKey =
      process.env.ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY?.trim()
    const policyVersion =
      process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
    if (
      process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
      process.env.ACCOUNT_PRIVACY_NOTICE_WEBHOOK_ENABLED !== "true" ||
      !apiKey ||
      !webhookSecret ||
      !recipientHmacKey ||
      recipientHmacKey.length < 32 ||
      !policyVersion
    )
      return c.json({ error: "Unavailable" }, 404)

    const payload = await c.req.text()
    let event: ReturnType<Resend["webhooks"]["verify"]>
    try {
      event = new Resend(apiKey).webhooks.verify({
        payload,
        headers: {
          id: c.req.header("svix-id") ?? "",
          timestamp: c.req.header("svix-timestamp") ?? "",
          signature: c.req.header("svix-signature") ?? "",
        },
        webhookSecret,
      })
    } catch {
      return c.json({ error: "Invalid signature" }, 401)
    }
    if (
      event.type !== "email.sent" &&
      event.type !== "email.delivered" &&
      event.type !== "email.bounced" &&
      event.type !== "email.failed" &&
      event.type !== "email.complained"
    )
      return c.json({ received: true, relevant: false }, 200)
    if (
      event.type === "email.sent" &&
      event.data.tags?.category !== "account_privacy_outcome_notice"
    )
      return c.json({ received: true, relevant: false }, 200)
    const recipient = event.data.to
    const recipientEmail = Array.isArray(recipient) ? recipient[0] : undefined
    const occurredAt = new Date(event.created_at)
    const providerCreatedAt = new Date(event.data.created_at)
    if (
      !event.data.email_id ||
      !Array.isArray(recipient) ||
      recipient.length !== 1 ||
      typeof recipientEmail !== "string" ||
      !Number.isFinite(occurredAt.getTime()) ||
      !Number.isFinite(providerCreatedAt.getTime())
    )
      return c.json({ error: "Invalid delivery event" }, 400)

    const providerMessageId = event.data.email_id
    const eventIdentity = {
      eventId: c.req.header("svix-id") ?? "",
      messageId: providerMessageId,
      recipient: recipientEmail,
      occurredAt,
    }
    const config = { policyVersion, recipientHmacKey }
    const noticeAttemptId =
      event.data.tags?.category === "account_privacy_outcome_notice"
        ? event.data.tags?.notice_attempt
        : undefined
    const bind = () =>
      (dependencies.bindProviderEvent ?? bindAccountPrivacyNoticeProviderEvent)(
        prisma,
        {
          attemptId: noticeAttemptId ?? "",
          providerMessageId,
          recipient: recipientEmail,
          providerCreatedAt,
          occurredAt,
          ...config,
        },
      )
    if (event.type === "email.sent") {
      if (!noticeAttemptId)
        return c.json({ received: true, relevant: false }, 200)
      const binding = await bind()
      return binding.bound
        ? c.json(
            {
              received: true,
              replay: "replay" in binding && binding.replay === true,
            },
            200,
          )
        : c.json({ error: "Send could not be reconciled" }, 409)
    }
    let result =
      event.type === "email.delivered"
        ? await (
            dependencies.recordDelivery ?? recordAccountPrivacyNoticeDelivery
          )(prisma, eventIdentity, config)
        : await (
            dependencies.recordFailure ?? recordAccountPrivacyNoticeFailure
          )(prisma, { ...eventIdentity, type: event.type }, config)
    if (!result.recorded) {
      if (result.reason === "UNKNOWN_MESSAGE") {
        if (noticeAttemptId) {
          const binding = await bind()
          if (binding.bound) {
            result =
              event.type === "email.delivered"
                ? await (
                    dependencies.recordDelivery ??
                    recordAccountPrivacyNoticeDelivery
                  )(prisma, eventIdentity, config)
                : await (
                    dependencies.recordFailure ??
                    recordAccountPrivacyNoticeFailure
                  )(prisma, { ...eventIdentity, type: event.type }, config)
          }
          if (!result.recorded)
            return c.json({ error: "Delivery could not be reconciled" }, 409)
        } else if (
          event.data.tags?.category === "account_privacy_outcome_notice"
        )
          return c.json({ error: "Notice attempt tag is missing" }, 409)
        else return c.json({ received: true, relevant: false }, 200)
      }
      if (!result.recorded)
        return c.json({ error: "Delivery could not be reconciled" }, 409)
    }
    if ("completedRequest" in result && result.completedRequest)
      console.error("[account-privacy] notice failure after completion")
    return c.json(
      { received: true, replay: "replay" in result && result.replay === true },
      200,
    )
  })
}
