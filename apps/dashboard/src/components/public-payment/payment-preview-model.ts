import { type PublicPaymentLink, businessInitials } from "./payment-format"

/**
 * What the payment link's social preview image shows (Workshop finance/payment-link-preview 02,
 * revision 248e31a0). Built only from the public payment-link projection: business name, order
 * number, first item, currency, the link's requested amount and its state. Never customer
 * identity/contact, bank account numbers, receipts, notes or report data.
 */
export type PaymentPreview =
  | {
      kind: "request"
      businessName: string
      initials: string
      reference: string
      amount: string
      amountSize: number
    }
  | {
      kind: "status"
      businessName: string
      initials: string
      reference: string
      status: string
      detail: string
    }
  | { kind: "unavailable" }

/**
 * Added to the image URL in the page metadata. Chat apps cache link previews by URL, so bump it
 * whenever the image design changes.
 */
export const PAYMENT_PREVIEW_VERSION = "amount-ticket-v1"

const MAX_TEXT = 120
/** Usable width of the amount line: 1200 - 2 × 84 padding. */
const AMOUNT_WIDTH = 1032
/** Approved .o2-amt size and its autofit floor. */
const AMOUNT_MAX = 176
const AMOUNT_MIN = 96

function clean(value: string) {
  const text = Array.from(value)
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text
}

/** "₦2,000", "₦2,000.50", "₦1,250,000". Whole amounts drop the kobo, as in the approved design. */
export function previewAmount(minor: number, currencyCode: string) {
  const whole = minor % 100 === 0
  const digits = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minor / 100)
  if (currencyCode === "NGN") return `₦${digits}`
  try {
    const symbol =
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: currencyCode,
        currencyDisplay: "narrowSymbol",
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? currencyCode
    return `${symbol}${digits}`
  } catch {
    return `${currencyCode} ${digits}`
  }
}

/**
 * The amount never wraps; Satori can't measure, so pick the size from the string. Advances are
 * Figtree 800 net of the -0.035em tracking, with every digit as wide as the widest ("0", 0.652em)
 * since the renderer can't use tabular figures; separators 0.272em; Inter's "₦" 0.77em.
 */
export function previewAmountSize(amount: string) {
  let units = 0
  for (const character of amount)
    units += /\d/.test(character)
      ? 0.617
      : /[.,]/.test(character)
        ? 0.237
        : 0.775
  const fit = Math.floor(AMOUNT_WIDTH / Math.max(units, 1))
  return Math.max(AMOUNT_MIN, Math.min(AMOUNT_MAX, fit))
}

function reference(link: PublicPaymentLink) {
  const first = link.items[0]?.name ? clean(link.items[0].name) : ""
  const more = link.items.length > 1 ? ` +${link.items.length - 1} more` : ""
  return clean(`Order ${link.orderNumber}${first ? ` · ${first}${more}` : ""}`)
}

export function paymentPreviewModel(
  link: PublicPaymentLink | null,
): PaymentPreview {
  if (!link) return { kind: "unavailable" }
  const businessName = clean(link.businessName) || "This business"
  const base = {
    businessName,
    // "Abdulrahman & Sons" → "AS", not "A&".
    initials: businessInitials(
      businessName.replace(/[^\p{L}\p{N}\s]/gu, " ").trim() || businessName,
    ),
    reference: reference(link),
  }
  if (link.state === "active" && link.amountRequestedMinor > 0) {
    // The amount saved on the link, not the prefill (capped at the live balance) or the balance.
    const amount = previewAmount(link.amountRequestedMinor, link.currencyCode)
    return {
      kind: "request",
      ...base,
      amount,
      amountSize: previewAmountSize(amount),
    }
  }
  if (link.state === "paid")
    return {
      kind: "status",
      ...base,
      status: "Paid in full",
      detail: "Nothing more to pay on this order",
    }
  return {
    kind: "status",
    ...base,
    status: link.state === "expired" ? "Link expired" : "Link unavailable",
    detail: "Ask the business for a new link",
  }
}
