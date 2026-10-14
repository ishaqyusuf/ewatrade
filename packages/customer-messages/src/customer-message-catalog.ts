import { z } from "zod"

const customerMessageEventSchema = z.object({
  key: z.enum([
    "order.recorded",
    "payment.recorded",
    "order.payment_reminder",
    "order.ready_for_pickup",
    "order.out_for_delivery",
    "order.completed",
    "order.cancelled",
    "payment.refund_recorded",
  ]),
  label: z.string().min(1),
  description: z.string().min(1),
  variables: z.array(z.string()),
  starterBody: z.string().min(1),
})

export const customerMessageEventKeySchema =
  customerMessageEventSchema.shape.key

const customerMessageEventDefinitions = [
  {
    key: "order.recorded",
    label: "Order recorded",
    description: "Let the customer know their order has been recorded.",
    variables: [
      "customer_name",
      "customer_first_name",
      "business_name",
      "store_name",
      "order_number",
      "order_date",
      "order_total",
      "items_summary",
      "total_paid",
      "balance_due",
    ],
    starterBody:
      "Hi {customer_first_name}, {business_name} has recorded order {order_number} for {order_total}. Items: {items_summary}. Paid so far: {total_paid}; balance due: {balance_due}. Thank you.",
  },
  {
    key: "payment.recorded",
    label: "Payment recorded",
    description: "Share a recorded payment and the customer's current balance.",
    variables: [
      "customer_name",
      "customer_first_name",
      "business_name",
      "store_name",
      "order_number",
      "amount_paid",
      "payment_date",
      "payment_method",
      "total_paid",
      "balance_due",
    ],
    starterBody:
      "Hi {customer_first_name}, {business_name} has recorded your payment of {amount_paid} for order {order_number}. Your current balance is {balance_due}. Thank you.",
  },
  {
    key: "order.payment_reminder",
    label: "Payment reminder",
    description:
      "Remind the customer about the order's current positive balance.",
    variables: [
      "customer_name",
      "customer_first_name",
      "business_name",
      "store_name",
      "order_number",
      "order_date",
      "balance_due",
    ],
    starterBody:
      "Hi {customer_first_name}, this is a reminder from {business_name} that order {order_number} has a balance of {balance_due}. Please contact us if you have any questions.",
  },
  {
    key: "order.ready_for_pickup",
    label: "Ready for pickup",
    description: "Let the customer know their order is ready to collect.",
    variables: [
      "customer_name",
      "customer_first_name",
      "business_name",
      "store_name",
      "store_phone",
      "order_number",
    ],
    starterBody:
      "Hi {customer_first_name}, order {order_number} is ready for pickup at {store_name}. Please contact us at {store_phone} if you need help.",
  },
  {
    key: "order.out_for_delivery",
    label: "Out for delivery",
    description: "Let the customer know their order is out for delivery.",
    variables: [
      "customer_name",
      "customer_first_name",
      "business_name",
      "store_name",
      "store_phone",
      "order_number",
      "order_status",
    ],
    starterBody:
      "Hi {customer_first_name}, order {order_number} is {order_status}. Contact {store_name} at {store_phone} if you need help.",
  },
  {
    key: "order.completed",
    label: "Order completed",
    description: "Thank the customer when their order is complete.",
    variables: [
      "customer_name",
      "customer_first_name",
      "business_name",
      "store_name",
      "order_number",
      "order_date",
    ],
    starterBody:
      "Hi {customer_first_name}, thank you for choosing {business_name}. Order {order_number} is complete.",
  },
  {
    key: "order.cancelled",
    label: "Order cancelled",
    description: "Let the customer know their order was cancelled.",
    variables: [
      "customer_name",
      "customer_first_name",
      "business_name",
      "store_name",
      "order_number",
      "order_status",
    ],
    starterBody:
      "Hi {customer_first_name}, order {order_number} has been cancelled. Please contact {business_name} if you have questions about any payment or next steps.",
  },
  {
    key: "payment.refund_recorded",
    label: "Refund recorded",
    description: "Share the amount and method of a recorded refund.",
    variables: [
      "customer_name",
      "customer_first_name",
      "business_name",
      "store_name",
      "order_number",
      "refund_amount",
      "payment_date",
      "payment_method",
    ],
    starterBody:
      "Hi {customer_first_name}, a refund of {refund_amount} for order {order_number} has been recorded by {business_name}. The method was {payment_method}.",
  },
] as const

const parsedCustomerMessageEvents = z
  .array(customerMessageEventSchema)
  .parse(customerMessageEventDefinitions)

export type CustomerMessageEventKey =
  (typeof parsedCustomerMessageEvents)[number]["key"]

export type CustomerMessageEvent = (typeof parsedCustomerMessageEvents)[number]

export const customerMessageEvents: readonly CustomerMessageEvent[] =
  parsedCustomerMessageEvents

export const customerMessageVariableLabels: Readonly<Record<string, string>> = {
  customer_name: "Customer name",
  customer_first_name: "Customer first name",
  business_name: "Business name",
  store_name: "Store name",
  store_phone: "Store phone",
  order_number: "Order number",
  order_date: "Order date",
  order_total: "Order total",
  items_summary: "Items summary",
  order_status: "Order status",
  amount_paid: "Payment amount",
  payment_date: "Payment date",
  total_paid: "Total paid",
  balance_due: "Balance due",
  payment_method: "Payment method",
  refund_amount: "Refund amount",
}

export function getCustomerMessageEvent(
  eventKey: CustomerMessageEventKey,
): CustomerMessageEvent {
  const event = customerMessageEvents.find(({ key }) => key === eventKey)
  if (!event) {
    throw new Error(`Unknown customer message event: ${String(eventKey)}`)
  }
  return event
}

export const requiredVariablesByEvent: Readonly<
  Record<CustomerMessageEventKey, readonly string[]>
> = {
  "order.recorded": [
    "order_number",
    "order_total",
    "items_summary",
    "total_paid",
    "balance_due",
  ],
  "payment.recorded": [
    "order_number",
    "amount_paid",
    "payment_date",
    "total_paid",
    "balance_due",
  ],
  "order.payment_reminder": ["order_number", "balance_due"],
  "order.ready_for_pickup": ["order_number", "store_name"],
  "order.out_for_delivery": ["order_number", "order_status"],
  "order.completed": ["order_number"],
  "order.cancelled": ["order_number"],
  "payment.refund_recorded": ["order_number", "refund_amount", "payment_date"],
}
