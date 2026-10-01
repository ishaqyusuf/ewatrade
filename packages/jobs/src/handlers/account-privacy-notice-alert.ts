import { createHash } from "node:crypto"
import { prisma } from "@ewatrade/db/client"
import { getAccountPrivacyNoticeAlertSummary } from "@ewatrade/db/queries"
import {
  type EmailMessage,
  isValidEmailSender,
  resendEmailTransport,
} from "@ewatrade/email"

type Summary = Awaited<ReturnType<typeof getAccountPrivacyNoticeAlertSummary>>
type Dependencies = {
  loadSummary: (now: Date) => Promise<Summary>
  send: (message: EmailMessage) => Promise<unknown>
}

const defaultDependencies: Dependencies = {
  loadSummary: (now) => getAccountPrivacyNoticeAlertSummary(prisma, now),
  send: (message) => resendEmailTransport.send(message),
}

function recipientsFrom(value: string | undefined) {
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
    throw new Error(
      "Account privacy notice alert recipients are not configured.",
    )
  return recipients
}

export async function runAccountPrivacyNoticeAlert(
  dependencies: Dependencies = defaultDependencies,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
) {
  if (env.ACCOUNT_PRIVACY_NOTICE_ALERTS_ENABLED !== "true")
    return { status: "disabled" as const, unresolved: 0, sent: 0 }
  const from = env.EMAIL_FROM?.trim()
  if (
    !["production", "preview"].includes(env.APP_ENV ?? "") ||
    env.EMAIL_DELIVERY_MODE !== "live" ||
    !env.RESEND_API_KEY?.trim() ||
    !from ||
    !isValidEmailSender(from)
  )
    throw new Error("Account privacy notice alert delivery is not configured.")
  const recipients = recipientsFrom(env.ACCOUNT_PRIVACY_NOTICE_ALERT_EMAILS)
  const summary = await dependencies.loadSummary(now)
  if (summary.total === 0)
    return { status: "empty" as const, unresolved: 0, sent: 0 }

  const subject = `[EwaTrade] ${summary.total} unresolved account-deletion notice ${summary.total === 1 ? "attempt" : "attempts"}`
  const text = [
    `Failed notices: ${summary.failed}`,
    `Failures after a completed request: ${summary.failedAfterCompletion}`,
    `Uncertain sends: ${summary.uncertain}`,
    `Sends in progress over 10 minutes: ${summary.staleSending}`,
    `Accepted sends without delivery over 1 hour: ${summary.deliveryUnconfirmed}`,
    "Inspect the platform-admin account-deletion review queue and provider event history.",
    "Do not resend an uncertain attempt without reconciling the original provider outcome.",
    "This alert contains no person, request, message or recipient identifier.",
  ].join("\n")
  const html = `<p>${text.replaceAll("\n", "<br>")}</p>`
  const hour = now.toISOString().slice(0, 13)
  const results = await Promise.allSettled(
    recipients.map((to) => {
      const payload = `${hour}|${from}|${to}|${subject}|${text}`
      const idempotencyKey = `privacy-notice-alert/${createHash("sha256").update(payload).digest("hex")}`
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
      `Account privacy notice alert delivery failed for ${failed} recipient(s).`,
    )
  return {
    status: "sent" as const,
    unresolved: summary.total,
    sent: recipients.length,
  }
}
