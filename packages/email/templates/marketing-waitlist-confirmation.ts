import type { MarketingLeadEmailInput } from "./marketing-early-access-admin"
import { renderMarketingEmailTemplate } from "./shared"

export function renderMarketingWaitlistConfirmationTemplate(
  input: MarketingLeadEmailInput
) {
  return renderMarketingEmailTemplate({
    intro: `Thanks ${input.fullName}. You are now on the ewatrade waitlist and we will keep you updated as access opens more broadly.`,
    outro:
      "We are building a unified platform for storefronts, fulfillment, POS, and merchant operations.",
    sections: [
      { label: "Email", value: input.email },
      { label: "Company", value: input.companyName }
    ],
    title: "You are on the ewatrade waitlist"
  })
}
