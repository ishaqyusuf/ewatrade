import { expect, test } from "bun:test"
import { renderWhatsAppActionResultChunks } from "./action-result"

const base = {
  kind: "payment_links" as const,
  recordId: "command1",
  title: "Payment link created",
  detail: "ORD-1\nhttps://dash.ewatrade.com/pay/token",
  links: [
    {
      orderId: "order1",
      orderNumber: "ORD-1",
      url: "https://dash.ewatrade.com/pay/token",
      amountMinor: 10000,
      currencyCode: "NGN",
      expiresAt: "2026-10-27T12:00:00Z",
    },
  ],
}
test("old receipts and cancellation retain the single-message contract", () => {
  expect(
    renderWhatsAppActionResultChunks({ status: "COMPLETED", receipt: base }),
  ).toHaveLength(1)
  expect(
    renderWhatsAppActionResultChunks({ status: "CANCELLED", receipt: null }),
  ).toEqual(["Draft cancelled."])
})
test("an individual payment message contains only its own draft; untrusted app URL is excluded", () => {
  const receipt = {
    ...base,
    links: base.links.map((link) => ({
      ...link,
      copyText: "Pay ORD-1:\nhttps://dash.ewatrade.com/pay/token",
    })),
  }
  const result = renderWhatsAppActionResultChunks(
    { status: "COMPLETED", receipt },
    "https://attacker.test/assistant/c/secret?bad=1",
    { paymentOrigin: "https://dash.ewatrade.com" },
  )
  expect(result).toHaveLength(2)
  expect(result[0]).not.toContain("attacker.test")
  expect(result[1]).toBe(receipt.links[0]?.copyText)
  expect(result[0]).toContain("no payment was recorded")
})
