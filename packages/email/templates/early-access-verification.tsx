import { BrandEmail, EmailDetails } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

type EarlyAccessVerificationInput = {
  fullName: string
  email: string
  verificationUrl: string
  expiresAt: string
}

export function renderEarlyAccessVerificationTemplate(
  input: EarlyAccessVerificationInput,
) {
  const content = {
    title: "Verify your email.",
    intro: `Hi ${input.fullName}. Confirm your email address before creating your EwaTrade workspace.`,
    note: "This link expires after 24 hours or when your approved setup link expires. If you did not request this, you can ignore this email.",
    cta: { href: input.verificationUrl, label: "Verify email and continue" },
    details: [
      { label: "Email", value: input.email },
      { label: "Expires", value: input.expiresAt },
    ],
  }
  return {
    html: renderEmailMarkup(
      <BrandEmail
        eyebrow="Workspace setup"
        preview="Verify your email to continue EwaTrade setup"
        {...content}
      >
        <EmailDetails details={content.details} />
      </BrandEmail>,
    ),
    text: createEmailText(content),
  }
}
