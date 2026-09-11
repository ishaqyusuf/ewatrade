import { BrandEmail, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export type StoreConversationNotificationEmailInput = {
  body: string
  subject: string
}

export function StoreConversationNotificationEmail({
  input,
}: {
  input: StoreConversationNotificationEmailInput
}) {
  return (
    <BrandEmail
      eyebrow="Store conversation"
      intro={input.body}
      note="For privacy, notification emails never include message content. Open EwaTrade from the same device or account you normally use to read the reply."
      preview={input.subject}
      title="Your Store conversation moved."
    >
      <EmailStatus label="New activity" tone="live" />
    </BrandEmail>
  )
}

export function renderStoreConversationNotificationTemplate(
  input: StoreConversationNotificationEmailInput,
) {
  return {
    html: renderEmailMarkup(
      <StoreConversationNotificationEmail input={input} />,
    ),
    text: createEmailText({
      intro: input.body,
      note: "For privacy, notification emails never include message content. Open EwaTrade from the same device or account you normally use to read the reply.",
      title: "Your Store conversation moved.",
    }),
  }
}

export default StoreConversationNotificationEmail
