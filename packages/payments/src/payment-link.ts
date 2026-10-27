import { createHmac, timingSafeEqual } from "node:crypto"

export type PaymentLinkIdentity = { intentId: string; expiresAt: Date }
const signature = (
  body: string,
  secret: string,
  purpose: "order-payment" | "manual-report" = "order-payment",
) => {
  if (secret.length < 32)
    throw new Error(
      "Configure a payment-link signing key of at least 32 characters.",
    )
  return createHmac("sha256", secret)
    .update(`ewatrade:${purpose}:v1:${body}`)
    .digest("base64url")
}

export function createPaymentLinkToken(
  input: PaymentLinkIdentity,
  secret: string,
  purpose: "order-payment" | "manual-report" = "order-payment",
) {
  if (
    !/^[a-zA-Z0-9_-]{1,128}$/.test(input.intentId) ||
    !Number.isFinite(input.expiresAt.getTime())
  )
    throw new Error("Invalid payment-link identity.")
  const body = `${input.intentId}.${input.expiresAt.getTime()}`
  return `${body}.${signature(body, secret, purpose)}`
}

/** A token grants only the payment page. It grants no merchant/account access. */
export function readPaymentLinkToken(
  token: string,
  secret: string,
  now: Date,
  purpose: "order-payment" | "manual-report" = "order-payment",
): PaymentLinkIdentity | null {
  if (!Number.isFinite(now.getTime()) || token.length > 220) return null
  const match = /^([a-zA-Z0-9_-]{1,128})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(
    token,
  )
  if (!match) return null
  const [, intentId, expiry, received] = match
  if (!intentId || !expiry || !received) return null
  const expected = signature(`${intentId}.${expiry}`, secret, purpose)
  if (!timingSafeEqual(Buffer.from(received), Buffer.from(expected)))
    return null
  const expiresAt = new Date(Number(expiry))
  if (expiresAt.getTime() <= now.getTime()) return null
  return { intentId, expiresAt }
}

export function paymentLinkUrl(origin: string, token: string) {
  const base = new URL(origin)
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.port ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw new Error(
      "Configure a secure public payment origin without a path or port.",
    )
  return new URL(`/pay/${encodeURIComponent(token)}`, base).href
}

/** Opens the customer's chat with an editable draft; never sends a message. */
export function paymentLinkWhatsApp(input: {
  phone: string
  businessName: string
  orderNumber: string
  url: string
}) {
  const phone = input.phone.replace(/[\s()+-]/g, "")
  if (!/^[1-9]\d{7,14}$/.test(phone))
    throw new Error("Use the customer's phone number with its country code.")
  const text = `Hello, here is your payment link for order ${input.orderNumber} from ${input.businessName}: ${input.url}`
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

/** Merchant-only sharing projection. A missing/invalid saved phone is Copy-only. */
export function paymentLinkSharing(input: {
  phone?: string | null
  businessName: string
  orderNumber: string
  url: string
  amountMinor: number
  currencyCode: string
}) {
  const literal = (value: string) =>
    Array.from(value)
      .filter((character) => character.charCodeAt(0) >= 32)
      .join("")
      .slice(0, 160)
  const copyText = `Hello, here is the payment page for order ${literal(input.orderNumber)} from ${literal(input.businessName)}.\nAmount: ${input.currencyCode} ${(input.amountMinor / 100).toFixed(2)}\nPay by bank transfer, then select I have paid.\n${input.url}\nThank you.`
  let whatsappUrl: string | null = null
  if (input.phone) {
    try {
      const destination = new URL(
        paymentLinkWhatsApp({ ...input, phone: input.phone }),
      )
      destination.searchParams.set("text", copyText)
      whatsappUrl = destination.href
    } catch {
      // A public payer phone is never used to repair an invalid saved contact.
    }
  }
  return { copyText, whatsappUrl }
}

/** Public social metadata deliberately excludes order contents and customer data. */
export function paymentLinkPreview(businessName: string) {
  const name =
    Array.from(businessName)
      .filter((character) => character.charCodeAt(0) >= 32)
      .join("")
      .trim()
      .slice(0, 100) || "this business"
  return {
    title: `Payment for ${name}`,
    description:
      "View your order or service, check the bank details and report your transfer for the business to confirm.",
    robots: "noindex, nofollow, noarchive" as const,
  }
}
