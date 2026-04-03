import type { MarketingLeadEmailInput } from "./marketing-early-access-admin"
import { renderMarketingEmailTemplate } from "./shared"

export function renderMarketingEarlyAccessConfirmationTemplate(
  input: MarketingLeadEmailInput
) {
  return renderMarketingEmailTemplate({
    intro: `Thanks ${input.fullName}. We received your early access request and our team will reach out when the next onboarding cohort opens.`,
    outro:
      "ewatrade is building one platform for storefronts, merchant operations, fulfillment coordination, POS, and customer communication.",
    sections: [
      { label: "Email", value: input.email },
      { label: "Company", value: input.companyName },
      { label: "Role", value: input.roleTitle }
    ],
    title: "Your early access request is in"
  })
}
