import { renderMarketingEmailTemplate } from "./shared"

export type RetailOpsSharedLinkOrderEmailInput = {
  businessName: string
  customerEmail: string
  customerName: string
  customerPhone?: string | null
  notes?: string | null
  orderNumber: string
  productName: string
  productUrl?: string | null
  quantity: number
  totalFormatted: string
  unitName: string
}

function getOrderSections(input: RetailOpsSharedLinkOrderEmailInput) {
  return [
    { label: "Order reference", value: input.orderNumber },
    { label: "Product", value: input.productName },
    { label: "Unit", value: input.unitName },
    { label: "Quantity", value: String(input.quantity) },
    { label: "Estimated total", value: input.totalFormatted },
    { label: "Customer", value: input.customerName },
    { label: "Customer email", value: input.customerEmail },
    { label: "Customer phone", value: input.customerPhone },
    { label: "Note", value: input.notes },
  ]
}

export function renderRetailOpsSharedLinkOrderCustomerTemplate(
  input: RetailOpsSharedLinkOrderEmailInput,
) {
  return renderMarketingEmailTemplate({
    ctaHref: input.productUrl ?? undefined,
    ctaLabel: input.productUrl ? "View product" : undefined,
    intro: `${input.businessName} has received your request for ${input.productName}. The business will follow up to confirm payment, pickup, and availability.`,
    outro:
      "This is a request confirmation, not a paid receipt. Please wait for the business to confirm the order details.",
    sections: getOrderSections(input).filter(
      (section) =>
        section.label !== "Customer" &&
        section.label !== "Customer email" &&
        section.label !== "Customer phone",
    ),
    title: "Your order request was received",
  })
}

export function renderRetailOpsSharedLinkOrderMerchantTemplate(
  input: RetailOpsSharedLinkOrderEmailInput,
) {
  return renderMarketingEmailTemplate({
    ctaHref: input.productUrl ?? undefined,
    ctaLabel: input.productUrl ? "Open product link" : undefined,
    intro: `${input.customerName} submitted an order request from a shared product link for ${input.productName}. Follow up to confirm payment, pickup, and fulfillment.`,
    sections: getOrderSections(input),
    title: "New product-link order request",
  })
}
