import { expect, test } from "bun:test"
import type { PublicPaymentLink } from "./payment-format"
import {
  paymentPreviewModel,
  previewAmount,
  previewAmountSize,
} from "./payment-preview-model"

function link(over: Partial<PublicPaymentLink> = {}): PublicPaymentLink {
  return {
    businessName: "Jawdah Poultry QA",
    orderNumber: "ORD-059",
    orderStatus: "CONFIRMED",
    state: "active",
    amountRequestedMinor: 200_000,
    amountPrefilledMinor: 200_000,
    totalMinor: 200_000,
    paidMinor: 0,
    balanceMinor: 200_000,
    currencyCode: "NGN",
    allowPartial: false,
    receiptAllowed: true,
    expiresAt: new Date("2026-10-28T09:00:00Z"),
    bank: {
      name: "GTBank",
      accountNumber: "0012345678",
      accountHolder: "EwaTrade ManualQA",
    },
    items: [
      {
        name: "Inspection visit",
        kind: "SERVICE",
        quantity: "1",
        totalMinor: 200_000,
      },
    ],
    preview: {
      title: "Payment for Jawdah Poultry QA",
      description: "",
      robots: "noindex, nofollow, noarchive",
    },
    ...over,
  } as PublicPaymentLink
}

test("active link shows business, order and item, and this link's amount", () => {
  expect(paymentPreviewModel(link())).toEqual({
    kind: "request",
    businessName: "Jawdah Poultry QA",
    initials: "JP",
    reference: "Order ORD-059 · Inspection visit",
    amount: "₦2,000",
    amountSize: 176,
  })
})

test("after a partial payment the header keeps the link's requested amount", () => {
  const partlyPaid = {
    amountRequestedMinor: 200_000,
    amountPrefilledMinor: 50_000,
    paidMinor: 150_000,
    balanceMinor: 50_000,
  }
  expect(paymentPreviewModel(link(partlyPaid))).toMatchObject({
    kind: "request",
    amount: "₦2,000",
  })
  for (const state of ["paid", "expired", "unavailable"] as const) {
    const model = paymentPreviewModel(link({ ...partlyPaid, state }))
    expect(model.kind).toBe("status")
    expect(JSON.stringify(model)).not.toMatch(/₦|2,000|500/)
  }
})

test("amount formatting keeps kobo only when present", () => {
  expect(previewAmount(200_000, "NGN")).toBe("₦2,000")
  expect(previewAmount(200_050, "NGN")).toBe("₦2,000.50")
  expect(previewAmount(125_000_000, "NGN")).toBe("₦1,250,000")
})

test("long amounts step down to fit the line, but not below the approved floor", () => {
  expect(previewAmountSize("₦2,000")).toBe(176)
  // The largest amount a link accepts (100,000,000 minor units).
  const largest = previewAmountSize(previewAmount(99_999_999, "NGN"))
  expect(largest).toBeLessThan(176)
  expect(largest).toBeGreaterThanOrEqual(96)
  expect(previewAmountSize("₦999,999,999,999,999.99")).toBe(96)
})

test("extra items are counted, long names are bounded", () => {
  const model = paymentPreviewModel(
    link({
      businessName: "x".repeat(200),
      items: [
        {
          name: "Rice 5kg",
          kind: "PRODUCT_UNIT",
          quantity: "2",
          totalMinor: 1,
        },
        { name: "Oil", kind: "PRODUCT_UNIT", quantity: "1", totalMinor: 1 },
        { name: "Salt", kind: "PRODUCT_UNIT", quantity: "1", totalMinor: 1 },
      ] as PublicPaymentLink["items"],
    }),
  )
  if (model.kind !== "request") throw new Error("expected request")
  expect(model.reference).toBe("Order ORD-059 · Rice 5kg +2 more")
  expect(model.businessName.length).toBeLessThanOrEqual(120)
})

test("badge initials skip punctuation", () => {
  expect(
    paymentPreviewModel(link({ businessName: "Abdulrahman & Sons" })),
  ).toMatchObject({
    initials: "AS",
  })
})

test("paid, expired and unavailable omit the amount and say what happened", () => {
  const paid = paymentPreviewModel(
    link({ state: "paid", amountPrefilledMinor: 0, balanceMinor: 0 }),
  )
  const expired = paymentPreviewModel(link({ state: "expired" }))
  const closed = paymentPreviewModel(link({ state: "unavailable" }))
  expect(paid).toMatchObject({ kind: "status", status: "Paid in full" })
  expect(expired).toMatchObject({ kind: "status", status: "Link expired" })
  expect(closed).toMatchObject({ kind: "status", status: "Link unavailable" })
  for (const model of [paid, expired, closed])
    expect("amount" in model).toBe(false)
})

test("an unknown or unreadable link gets the generic fallback", () => {
  expect(paymentPreviewModel(null)).toEqual({ kind: "unavailable" })
})

test("no bank account, holder or customer data reaches the preview", () => {
  const serialized = JSON.stringify(paymentPreviewModel(link()))
  expect(serialized).not.toContain("0012345678")
  expect(serialized).not.toContain("ManualQA")
  expect(serialized).not.toContain("GTBank")
})
