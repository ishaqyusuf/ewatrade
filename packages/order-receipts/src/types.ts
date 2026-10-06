import { z } from "zod"

export const receiptSettingsSchema = z
  .object({
    showCustomerName: z.boolean(),
    showPaymentBreakdown: z.boolean(),
    thankYouNote: z.string().trim().max(300),
  })
  .strict()

export type ReceiptSettings = z.infer<typeof receiptSettingsSchema>

export class ReceiptRenderError extends Error {}

export function isReceiptOrderEligible(status: string) {
  return !["DRAFT", "PENDING", "CANCELLED"].includes(status)
}

export const defaultReceiptSettings: ReceiptSettings = {
  showCustomerName: true,
  showPaymentBreakdown: true,
  thankYouNote: "Thank you for shopping with us.",
}

export function readReceiptSettings(metadata: unknown): ReceiptSettings | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null
  const result = receiptSettingsSchema.safeParse(
    Reflect.get(metadata, "orderReceiptSettings"),
  )
  return result.success ? result.data : null
}

export type OrderReceipt = {
  id: string
  orderNumber: string
  businessName: string
  storeName: string
  address: string
  supportPhone: string | null
  createdAt: string
  generatedAt: string
  timezone: string
  currencyCode: string
  customerName: string | null
  subtotalMinor: number
  discountMinor: number
  taxMinor: number
  serviceChargeMinor: number
  totalMinor: number
  receivedMinor: number
  refundedMinor: number
  balanceMinor: number
  paymentLabel: string
  settings: ReceiptSettings
  settingsSource: "business" | "store"
  lines: Array<{
    id: string
    name: string
    unitName: string | null
    quantity: string
    unitPriceMinor: number | null
    note?: string | null
    totalMinor: number
  }>
  payments: Array<{
    id: string
    method: string
    type: string
    amountMinor: number
    recordedAt: string
  }>
}

export function receiptPaymentLabel(input: {
  totalMinor: number
  receivedMinor: number
  refundedMinor: number
  paymentCount: number
  sourcePaymentStatus: string
}) {
  if (
    input.paymentCount === 0 &&
    input.sourcePaymentStatus === "PAID" &&
    input.receivedMinor === 0
  ) {
    return "Historical payment details unavailable"
  }
  if (input.refundedMinor > 0 && input.receivedMinor === 0) return "Refunded"
  if (input.totalMinor === 0) return "No payment due"
  if (input.receivedMinor >= input.totalMinor) return "Paid"
  if (input.receivedMinor > 0)
    return input.refundedMinor > 0 ? "Part paid · refund recorded" : "Part paid"
  return "Unpaid"
}

export function receiptMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100)
}

export function receiptFileStem(orderNumber: string) {
  return `receipt-${orderNumber.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)}`
}
