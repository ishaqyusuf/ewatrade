import { BrandEmail, EmailDetails, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import type { MarketingLeadEmailInput } from "./marketing-early-access-admin"
import { createEmailText } from "./shared"

function getContent(input: MarketingLeadEmailInput) {
  return {
    intro: `Hi ${input.fullName}. You are on the EwaTrade waitlist. We will let you know as access opens to more businesses.`,
    note: "We are building one working system for storefronts, orders, stock, fulfillment, and customer communication.",
    title: "Your place is saved.",
  }
}

export function MarketingWaitlistConfirmationEmail({
  input,
}: {
  input: MarketingLeadEmailInput
}) {
  const content = getContent(input)

  return (
    <BrandEmail
      eyebrow="Waitlist"
      intro={content.intro}
      note={content.note}
      preview="Your place on the EwaTrade waitlist is saved"
      title={content.title}
    >
      <EmailStatus label="Place saved" tone="live" />
      <EmailDetails
        details={[
          { label: "Email", value: input.email },
          { label: "Company", value: input.companyName },
        ]}
      />
    </BrandEmail>
  )
}

export function renderMarketingWaitlistConfirmationTemplate(
  input: MarketingLeadEmailInput,
) {
  const content = getContent(input)

  return {
    html: renderEmailMarkup(
      <MarketingWaitlistConfirmationEmail input={input} />,
    ),
    text: createEmailText({
      details: [
        { label: "Email", value: input.email },
        { label: "Company", value: input.companyName },
      ],
      intro: content.intro,
      note: content.note,
      title: content.title,
    }),
  }
}

export default MarketingWaitlistConfirmationEmail
