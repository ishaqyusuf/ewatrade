/**
 * Clearly labelled sample details for Settings previews. Real Order facts are
 * only ever shown from the server's preview.
 */
export function sampleMessageVariables({
  businessName,
  storeName,
}: {
  businessName: string
  storeName: string
}): Record<string, string> {
  return {
    customer_name: "Ada Okafor",
    customer_first_name: "Ada",
    business_name: businessName,
    store_name: storeName,
    store_phone: "0803 123 4567",
    order_number: "ORD-1024",
    order_date: "14 Oct 2026",
    order_total: "₦25,000",
    items_summary: "2 × Rice 5kg, 1 × Palm oil 1L",
    order_status: "out for delivery",
    amount_paid: "₦10,000",
    payment_date: "14 Oct 2026",
    total_paid: "₦15,000",
    balance_due: "₦10,000",
    payment_method: "bank transfer",
    refund_amount: "₦5,000",
  }
}

export const SAMPLE_LABEL = "Example"
