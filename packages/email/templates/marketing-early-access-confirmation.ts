import type { MarketingLeadEmailInput } from "./marketing-early-access-admin"
import { renderMarketingEmailTemplate } from "./shared"

export function renderMarketingEarlyAccessConfirmationTemplate(
  input: MarketingLeadEmailInput,
) {
  const intro = input.accessUrl
    ? `Thanks ${input.fullName}. Your early access request is approved. Use the secure signup link below to create your ewatrade workspace.`
    : `Thanks ${input.fullName}. We received your early access request and our team will reach out when the next onboarding cohort opens.`

  return renderMarketingEmailTemplate({
    ctaHref: input.accessUrl ?? undefined,
    ctaLabel: input.accessUrl ? "Start your workspace" : undefined,
    intro,
    outro: input.accessUrl
      ? "This link is private, can be used once, and expires automatically. If it expires before you finish, request early access again with the same email."
      : "ewatrade is building one platform for storefronts, merchant operations, fulfillment coordination, POS, and customer communication.",
    sections: [
      { label: "Email", value: input.email },
      { label: "Link expires", value: input.accessExpiresAt },
      { label: "Company", value: input.companyName },
      { label: "Role", value: input.roleTitle },
    ],
    title: input.accessUrl
      ? "Your ewatrade early access link"
      : "Your early access request is in",
  })
}
