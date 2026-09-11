import { BrandEmail, EmailDetails, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import type { MarketingLeadEmailInput } from "./marketing-early-access-admin"
import { createEmailText } from "./shared"

function getContent(input: MarketingLeadEmailInput) {
  const approved = Boolean(input.accessUrl)

  return {
    approved,
    cta:
      input.accessUrl && approved
        ? { href: input.accessUrl, label: "Create your workspace" }
        : undefined,
    intro: approved
      ? `Hi ${input.fullName}. Your early access request has been approved. Your private setup link is ready.`
      : `Hi ${input.fullName}. We received your early access request. We will be in touch when the next onboarding window opens.`,
    note: approved
      ? "This link works once and expires automatically. If it expires before setup is complete, request access again with the same email."
      : "EwaTrade brings storefront, orders, stock, customer communication, and daily operations into one working system.",
    title: approved
      ? "Your workspace starts here."
      : "You are on the early list.",
  }
}

export function MarketingEarlyAccessConfirmationEmail({
  input,
}: {
  input: MarketingLeadEmailInput
}) {
  const content = getContent(input)

  return (
    <BrandEmail
      cta={content.cta}
      eyebrow="Early access"
      intro={content.intro}
      note={content.note}
      preview={
        content.approved
          ? "Your private EwaTrade setup link is ready"
          : "Your EwaTrade early access request is in"
      }
      title={content.title}
    >
      <EmailStatus
        label={content.approved ? "Access approved" : "Request received"}
        tone={content.approved ? "live" : "neutral"}
      />
      <EmailDetails
        details={[
          { label: "Email", value: input.email },
          { label: "Company", value: input.companyName },
          { label: "Role", value: input.roleTitle },
          { label: "Link expires", value: input.accessExpiresAt },
        ]}
      />
    </BrandEmail>
  )
}

export function renderMarketingEarlyAccessConfirmationTemplate(
  input: MarketingLeadEmailInput,
) {
  const content = getContent(input)

  return {
    html: renderEmailMarkup(
      <MarketingEarlyAccessConfirmationEmail input={input} />,
    ),
    text: createEmailText({
      cta: content.cta,
      details: [
        { label: "Email", value: input.email },
        { label: "Company", value: input.companyName },
        { label: "Role", value: input.roleTitle },
        { label: "Link expires", value: input.accessExpiresAt },
      ],
      intro: content.intro,
      note: content.note,
      title: content.title,
    }),
  }
}

export default MarketingEarlyAccessConfirmationEmail
