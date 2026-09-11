import { BrandEmail, EmailDetails, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export type MarketingLeadEmailInput = {
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

const intro =
  "A merchant or operator requested early access from the EwaTrade marketing site. The full lead record is below for review."

export function MarketingEarlyAccessAdminEmail({
  input,
}: {
  input: MarketingLeadEmailInput
}) {
  return (
    <BrandEmail
      eyebrow="Growth desk / Early access"
      intro={intro}
      preview={`Early access request from ${input.fullName}`}
      title="A new operator wants in."
      note="Review the request before contacting the lead. Access links are private and should not be forwarded."
    >
      <EmailStatus label="Review needed" tone="attention" />
      <EmailDetails
        details={[
          { label: "Lead ID", value: input.id },
          { label: "Name", value: input.fullName },
          { label: "Email", value: input.email },
          { label: "Company", value: input.companyName },
          { label: "Role", value: input.roleTitle },
          { label: "Phone", value: input.phone },
          { label: "Message", value: input.message },
          { label: "Access link", value: input.accessUrl },
          { label: "Expires", value: input.accessExpiresAt },
        ]}
      />
    </BrandEmail>
  )
}

export function renderMarketingEarlyAccessAdminTemplate(
  input: MarketingLeadEmailInput,
) {
  return {
    html: renderEmailMarkup(<MarketingEarlyAccessAdminEmail input={input} />),
    text: createEmailText({
      details: [
        { label: "Lead ID", value: input.id },
        { label: "Name", value: input.fullName },
        { label: "Email", value: input.email },
        { label: "Company", value: input.companyName },
        { label: "Role", value: input.roleTitle },
        { label: "Phone", value: input.phone },
        { label: "Message", value: input.message },
        { label: "Access link", value: input.accessUrl },
        { label: "Expires", value: input.accessExpiresAt },
      ],
      intro,
      note: "Review the request before contacting the lead. Access links are private and should not be forwarded.",
      title: "A new operator wants in.",
    }),
  }
}

export default MarketingEarlyAccessAdminEmail
