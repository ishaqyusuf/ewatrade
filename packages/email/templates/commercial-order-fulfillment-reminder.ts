import { renderMarketingEmailTemplate } from "./shared"

export type CommercialOrderFulfillmentReminderEmailInput = {
  businessName: string
  customerName: string | null
  deliveryDueLabel: string
  orderId: string
  orderNumber: string
  storeName: string
  timing: "day_before" | "same_day"
}

export function renderCommercialOrderFulfillmentReminderTemplate(
  input: CommercialOrderFulfillmentReminderEmailInput,
) {
  return renderMarketingEmailTemplate({
    intro:
      input.timing === "same_day"
        ? `Order ${input.orderNumber} is due for delivery today. Review the Order and fulfill its Product lines when delivery is complete.`
        : `Order ${input.orderNumber} is due for delivery tomorrow. Review the Order and prepare its Product lines for fulfillment.`,
    sections: [
      { label: "Business", value: input.businessName },
      { label: "Store", value: input.storeName },
      { label: "Order", value: input.orderNumber },
      { label: "Customer", value: input.customerName },
      { label: "Delivery due", value: input.deliveryDueLabel },
    ],
    title:
      input.timing === "same_day"
        ? "Order delivery is due today"
        : "Order delivery is due tomorrow",
  })
}
