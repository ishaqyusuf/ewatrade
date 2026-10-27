import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { generalReceiptSchema } from "@ewatrade/assistant/general/contracts"
import { generalReceiptRoute } from "./general-model"
import { nativeInlineReceiptKinds, nativeParityGaps } from "./native-parity"
import {
  type PaymentLinksAction,
  type PaymentLinksReceipt,
  paymentLinkLifetimeChoices,
  paymentLinkLifetimeLabel,
  paymentLinkMessage,
  paymentLinksReviewLine,
  paymentLinksReviewParts,
} from "./native-payment-links-values"

const payload: PaymentLinksAction = {
  action: "payment_links_create",
  orderIds: ["order-1", "order-2"],
  bankAccountId: "account-1",
  allowPartial: false,
  lifetimeMinutes: 1440,
}

test("server review lines split into order rows and plain lines", () => {
  const parts = paymentLinksReviewParts([
    "ORD-125 · NGN 150.00 due",
    "ORD-126 · NGN 20.00 due",
    "Receive into Shop bank · GTBank · ending 6789.",
    "Creates shareable bank-transfer instructions only. Nothing is sent and no payment is recorded.",
  ])
  expect(parts.orders).toEqual([
    { orderNumber: "ORD-125", due: "NGN 150.00" },
    { orderNumber: "ORD-126", due: "NGN 20.00" },
  ])
  expect(parts.rest).toHaveLength(2)
  expect(
    paymentLinksReviewLine(
      "Links expire 1440 minutes after creation.",
      payload,
    ),
  ).toBe("Link works for 24 hours after it is created.")
})

test("lifetimes stay within the offered choices plus a saved odd value", () => {
  expect(paymentLinkLifetimeLabel(60)).toBe("1 hour")
  expect(paymentLinkLifetimeLabel(4320)).toBe("72 hours")
  expect(paymentLinkLifetimeLabel(90)).toBe("90 minutes")
  expect(paymentLinkLifetimeChoices(1440)).toEqual([60, 1440, 2880, 4320])
  expect(paymentLinkLifetimeChoices(30)).toEqual([30, 60, 1440, 2880, 4320])
})

test("payment links render inline with the server message, never a record route", () => {
  const receipt = generalReceiptSchema.parse({
    kind: "payment_links",
    recordId: "key-1",
    title: "1 payment link created",
    detail: "ORD-125",
    links: [
      {
        orderId: "order-1",
        orderNumber: "ORD-125",
        url: "https://pay.example.com/p/token",
        amountMinor: 15000,
        currencyCode: "NGN",
        expiresAt: "2026-10-27T10:00:00.000Z",
      },
    ],
  }) as PaymentLinksReceipt
  expect(nativeInlineReceiptKinds.has(receipt.kind)).toBe(true)
  expect(generalReceiptRoute(receipt)).toBeNull()
  const [link] = receipt.links
  if (!link) throw Error("Missing link")
  expect(paymentLinkMessage(link, "Amina Stores")).toBe(
    "Hello, here is your payment link for order ORD-125 from Amina Stores: https://pay.example.com/p/token",
  )
  expect(paymentLinkMessage({ ...link, copyText: "Server text" })).toBe(
    "Server text",
  )
  const capability = capabilityManifest.find(
    (entry) =>
      entry.mode === "write" && entry.action === "payment_links_create",
  )
  expect(capability && nativeParityGaps([capability])).toEqual([])
})
