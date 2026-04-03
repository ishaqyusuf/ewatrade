import type { MarketingLeadEmailInput } from "./marketing-early-access-admin"
import { renderMarketingEmailTemplate } from "./shared"

export function renderMarketingWaitlistAdminTemplate(input: MarketingLeadEmailInput) {
  return renderMarketingEmailTemplate({
    intro: "A new visitor joined the ewatrade waitlist from the marketing site.",
    sections: [
      { label: "Lead ID", value: input.id },
      { label: "Name", value: input.fullName },
      { label: "Email", value: input.email },
      { label: "Company", value: input.companyName }
    ],
    title: "New waitlist signup"
  })
}
