import { BrandEmail, EmailDetails, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import type { MarketingLeadEmailInput } from "./marketing-early-access-admin"
import { createEmailText } from "./shared"

const intro =
  "A visitor joined the EwaTrade waitlist. Keep this record for the next access wave and any relevant operator research."

export function MarketingWaitlistAdminEmail({
  input,
}: {
  input: MarketingLeadEmailInput
}) {
  return (
    <BrandEmail
      eyebrow="Growth desk / Waitlist"
      intro={intro}
      preview={`Waitlist signup from ${input.fullName}`}
      title="One more business is watching."
      note="No immediate action is required. Keep outreach useful, specific, and easy to opt out of."
    >
      <EmailStatus label="New lead" />
      <EmailDetails
        details={[
          { label: "Lead ID", value: input.id },
          { label: "Name", value: input.fullName },
          { label: "Email", value: input.email },
          { label: "Company", value: input.companyName },
        ]}
      />
    </BrandEmail>
  )
}

export function renderMarketingWaitlistAdminTemplate(
  input: MarketingLeadEmailInput,
) {
  return {
    html: renderEmailMarkup(<MarketingWaitlistAdminEmail input={input} />),
    text: createEmailText({
      details: [
        { label: "Lead ID", value: input.id },
        { label: "Name", value: input.fullName },
        { label: "Email", value: input.email },
        { label: "Company", value: input.companyName },
      ],
      intro,
      note: "No immediate action is required. Keep outreach useful, specific, and easy to opt out of.",
      title: "One more business is watching.",
    }),
  }
}

export default MarketingWaitlistAdminEmail
