import { createHash } from "node:crypto"
import { prisma } from "@ewatrade/db/client"
import { getPlayRefundReviewQueue } from "@ewatrade/db/queries"
import {
  type EmailMessage,
  isValidEmailSender,
  resendEmailTransport,
} from "@ewatrade/email"

type Queue = Awaited<ReturnType<typeof getPlayRefundReviewQueue>>
type Dependencies = {
  loadQueue: (now: Date) => Promise<Queue>
  send: (message: EmailMessage) => Promise<unknown>
}

const defaultDependencies: Dependencies = {
  loadQueue: (now) => getPlayRefundReviewQueue(prisma, now),
  send: (message) => resendEmailTransport.send(message),
}

function alertRecipients(value: string | undefined) {
  const recipients = [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
  if (
    recipients.length === 0 ||
    recipients.length > 5 ||
    recipients.some((email) => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email))
  )
    throw new Error("Play refund-review alert recipients are not configured.")
  return recipients
}

export async function runPlayRefundReviewAlert(
  dependencies: Dependencies = defaultDependencies,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
) {
  if (env.PLAY_REFUND_REVIEW_ALERTS_ENABLED !== "true")
    return { status: "disabled" as const, unresolved: 0, sent: 0 }
  const from = env.EMAIL_FROM?.trim()
  if (
    !["production", "preview"].includes(env.APP_ENV ?? "") ||
    env.EMAIL_DELIVERY_MODE !== "live" ||
    !env.RESEND_API_KEY?.trim() ||
    !from ||
    !isValidEmailSender(from)
  )
    throw new Error("Play refund-review alert delivery is not configured.")
  const recipients = alertRecipients(env.PLAY_REFUND_REVIEW_ALERT_EMAILS)
  const queue = await dependencies.loadQueue(now)
  if (queue.total === 0)
    return { status: "empty" as const, unresolved: 0, sent: 0 }

  const earliestDue = queue.cases[0]?.responseDueAt?.toISOString() ?? "unknown"
  const subject = `[EwaTrade] ${queue.total} unresolved Play refund review ${queue.total === 1 ? "case" : "cases"}`
  const text = [
    `Unresolved cases: ${queue.total}`,
    `Overdue cases: ${queue.overdue}`,
    `Earliest response deadline (UTC): ${earliestDue}`,
    "Inspect the platform-admin refund-review queue and follow the reviewed operator procedure.",
    "A CLAIMED or UNCERTAIN response must be reconciled with Google manually; do not submit it again.",
    "This email contains no purchase token, order ID or customer information.",
  ].join("\n")
  const html = `<p>${text.replaceAll("\n", "<br>")}</p>`
  const hour = now.toISOString().slice(0, 13)
  const results = await Promise.allSettled(
    recipients.map((to) => {
      const payload = `${hour}|${from}|${to}|${subject}|${text}`
      const idempotencyKey = `play-review-alert/${createHash("sha256").update(payload).digest("hex")}`
      return dependencies.send({
        from,
        to,
        subject,
        text,
        html,
        idempotencyKey,
      })
    }),
  )
  const failed = results.filter((result) => result.status === "rejected").length
  if (failed)
    throw new Error(
      `Play refund-review alert delivery failed for ${failed} recipient(s).`,
    )
  return {
    status: "sent" as const,
    unresolved: queue.total,
    sent: recipients.length,
  }
}
