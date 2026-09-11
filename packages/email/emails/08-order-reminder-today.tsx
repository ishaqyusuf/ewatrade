import { orderReminder } from "../src/preview-fixtures"
import { CommercialOrderFulfillmentReminderEmail } from "../templates/commercial-order-fulfillment-reminder"

export default function Preview() {
  return (
    <CommercialOrderFulfillmentReminderEmail
      input={{ ...orderReminder, timing: "same_day" }}
    />
  )
}
