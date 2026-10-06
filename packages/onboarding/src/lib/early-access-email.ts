import { prisma } from "@ewatrade/db"
import {
  type EmailMessage,
  type MarketingEmailInput,
  createMarketingEarlyAccessAdminEmail,
  createMarketingEarlyAccessConfirmationEmail,
  createTestRoutedEmailMessages,
  defaultMarketingEarlyAccessAdminSubject,
  defaultMarketingEarlyAccessConfirmationSubject,
  dispatchEmailMessages,
} from "@ewatrade/email"
import { getMarketingNotificationInboxRecipients } from "@ewatrade/notifications"
import { EarlyAccessError } from "./early-access-service"

export async function deliverEarlyAccessEmails(
  leadId: string,
  messages: EmailMessage[],
  phase: "request" | "requestConfirmation" | "approval" | "verification",
) {
  if (!messages.length)
    throw new EarlyAccessError(
      "Early access review email recipients are not configured.",
      503,
    )
  const deliveries = await dispatchEmailMessages(
    messages.flatMap((message) => createTestRoutedEmailMessages(message)),
  )
  // Keep provider evidence without returning provider errors or private links to the applicant.
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadId },
    select: { metadata: true },
  })
  const metadata =
    lead?.metadata &&
    typeof lead.metadata === "object" &&
    !Array.isArray(lead.metadata)
      ? lead.metadata
      : {}
  const receipt = {
    phase,
    recordedAt: new Date().toISOString(),
    sent: deliveries.filter((delivery) => delivery.status === "sent").length,
    failed: deliveries.filter((delivery) => delivery.status === "failed")
      .length,
    receipts: deliveries.map((delivery) => ({
      recipientEmail: delivery.message.to,
      status: delivery.status,
      provider: delivery.provider ?? null,
      providerMessageId: delivery.providerMessageId ?? null,
    })),
  }
  await prisma.leadCapture.update({
    where: { id: leadId },
    data: { metadata: { ...metadata, [`${phase}Delivery`]: receipt } },
  })
  if (!receipt.sent)
    throw new EarlyAccessError(
      "The email could not be sent. Please try again.",
      502,
    )
}

export function earlyAccessRequestEmails(
  input: MarketingEmailInput,
  qaRecipient?: string,
) {
  const recipients = qaRecipient
    ? [{ kind: "email" as const, email: qaRecipient }]
    : getMarketingNotificationInboxRecipients()
  return recipients.flatMap((recipient) =>
    recipient.kind === "email"
      ? [
          createMarketingEarlyAccessAdminEmail({
            from: process.env.EMAIL_FROM ?? "noreply@ewatrade.local",
            replyTo: process.env.EMAIL_REPLY_TO,
            to: recipient.email,
            subject: defaultMarketingEarlyAccessAdminSubject(),
            input,
          }),
        ]
      : [],
  )
}

export function earlyAccessApprovedEmail(input: MarketingEmailInput) {
  return createMarketingEarlyAccessConfirmationEmail({
    from: process.env.EMAIL_FROM ?? "noreply@ewatrade.local",
    replyTo: process.env.EMAIL_REPLY_TO,
    to: input.email,
    subject: "Your EwaTrade early access is approved",
    input,
  })
}

export function earlyAccessRequestConfirmationEmail(
  input: MarketingEmailInput,
) {
  return createMarketingEarlyAccessConfirmationEmail({
    from: process.env.EMAIL_FROM ?? "noreply@ewatrade.local",
    replyTo: process.env.EMAIL_REPLY_TO,
    to: input.email,
    subject: defaultMarketingEarlyAccessConfirmationSubject(),
    input: {
      id: input.id,
      type: input.type,
      fullName: input.fullName,
      email: input.email,
      companyName: input.companyName,
    },
  })
}
