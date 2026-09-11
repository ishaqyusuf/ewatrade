import { BrandEmail, EmailDetails, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export type CommercialOrderFulfillmentReminderEmailInput = {
  businessName: string
  customerName: string | null
  deliveryDueLabel: string
  orderId: string
  orderNumber: string
  storeName: string
  timing: "day_before" | "same_day"
}

function getContent(input: CommercialOrderFulfillmentReminderEmailInput) {
  const sameDay = input.timing === "same_day"

  return {
    intro: sameDay
      ? `Order ${input.orderNumber} is due today. Review the order, finish the remaining Product lines, and record fulfillment only when delivery is complete.`
      : `Order ${input.orderNumber} is due tomorrow. Review what is reserved and prepare the remaining Product lines for fulfillment.`,
    note: "This reminder does not fulfill the order or change stock. EwaTrade records fulfillment only after an authorized operator confirms it.",
    title: sameDay
      ? "Delivery is due today."
      : "Tomorrow's delivery needs a look.",
  }
}

export function CommercialOrderFulfillmentReminderEmail({
  input,
}: {
  input: CommercialOrderFulfillmentReminderEmailInput
}) {
  const content = getContent(input)

  return (
    <BrandEmail
      eyebrow="Store operations / Delivery"
      intro={content.intro}
      note={content.note}
      preview={`Order ${input.orderNumber} is due ${input.timing === "same_day" ? "today" : "tomorrow"}`}
      title={content.title}
    >
      <EmailStatus
        label={input.timing === "same_day" ? "Due today" : "Due tomorrow"}
        tone="attention"
      />
      <EmailDetails
        details={[
          { label: "Business", value: input.businessName },
          { label: "Store", value: input.storeName },
          { label: "Order", value: input.orderNumber },
          { label: "Customer", value: input.customerName },
          { label: "Delivery due", value: input.deliveryDueLabel },
        ]}
      />
    </BrandEmail>
  )
}

export function renderCommercialOrderFulfillmentReminderTemplate(
  input: CommercialOrderFulfillmentReminderEmailInput,
) {
  const content = getContent(input)

  return {
    html: renderEmailMarkup(
      <CommercialOrderFulfillmentReminderEmail input={input} />,
    ),
    text: createEmailText({
      details: [
        { label: "Business", value: input.businessName },
        { label: "Store", value: input.storeName },
        { label: "Order", value: input.orderNumber },
        { label: "Customer", value: input.customerName },
        { label: "Delivery due", value: input.deliveryDueLabel },
      ],
      intro: content.intro,
      note: content.note,
      title: content.title,
    }),
  }
}

export default CommercialOrderFulfillmentReminderEmail
