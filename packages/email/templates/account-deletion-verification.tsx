import { BrandEmail, EmailCode, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"

export type AccountDeletionVerificationInput = { code: string }

export function AccountDeletionVerificationEmail({
  input,
}: {
  input: AccountDeletionVerificationInput
}) {
  return (
    <BrandEmail
      eyebrow="Account privacy"
      intro="Use this code to verify your account deletion request."
      note="It expires in 10 minutes. If you did not request this, ignore this email. Never share the code."
      preview="Your EwaTrade account deletion request code"
      title="Verify your deletion request."
    >
      <EmailStatus label="Private code" tone="attention" />
      <EmailCode>{input.code}</EmailCode>
    </BrandEmail>
  )
}

export function renderAccountDeletionVerificationTemplate(
  input: AccountDeletionVerificationInput,
) {
  return {
    html: renderEmailMarkup(<AccountDeletionVerificationEmail input={input} />),
    text: `Your EwaTrade account deletion request code is ${input.code}. It expires in 10 minutes. If you did not request this, ignore this email. Never share the code.`,
  }
}

export default AccountDeletionVerificationEmail
