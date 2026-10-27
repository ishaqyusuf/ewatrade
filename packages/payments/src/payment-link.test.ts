import { expect, test } from "bun:test"
import {
  createPaymentLinkToken,
  paymentLinkPreview,
  paymentLinkSharing,
  paymentLinkUrl,
  paymentLinkWhatsApp,
  readPaymentLinkToken,
} from "./payment-link"

const secret = "test-signing-key-at-least-32-characters"
const now = new Date("2026-10-26T12:00:00Z")
const expiresAt = new Date("2026-10-27T12:00:00Z")
test("payment tokens reject tampering, other keys, expired and invalid clocks", () => {
  const token = createPaymentLinkToken(
    { intentId: "intent_1", expiresAt },
    secret,
  )
  expect(readPaymentLinkToken(token, secret, now)).toEqual({
    intentId: "intent_1",
    expiresAt,
  })
  expect(
    readPaymentLinkToken(token.replace("intent_1", "intent_2"), secret, now),
  ).toBeNull()
  expect(readPaymentLinkToken(token, `${secret}other`, now)).toBeNull()
  expect(readPaymentLinkToken(token, secret, expiresAt)).toBeNull()
  expect(readPaymentLinkToken(token, secret, new Date("invalid"))).toBeNull()
  expect(readPaymentLinkToken(`${token}junk`, secret, now)).toBeNull()
})
test("payment origin cannot redirect to insecure or credential-bearing paths", () => {
  expect(paymentLinkUrl("https://ewatrade-dashboard.localhost", "token")).toBe(
    "https://ewatrade-dashboard.localhost/pay/token",
  )
  for (const origin of [
    "http://example.com",
    "https://a:b@example.com",
    "https://example.com/elsewhere",
    "https://example.com:123",
    "https://example.com?x=y",
  ])
    expect(() => paymentLinkUrl(origin, "token")).toThrow()
})
test("random payment handles use the short path on the configured public origin", () => {
  const code = "Ab3x9Kp7Lm2Qv8Ts4Wy6ZA"
  expect(paymentLinkUrl("https://app.ewatrade.com", code)).toBe(
    `https://app.ewatrade.com/p/${code}`,
  )
})
test("WhatsApp uses international phone and encoded human-send draft", () => {
  const result = new URL(
    paymentLinkWhatsApp({
      phone: "+234 (803) 123-4567",
      businessName: "A & B",
      orderNumber: "ORD 1",
      url: "https://example.com/pay/a",
    }),
  )
  expect(result.origin).toBe("https://wa.me")
  expect(result.pathname).toBe("/2348031234567")
  expect(result.searchParams.get("text")).toBe(
    "Hello, here is your payment link for order ORD 1 from A & B: https://example.com/pay/a",
  )
  expect(() =>
    paymentLinkWhatsApp({
      phone: "08031234567",
      businessName: "A",
      orderNumber: "1",
      url: "https://example.com",
    }),
  ).toThrow()
})
test("preview contains useful payment metadata without private order details", () => {
  expect(paymentLinkPreview("Jawdah")).toEqual({
    title: "Payment for Jawdah",
    description:
      "View your order or service, check the bank details and report your transfer for the business to confirm.",
    robots: "noindex, nofollow, noarchive",
  })
})

test("saved-number sharing preserves the reviewed amount and falls back to Copy", () => {
  const input = {
    phone: "+234 803 123 4567",
    businessName: "Mama Ada",
    orderNumber: "ORD-125",
    url: "https://example.com/pay/token",
    amountMinor: 500000,
    currencyCode: "NGN",
  }
  const sharing = paymentLinkSharing(input)
  expect(sharing.copyText).toContain("Amount: NGN 5000.00")
  const url = new URL(sharing.whatsappUrl ?? "")
  expect(url.pathname).toBe("/2348031234567")
  expect(url.searchParams.get("text")).toBe(sharing.copyText)
  expect(paymentLinkSharing({ ...input, phone: null }).whatsappUrl).toBeNull()
  expect(
    paymentLinkSharing({ ...input, phone: "08031234567" }).whatsappUrl,
  ).toBeNull()
})

test("report status tokens cannot be used as payment-link authority", () => {
  const token = createPaymentLinkToken(
    { intentId: "report_1", expiresAt },
    secret,
    "manual-report",
  )
  expect(readPaymentLinkToken(token, secret, now)).toBeNull()
  expect(readPaymentLinkToken(token, secret, now, "manual-report")).toEqual({
    intentId: "report_1",
    expiresAt,
  })
})
