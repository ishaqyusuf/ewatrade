import { StoreNotificationVerificationEmail } from "../templates/store-notification-verification"

export default function Preview() {
  return <StoreNotificationVerificationEmail input={{ code: "357821" }} />
}
