import { BrandEmail, EmailDetails } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export type EarlyAccessVerificationInput = {
  fullName: string
  email: string
  verificationUrl: string
  expiresAt: string
}

function getContent(input: EarlyAccessVerificationInput) {
  return {
    title: "Verify your email.",
    intro: `Hi ${input.fullName}. Confirm your email address before creating your EwaTrade workspace.`,
    note: "This link expires after 24 hours or when your approved setup link expires. If you did not request this, you can ignore this email.",
    cta: { href: input.verificationUrl, label: "Verify email and continue" },
    details: [
      { label: "Email", value: input.email },
      { label: "Expires", value: input.expiresAt },
    ],
  }
}

export function EarlyAccessVerificationEmail({
  input,
}: {
  input: EarlyAccessVerificationInput
}) {
  const content = getContent(input)
  return (
    <BrandEmail
      eyebrow="Workspace setup"
      preview="Verify your email to continue EwaTrade setup"
      {...content}
    >
      <EmailDetails details={content.details} />
    </BrandEmail>
  )
}

export function renderEarlyAccessVerificationTemplate(
  input: EarlyAccessVerificationInput,
) {
  return {
    html: renderEmailMarkup(<EarlyAccessVerificationEmail input={input} />),
    text: createEmailText(getContent(input)),
  }
}

export default EarlyAccessVerificationEmail
