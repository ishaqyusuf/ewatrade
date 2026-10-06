import { BrandEmail, EmailDetails, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import type { MarketingLeadEmailInput } from "./marketing-early-access-admin"
import { createEmailText } from "./shared"

function getContent(input: MarketingLeadEmailInput) {
  const approved = Boolean(input.accessUrl)
  const firstName = input.fullName.trim().split(/\s+/)[0]

  return {
    approved,
    details: [
      { label: "Email", value: input.email },
      {
        label: approved ? "Company" : "Business name",
        value: input.companyName,
      },
      ...(approved
        ? [
            { label: "Role", value: input.roleTitle },
            { label: "Link expires", value: input.accessExpiresAt },
          ]
        : []),
    ],
    cta:
      input.accessUrl && approved
        ? { href: input.accessUrl, label: "Create your workspace" }
        : undefined,
    intro: approved
      ? `Hi ${input.fullName}. Your early access request has been approved. Your private setup link is ready.`
      : `Hi ${firstName}. Thanks for requesting early access to EwaTrade. We’ve received your details${input.companyName ? ` for ${input.companyName}` : ""}.`,
    note: approved
      ? "This link works once and expires automatically. If it expires before setup is complete, request access again with the same email."
      : "Our team will review your request. If approved, we’ll email you a private link to create your workspace. You don’t need to submit another request.",
    title: approved
      ? "Your workspace starts here."
      : "Your early access request is in.",
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
        label={content.approved ? "Access approved" : "Awaiting review"}
        tone={content.approved ? "live" : "neutral"}
      />
      <EmailDetails details={content.details} />
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
        ...content.details,
        ...(!content.approved
          ? [{ label: "Status", value: "Awaiting review" }]
          : []),
      ],
      intro: content.intro,
      note: content.note,
      title: content.title,
    }),
  }
}

export default MarketingEarlyAccessConfirmationEmail
