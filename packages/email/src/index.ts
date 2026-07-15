import {
  type MarketingLeadEmailInput,
  renderMarketingEarlyAccessAdminTemplate,
} from "../templates/marketing-early-access-admin"
import { renderMarketingEarlyAccessConfirmationTemplate } from "../templates/marketing-early-access-confirmation"
import { renderMarketingWaitlistAdminTemplate } from "../templates/marketing-waitlist-admin"
import { renderMarketingWaitlistConfirmationTemplate } from "../templates/marketing-waitlist-confirmation"
import {
  type RetailOpsSharedLinkOrderEmailInput,
  renderRetailOpsSharedLinkOrderCustomerTemplate,
  renderRetailOpsSharedLinkOrderMerchantTemplate,
} from "../templates/retail-ops-shared-link-order"
import {
  type RetailOpsStaffInviteEmailInput,
  renderRetailOpsStaffInviteTemplate,
} from "../templates/retail-ops-staff-invite"

export type EmailMessage = {
  from: string
  html: string
  replyTo?: string
  subject: string
  text: string
  to: string
}

export type EmailDeliveryReceipt = {
  provider?: string
  providerMessageId?: string
}

export type EmailDispatchResult = {
  error?: string
  failedAt?: string
  message: EmailMessage
  provider?: string
  providerMessageId?: string
  sentAt?: string
  status: "failed" | "sent"
}

export type LeadCaptureEmailInput = {
  companyName?: string | null
  email: string
  fullName: string
  id: string
  message?: string | null
  phone?: string | null
  roleTitle?: string | null
  type: "EARLY_ACCESS" | "WAITLIST"
}

export type MarketingEmailInput = MarketingLeadEmailInput & {
  type: "EARLY_ACCESS" | "WAITLIST"
}

export type EmailTransport = {
  send: (message: EmailMessage) => Promise<EmailDeliveryReceipt | undefined>
}

export type EmailRoutingEnv = {
  NODE_ENV?: string
  TEST_EMAIL?: string
  TEST_EMAILS?: string
}

export type TestEmailRouting = {
  originalRecipient: string
  recipients: string[]
  routed: boolean
}

type ResendEmailResponse = {
  error?: unknown
  id?: string
}

export * from "../defaults"
export * from "../templates/marketing-early-access-admin"
export * from "../templates/marketing-early-access-confirmation"
export * from "../templates/marketing-waitlist-admin"
export * from "../templates/marketing-waitlist-confirmation"
export * from "../templates/retail-ops-shared-link-order"
export * from "../templates/retail-ops-staff-invite"

export function createEmailMessage(message: EmailMessage) {
  return message
}

function splitEmailList(value: string | null | undefined) {
  const seen = new Set<string>()

  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => {
        const key = item.toLowerCase()

        if (seen.has(key)) return false

        seen.add(key)
        return true
      }) ?? []
  )
}

export function getConfiguredTestEmailRecipients(
  env: EmailRoutingEnv = process.env,
) {
  const testEmails = splitEmailList(env.TEST_EMAILS)

  return testEmails.length > 0 ? testEmails : splitEmailList(env.TEST_EMAIL)
}

function hasExactTestComDomain(email: string) {
  const atIndex = email.lastIndexOf("@")

  if (atIndex === -1) return false

  return (
    email
      .slice(atIndex + 1)
      .trim()
      .toLowerCase() === "test.com"
  )
}

export function shouldRouteEmailToTestRecipients(
  recipient: string,
  env: EmailRoutingEnv = process.env,
) {
  return env.NODE_ENV !== "production" || hasExactTestComDomain(recipient)
}

export function getTestEmailRouting(input: {
  env?: EmailRoutingEnv
  to: string
}): TestEmailRouting {
  const env = input.env ?? process.env
  const originalRecipient = input.to.trim()
  const routed = shouldRouteEmailToTestRecipients(originalRecipient, env)

  if (!routed) {
    return {
      originalRecipient,
      recipients: [originalRecipient],
      routed: false,
    }
  }

  const recipients = getConfiguredTestEmailRecipients(env)

  if (recipients.length === 0) {
    throw new Error(
      "TEST_EMAILS or TEST_EMAIL must be configured for local/dev or @test.com email delivery.",
    )
  }

  return {
    originalRecipient,
    recipients,
    routed: true,
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function appendOriginalRecipientHtml(html: string, originalRecipient: string) {
  return `${html}
<p style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;color:#6b7280;font-size:12px"><strong>Original recipient:</strong> ${escapeHtml(
    originalRecipient,
  )}</p>`
}

function appendOriginalRecipientText(text: string, originalRecipient: string) {
  return `${text}\n\nOriginal recipient: ${originalRecipient}`
}

export function createTestRoutedEmailMessages(
  message: EmailMessage,
  options: { env?: EmailRoutingEnv } = {},
) {
  const routing = getTestEmailRouting({
    env: options.env,
    to: message.to,
  })

  if (!routing.routed) {
    return [message]
  }

  return routing.recipients.map((recipient) =>
    createEmailMessage({
      ...message,
      html: appendOriginalRecipientHtml(
        message.html,
        routing.originalRecipient,
      ),
      text: appendOriginalRecipientText(
        message.text,
        routing.originalRecipient,
      ),
      to: recipient,
    }),
  )
}

export function createMarketingEarlyAccessAdminEmail(params: {
  from: string
  input: MarketingEmailInput
  replyTo?: string
  subject: string
  to: string
}) {
  const content = renderMarketingEarlyAccessAdminTemplate(params.input)

  return createEmailMessage({
    from: params.from,
    html: content.html,
    replyTo: params.replyTo,
    subject: params.subject,
    text: content.text,
    to: params.to,
  })
}

export function createMarketingEarlyAccessConfirmationEmail(params: {
  from: string
  input: MarketingEmailInput
  replyTo?: string
  subject: string
  to: string
}) {
  const content = renderMarketingEarlyAccessConfirmationTemplate(params.input)

  return createEmailMessage({
    from: params.from,
    html: content.html,
    replyTo: params.replyTo,
    subject: params.subject,
    text: content.text,
    to: params.to,
  })
}

export function createMarketingWaitlistAdminEmail(params: {
  from: string
  input: MarketingEmailInput
  replyTo?: string
  subject: string
  to: string
}) {
  const content = renderMarketingWaitlistAdminTemplate(params.input)

  return createEmailMessage({
    from: params.from,
    html: content.html,
    replyTo: params.replyTo,
    subject: params.subject,
    text: content.text,
    to: params.to,
  })
}

export function createMarketingWaitlistConfirmationEmail(params: {
  from: string
  input: MarketingEmailInput
  replyTo?: string
  subject: string
  to: string
}) {
  const content = renderMarketingWaitlistConfirmationTemplate(params.input)

  return createEmailMessage({
    from: params.from,
    html: content.html,
    replyTo: params.replyTo,
    subject: params.subject,
    text: content.text,
    to: params.to,
  })
}

export function createRetailOpsSharedLinkOrderCustomerEmail(params: {
  from: string
  input: RetailOpsSharedLinkOrderEmailInput
  replyTo?: string
  subject: string
  to: string
}) {
  const content = renderRetailOpsSharedLinkOrderCustomerTemplate(params.input)

  return createEmailMessage({
    from: params.from,
    html: content.html,
    replyTo: params.replyTo,
    subject: params.subject,
    text: content.text,
    to: params.to,
  })
}

export function createRetailOpsSharedLinkOrderMerchantEmail(params: {
  from: string
  input: RetailOpsSharedLinkOrderEmailInput
  replyTo?: string
  subject: string
  to: string
}) {
  const content = renderRetailOpsSharedLinkOrderMerchantTemplate(params.input)

  return createEmailMessage({
    from: params.from,
    html: content.html,
    replyTo: params.replyTo,
    subject: params.subject,
    text: content.text,
    to: params.to,
  })
}

export function createRetailOpsStaffInviteEmail(params: {
  from: string
  input: RetailOpsStaffInviteEmailInput
  replyTo?: string
  subject: string
  to: string
}) {
  const content = renderRetailOpsStaffInviteTemplate(params.input)

  return createEmailMessage({
    from: params.from,
    html: content.html,
    replyTo: params.replyTo,
    subject: params.subject,
    text: content.text,
    to: params.to,
  })
}

export const consoleEmailTransport: EmailTransport = {
  async send(message) {
    console.info("[email:console]", {
      from: message.from,
      subject: message.subject,
      to: message.to,
    })

    return {
      provider: "console",
      providerMessageId: `console:${Date.now()}:${message.to}`,
    }
  },
}

function getResendApiKey() {
  const value = process.env.RESEND_API_KEY?.trim()

  return value ? value : undefined
}

function formatResendError(error: unknown) {
  if (typeof error === "string") return error

  if (error && typeof error === "object") {
    return JSON.stringify(error)
  }

  return "Unknown Resend error."
}

export const resendEmailTransport: EmailTransport = {
  async send(message) {
    const apiKey = getResendApiKey()

    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured.")
    }

    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from: message.from,
        html: message.html,
        reply_to: message.replyTo,
        subject: message.subject,
        text: message.text,
        to: [message.to],
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    })
    const payload = (await response
      .json()
      .catch(() => null)) as ResendEmailResponse | null

    if (!response.ok || payload?.error) {
      throw new Error(
        `Resend request failed with ${response.status}: ${
          payload?.error
            ? formatResendError(payload.error)
            : response.statusText
        }`,
      )
    }

    return {
      provider: "resend",
      providerMessageId: payload?.id,
    }
  },
}

export function getDefaultEmailTransport() {
  return getResendApiKey() ? resendEmailTransport : consoleEmailTransport
}

export async function dispatchEmailMessages(
  messages: EmailMessage[],
  transport: EmailTransport = getDefaultEmailTransport(),
) {
  return Promise.all(
    messages.map(async (message): Promise<EmailDispatchResult> => {
      try {
        const receipt = await transport.send(message)

        return {
          message,
          provider: receipt?.provider,
          providerMessageId: receipt?.providerMessageId,
          sentAt: new Date().toISOString(),
          status: "sent",
        }
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "Unknown email delivery failure.",
          failedAt: new Date().toISOString(),
          message,
          status: "failed",
        }
      }
    }),
  )
}
