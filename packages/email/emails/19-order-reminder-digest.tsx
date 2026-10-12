import { orderReminderDigest } from "../src/preview-fixtures"
import { CommercialOrderReminderDigestEmail } from "../templates/commercial-order-reminder-digest"

export default function Preview() {
  return <CommercialOrderReminderDigestEmail input={orderReminderDigest} />
}
