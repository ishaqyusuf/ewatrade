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

export type EmailTransport = {
  send: (message: EmailMessage) => Promise<void>
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function renderListItem(label: string, value: string | null | undefined) {
  if (!value) {
    return ""
  }

  return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`
}

export function createEmailMessage(message: EmailMessage) {
  return message
}

export function createMarketingLeadAdminEmail(params: {
  from: string
  input: LeadCaptureEmailInput
  replyTo?: string
  to: string
}) {
  const leadTypeLabel =
    params.input.type === "EARLY_ACCESS" ? "Early access request" : "Waitlist signup"

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h1 style="margin-bottom: 8px;">${escapeHtml(leadTypeLabel)}</h1>
      <p>A new marketing lead was captured on the ewatrade site.</p>
      <ul>
        ${renderListItem("Lead ID", params.input.id)}
        ${renderListItem("Name", params.input.fullName)}
        ${renderListItem("Email", params.input.email)}
        ${renderListItem("Company", params.input.companyName)}
        ${renderListItem("Role", params.input.roleTitle)}
        ${renderListItem("Phone", params.input.phone)}
        ${renderListItem("Message", params.input.message)}
      </ul>
    </div>
  `.trim()

  const text = [
    leadTypeLabel,
    "",
    "A new marketing lead was captured on the ewatrade site.",
    `Lead ID: ${params.input.id}`,
    `Name: ${params.input.fullName}`,
    `Email: ${params.input.email}`,
    params.input.companyName ? `Company: ${params.input.companyName}` : null,
    params.input.roleTitle ? `Role: ${params.input.roleTitle}` : null,
    params.input.phone ? `Phone: ${params.input.phone}` : null,
    params.input.message ? `Message: ${params.input.message}` : null
  ]
    .filter(Boolean)
    .join("\n")

  return createEmailMessage({
    from: params.from,
    html,
    replyTo: params.replyTo,
    subject: `${leadTypeLabel}: ${params.input.fullName}`,
    text,
    to: params.to
  })
}

export function createMarketingLeadConfirmationEmail(params: {
  from: string
  input: LeadCaptureEmailInput
  replyTo?: string
}) {
  const subject =
    params.input.type === "EARLY_ACCESS"
      ? "We received your early access request"
      : "You are on the ewatrade waitlist"

  const intro =
    params.input.type === "EARLY_ACCESS"
      ? "Thanks for requesting early access to ewatrade. Our team will review your request and reach out when the next onboarding window opens."
      : "Thanks for joining the ewatrade waitlist. We will keep you updated as access opens more broadly."

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h1 style="margin-bottom: 8px;">Thanks, ${escapeHtml(params.input.fullName)}.</h1>
      <p>${escapeHtml(intro)}</p>
      <p>ewatrade is building one platform for storefronts, merchant operations, fulfillment coordination, POS, and customer communication.</p>
    </div>
  `.trim()

  const text = [
    `Thanks, ${params.input.fullName}.`,
    "",
    intro,
    "",
    "ewatrade is building one platform for storefronts, merchant operations, fulfillment coordination, POS, and customer communication."
  ].join("\n")

  return createEmailMessage({
    from: params.from,
    html,
    replyTo: params.replyTo,
    subject,
    text,
    to: params.input.email
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
