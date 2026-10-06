import { Text } from "@react-email/components"
import { BrandEmail, warmDeskStyles } from "../components"
import { renderEmailMarkup } from "../src/render"

export type AccountPrivacyOutcomeInput = {
  subject: string
  text: string
}

/** Content is supplied by the operator; this template makes no outcome claims. */
export function AccountPrivacyOutcomeEmail({
  input,
}: {
  input: AccountPrivacyOutcomeInput
}) {
  return (
    <BrandEmail
      eyebrow="Account privacy"
      intro={null}
      preview={input.subject}
      title={
        <span style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
          {input.subject}
        </span>
      }
    >
      <Text
        style={{
          ...warmDeskStyles.intro,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {input.text}
      </Text>
    </BrandEmail>
  )
}

/** Approve the exact returned HTML/text, including the shared shell, before send. */
export function renderAccountPrivacyOutcomeTemplate(
  input: AccountPrivacyOutcomeInput,
) {
  return {
    html: renderEmailMarkup(<AccountPrivacyOutcomeEmail input={input} />),
    text: input.text,
  }
}

export default AccountPrivacyOutcomeEmail
