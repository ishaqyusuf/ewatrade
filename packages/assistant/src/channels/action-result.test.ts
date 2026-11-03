import { expect, test } from "bun:test"
import { renderWhatsAppActionResult } from "./action-result"

const completed = (receipt: Record<string, unknown>) => ({
  status: "COMPLETED",
  receipt: receipt as { title: string; detail: string },
})

test("receipts for the added native reviews say what was recorded or changed", () => {
  const payment = renderWhatsAppActionResult(
    completed({
      kind: "payment",
      recordId: "payment",
      orderId: "order",
      title: "Payment recorded",
      detail: "₦24,500.00 · bank transfer · remaining ₦0.00",
    }),
  )
  expect(payment).toContain("Payment recorded")
  expect(payment).toContain("remaining ₦0.00")
  expect(payment).not.toMatch(/\b(?:sent|moved)\b/i)
  expect(
    renderWhatsAppActionResult(
      completed({
        kind: "inventory",
        recordId: "operation",
        title: "Stock received",
        detail: "20 bag received · on hand 34 bag · Delivery DN-118",
      }),
    ),
  ).toContain("on hand 34 bag")
  expect(
    renderWhatsAppActionResult(
      completed({
        kind: "product",
        recordId: "item",
        title: "Product price updated",
        detail: "Evaporated Milk · Tin · ₦700.00",
      }),
    ),
  ).toContain("Product price updated")
  expect(
    renderWhatsAppActionResult(
      completed({
        kind: "order",
        recordId: "order",
        orderId: "order",
        title: "Note added",
        detail: "Added to S-1039's Notes & photos.",
      }),
    ),
  ).toContain("S-1039")
  expect(
    renderWhatsAppActionResult({ status: "CANCELLED", receipt: null }),
  ).toBe("Draft cancelled.")
})

test("a money receipt never claims money was sent, moved or transferred", () => {
  const text = renderWhatsAppActionResult(
    completed({
      kind: "payment",
      recordId: "payment",
      orderId: "order",
      title: "Payment recorded",
      detail: "₦24,500.00 moved to Main bank",
    }),
    "https://dash.ewatrade.com/assistant/c/saved-chat",
  )
  expect(text).toBe(
    "Payment recorded in EwaTrade. Open the saved chat for the complete original receipt.\nhttps://dash.ewatrade.com/assistant/c/saved-chat",
  )
})
