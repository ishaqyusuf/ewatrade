export type StorefrontReceiptStage =
  | "received"
  | "needs_information"
  | "quoted"
  | "confirmed"
  | "declined"
  | "withdrawn"
  | "ready"
  | "completed"
  | "cancelled"

type Message = { id: string; author: string; body: string; at: string }
export type OrderFacts = {
  orderNumber: string
  status: string
  paymentStatus: string
  totalMinor: number
  paidMinor: number
  balanceMinor: number
  currencyCode: string
  subtotalMinor?: number
  deliveryFeeMinor?: number
  paymentReport: { status: string; claimedAmountMinor: number } | null
}

/** Serializable receipt prepared by the host (never includes merchant-private data). */
export type ReceiptView = {
  token: string
  kind: "order" | "service"
  reference: string
  businessName: string
  stage: StorefrontReceiptStage
  revision: number
  createdAt: string
  customerName: string
  staffResponse: string | null
  messages: Message[]
  currencyCode: string
  lines: {
    key: string
    name: string
    option: string
    quantity: string
    unitLabel: string | null
    unitPriceMinor: number | null
  }[]
  fulfilment?: "pickup" | "delivery"
  deliveryAddress?: string | null
  observedSubtotalMinor?: number
  preferredDate?: string | null
  collectionAddress?: string | null
  details?: string | null
  quote?: {
    versionId: string
    status: string
    totalMinor: number
    feeMinor: number
    currencyCode: string
    note: string | null
    expiresAt: string | null
    lines: {
      name: string
      option: string
      quantity: string | null
      totalMinor: number
    }[]
    acceptUrl: string | null
  } | null
  /** The business's booked appointment (canonical ServiceBooking), if any. */
  appointment?: {
    status: string
    startsAt: string
    timezone: string
    endsAt?: string | null
    serviceName?: string | null
  } | null
  order: OrderFacts | null
  paymentUrl: string | null
  businessWhatsApp: string | null
  canLinkToAccount: boolean
}
