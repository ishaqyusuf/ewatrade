import { BrandEmail, EmailCode, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export type StoreNotificationVerificationEmailInput = {
  code: string
}

export function StoreNotificationVerificationEmail({
  input,
}: {
  input: StoreNotificationVerificationEmailInput
}) {
  return (
    <BrandEmail
      eyebrow="Store notifications"
      intro="Use this code to confirm that Store response notifications should come to this email address."
      note="This code expires in 10 minutes. Confirming it does not link conversations or change your Store access."
      preview={`Your Store notification code is ${input.code}`}
      title="Confirm where replies should find you."
    >
      <EmailStatus label="Contact check" tone="attention" />
      <EmailCode>{input.code}</EmailCode>
    </BrandEmail>
  )
}

export function renderStoreNotificationVerificationTemplate(
  input: StoreNotificationVerificationEmailInput,
) {
  return {
    html: renderEmailMarkup(
      <StoreNotificationVerificationEmail input={input} />,
    ),
    text: createEmailText({
      details: [{ label: "Verification code", value: input.code }],
      intro:
        "Use this code to confirm that Store response notifications should come to this email address.",
      note: "This code expires in 10 minutes. Confirming it does not link conversations or change your Store access.",
      title: "Confirm where replies should find you.",
    }),
  }
}

export default StoreNotificationVerificationEmail
