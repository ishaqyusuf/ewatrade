import { StoreConversationNotificationEmail } from "../templates/store-conversation-notification"

export default function Preview() {
  return (
    <StoreConversationNotificationEmail
      input={{
        body: "Amina Home & Trade replied to your Store conversation.",
        subject: "Amina Home & Trade replied",
      }}
    />
  )
}
