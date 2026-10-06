import type { OrderReceipt } from "./types"
import { defaultReceiptSettings } from "./types"

export function receiptFixture(
  overrides: Partial<OrderReceipt> = {},
): OrderReceipt {
  return {
    id: "receipt-qa",
    orderNumber: "ORD-0041",
    businessName: "Receipt QA · Ẹwà",
    storeName: "Main Store",
    address: "",
    supportPhone: null,
    createdAt: "2026-10-03T09:00:00.000Z",
    generatedAt: "2026-10-03T10:00:00.000Z",
    timezone: "Africa/Lagos",
    currencyCode: "NGN",
    customerName: "Amína Yusuf",
    subtotalMinor: 3450000,
    discountMinor: 0,
    taxMinor: 0,
    serviceChargeMinor: 0,
    totalMinor: 3450000,
    receivedMinor: 3450000,
    refundedMinor: 0,
    balanceMinor: 0,
    paymentLabel: "Paid",
    settings: { ...defaultReceiptSettings },
    settingsSource: "business",
    lines: [
      {
        id: "line-1",
        name: "Rice",
        unitName: "5 kg",
        quantity: "2",
        unitPriceMinor: 1500000,
        totalMinor: 3000000,
      },
      {
        id: "line-2",
        name: "Cooking oil",
        unitName: "Bottle",
        quantity: "1",
        unitPriceMinor: 450000,
        totalMinor: 450000,
      },
    ],
    payments: [
      {
        id: "payment-1",
        method: "cash",
        type: "PAYMENT",
        amountMinor: 3450000,
        recordedAt: "2026-10-03T09:00:00.000Z",
      },
    ],
    ...overrides,
  }
}
