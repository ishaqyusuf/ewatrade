import { BrandEmail, EmailDetails, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export type MarketingLeadEmailInput = {
  approvalUrl?: string | null
  businessSize?: string | null
  recordSystem?: string | null
  launchTimeline?: string | null
  setupNeeds?: string[]
  accessExpiresAt?: string | null
  accessUrl?: string | null
  companyName?: string | null
  email: string
  fullName: string
  id: string
  message?: string | null
  phone?: string | null
  roleTitle?: string | null
}

function reviewDetails(input: MarketingLeadEmailInput) {
  return [
    { label: "Lead ID", value: input.id },
    { label: "Name", value: input.fullName },
    { label: "Email", value: input.email },
    { label: "Business", value: input.companyName },
    { label: "Role", value: input.roleTitle },
    { label: "Phone", value: input.phone },
    { label: "Business size", value: input.businessSize?.replaceAll("_", " ") },
    {
      label: "Current records",
      value: input.recordSystem?.replaceAll("_", " "),
    },
    {
      label: "Target setup",
      value: input.launchTimeline?.replaceAll("_", " "),
    },
    { label: "Setup needs", value: input.setupNeeds?.join(", ") },
    { label: "Message", value: input.message },
    { label: "Approval expires", value: input.accessExpiresAt },
  ]
}

const intro =
  "A merchant or operator requested early access from the EwaTrade marketing site. The full lead record is below for review."

export function MarketingEarlyAccessAdminEmail({
  input,
}: {
  input: MarketingLeadEmailInput
}) {
  return (
    <BrandEmail
      cta={
        input.approvalUrl
          ? { href: input.approvalUrl, label: "Approve early access" }
          : undefined
      }
      eyebrow="Growth desk / Early access"
      intro={intro}
      preview={`Early access request from ${input.fullName}`}
      title="A new operator wants in."
      note="Review the business details. Opening the approval link sends the contact a private setup link. Approval links are private and expire after 30 days."
    >
      <EmailStatus label="Review needed" tone="attention" />
      <EmailDetails details={reviewDetails(input)} />
    </BrandEmail>
  )
}

export function renderMarketingEarlyAccessAdminTemplate(
  input: MarketingLeadEmailInput,
) {
  return {
    html: renderEmailMarkup(<MarketingEarlyAccessAdminEmail input={input} />),
    text: createEmailText({
      cta: input.approvalUrl
        ? { href: input.approvalUrl, label: "Approve early access" }
        : undefined,
      details: reviewDetails(input),
      intro,
      note: "Opening the approval link sends the contact a private setup link. Approval links are private and expire after 30 days.",
      title: "A new operator wants in.",
    }),
  }
}

export default MarketingEarlyAccessAdminEmail
