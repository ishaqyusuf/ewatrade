import { BrandEmail, EmailCode, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export type MobileOwnerOtpEmailInput = {
  code: string
  expiresAtLabel: string
  mode: "login" | "sign_up"
}

function getContent(input: MobileOwnerOtpEmailInput) {
  const action =
    input.mode === "login"
      ? "sign in to your EwaTrade account"
      : "verify your new EwaTrade account"

  return {
    action,
    intro: `Use the six-digit code below to ${action}.`,
    note: `The code expires at ${input.expiresAtLabel}. EwaTrade will never ask you to send this code by chat, phone, or email.`,
  }
}

export function MobileOwnerOtpEmail({
  input,
}: {
  input: MobileOwnerOtpEmailInput
}) {
  const content = getContent(input)

  return (
    <BrandEmail
      eyebrow="Account security"
      intro={content.intro}
      note={content.note}
      preview={`Your EwaTrade verification code is ${input.code}`}
      title="One code. Ten minutes."
    >
      <EmailStatus label="Private code" tone="attention" />
      <EmailCode>{input.code}</EmailCode>
    </BrandEmail>
  )
}

export function renderMobileOwnerOtpTemplate(input: MobileOwnerOtpEmailInput) {
  const content = getContent(input)

  return {
    html: renderEmailMarkup(<MobileOwnerOtpEmail input={input} />),
    text: createEmailText({
      details: [{ label: "Verification code", value: input.code }],
      intro: content.intro,
      note: content.note,
      title: "One code. Ten minutes.",
    }),
  }
}

export default MobileOwnerOtpEmail
