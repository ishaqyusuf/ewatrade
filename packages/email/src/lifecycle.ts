import {
  type LifecycleEmailContent,
  lifecycleUnsubscribeHeaders,
  renderLifecycleEmail,
} from "../components/lifecycle-layout"
import { isValidEmailSender } from "./email-sender"

export type LifecycleEmailEnv = {
  /** e.g. `Ishaq from EwaTrade <ishaq@mail.ewatrade.com>`, on the lifecycle subdomain. */
  LIFECYCLE_EMAIL_FROM?: string
  /** Where replies go (the support inbox). Optional. */
  LIFECYCLE_EMAIL_REPLY_TO?: string
}

/**
 * Lifecycle mail only ever leaves from its own sending subdomain so marketing
 * complaints cannot hurt login-code delivery. There is deliberately no
 * fallback to `EMAIL_FROM`: without `LIFECYCLE_EMAIL_FROM` nothing is sent.
 */
export function lifecycleEmailSender(env: LifecycleEmailEnv) {
  const from = env.LIFECYCLE_EMAIL_FROM?.trim()
  return from && isValidEmailSender(from) ? from : null
}

export function lifecycleEmailReplyTo(env: LifecycleEmailEnv) {
  const replyTo = env.LIFECYCLE_EMAIL_REPLY_TO?.trim()
  return replyTo && isValidEmailSender(replyTo) ? replyTo : undefined
}

/** Resend tag values allow ASCII letters, digits, `_` and `-` only. */
export function lifecycleTagValue(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256)
}

export function createLifecycleEmailMessage(input: {
  from: string
  to: string
  replyTo?: string
  subject: string
  content: LifecycleEmailContent
  /** HTTPS endpoint that accepts the RFC 8058 one-click POST. */
  oneClickUnsubscribeUrl: string
  /** LifecycleMessage id: the provider idempotency key. */
  messageId: string
  playId: string
}) {
  const rendered = renderLifecycleEmail(input.content)
  return {
    from: input.from,
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    html: rendered.html,
    text: rendered.text,
    headers: lifecycleUnsubscribeHeaders(input.oneClickUnsubscribeUrl),
    idempotencyKey: `lifecycle/${input.messageId}`,
    tags: [
      { name: "category", value: "lifecycle" },
      { name: "play", value: lifecycleTagValue(input.playId) },
    ],
  }
}
