import { expect, test } from "bun:test"
import {
  renderWhatsAppActionResult,
  renderWhatsAppActionResultChunks,
} from "./action-result"
import { presentWhatsAppMessage } from "./presentation"

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

test("a cancelled native draft says what stayed unchanged", () => {
  const cancelled = (action: string) =>
    renderWhatsAppActionResult({
      status: "CANCELLED",
      receipt: null,
      payload: { action },
    })
  expect(cancelled("stock_receive")).toBe(
    "Draft cancelled. Stock is unchanged.",
  )
  expect(cancelled("payment_record")).toBe(
    "Draft cancelled. Nothing was recorded.",
  )
  expect(cancelled("product_price_update")).toBe(
    "Draft cancelled. The price is unchanged.",
  )
  expect(cancelled("order_attachment_add")).toBe(
    "Draft cancelled. Nothing was attached.",
  )
  expect(cancelled("customer_create")).toBe("Draft cancelled.")
  expect(
    presentWhatsAppMessage(cancelled("stock_receive"), { family: "result" }),
  ).toBe("↩️ *Draft cancelled*\n\nStock is unchanged.")
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

test("native Order cancellation and saved receipt share exact canonical rendering and trusted navigation", () => {
  expect(
    renderWhatsAppActionResultChunks({
      status: "CANCELLED",
      receipt: null,
      payload: { action: "order_create" },
    }),
  ).toEqual([
    "Draft cancelled. No order, stock change or payment was recorded.",
  ])
  const proposal = completed({
    kind: "order",
    recordId: "saved-order",
    orderId: "saved-order",
    title: "Order created",
    detail: "S-1 · total ₦20.00 · received ₦4.00 · remaining ₦16.00",
  })
  expect(
    renderWhatsAppActionResultChunks(proposal, undefined, {
      appOrigin: "https://dash.ewatrade.com",
    })[0],
  ).toContain("https://dash.ewatrade.com/sales/orders/saved-order")
  expect(
    renderWhatsAppActionResultChunks(proposal, undefined, {
      appOrigin: "https://dash.ewatrade.com?token=secret",
    })[0],
  ).not.toContain("secret")
})
