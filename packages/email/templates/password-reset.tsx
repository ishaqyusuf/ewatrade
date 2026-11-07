import { BrandEmail } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export function PasswordResetEmail({ resetUrl }: { resetUrl: string }) {
  return (
    <BrandEmail
      eyebrow="Account security"
      title="Reset your password."
      preview="Reset your EwaTrade password"
      intro="Use this private link to choose a new password for your EwaTrade account."
      cta={{ href: resetUrl, label: "Reset password" }}
      note="This link expires in 15 minutes and can be used once. If you did not request it, ignore this email. Your password will stay the same. Never share this link."
    />
  )
}

export function renderPasswordResetTemplate(input: { resetUrl: string }) {
  return {
    html: renderEmailMarkup(<PasswordResetEmail {...input} />),
    text: createEmailText({
      title: "Reset your EwaTrade password",
      intro:
        "Use this private link to choose a new password for your EwaTrade account.",
      cta: { href: input.resetUrl, label: "Reset password" },
      note: "This link expires in 15 minutes and can be used once. If you did not request it, ignore this email. Your password will stay the same. Never share this link.",
    }),
  }
}
