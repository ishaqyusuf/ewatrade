import {
  renderMarketingEarlyAccessAdminTemplate,
  type MarketingLeadEmailInput
} from "../templates/marketing-early-access-admin"
import { renderMarketingEarlyAccessConfirmationTemplate } from "../templates/marketing-early-access-confirmation"
import { renderMarketingWaitlistAdminTemplate } from "../templates/marketing-waitlist-admin"
import { renderMarketingWaitlistConfirmationTemplate } from "../templates/marketing-waitlist-confirmation"

export type EmailMessage = {
  from: string
  html: string
  replyTo?: string
  subject: string
  text: string
  to: string
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
  send: (message: EmailMessage) => Promise<void>
}

export * from "../defaults"
export * from "../templates/marketing-early-access-admin"
export * from "../templates/marketing-early-access-confirmation"
export * from "../templates/marketing-waitlist-admin"
export * from "../templates/marketing-waitlist-confirmation"

export function createEmailMessage(message: EmailMessage) {
  return message
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
    to: params.to
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
    to: params.to
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
    to: params.to
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
    to: params.to
  })
}

export const consoleEmailTransport: EmailTransport = {
  async send(message) {
    console.info("[email:console]", {
      from: message.from,
      subject: message.subject,
      to: message.to
    })
  }
}

export async function dispatchEmailMessages(
  messages: EmailMessage[],
  transport: EmailTransport = consoleEmailTransport
) {
  await Promise.all(messages.map((message) => transport.send(message)))
}
