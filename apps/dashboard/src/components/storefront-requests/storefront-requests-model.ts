/**
 * WhatsApp drafts for storefront requests. Built from the saved request/order/quote
 * facts only and opened at the customer's saved number. Opening a draft is not
 * delivery: the business reviews it and presses Send in WhatsApp.
 */
export type DraftFacts = {
  businessName: string
  customerName: string
  reference: string
  kind: "order" | "service"
  stage: string
  staffResponse?: string | null
  lines: { name: string; quantity: string; unitLabel?: string | null }[]
  order?: {
    orderNumber: string
    totalMinor: number
    deliveryFeeMinor?: number
    balanceMinor: number
    currencyCode: string
    paymentStatus: string
  } | null
  quote?: {
    totalMinor: number
    currencyCode: string
    expiresAt: string | null
  } | null
  preferredDate?: string | null
  receiptUrl?: string | null
}

export function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
    }).format(minor / 100)
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`
  }
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there"
}

function itemsText(lines: DraftFacts["lines"]) {
  return lines
    .slice(0, 6)
    .map(
      (line) =>
        `• ${line.name} × ${line.quantity}${line.unitLabel ? ` ${line.unitLabel}` : ""}`,
    )
    .join("\n")
}

export function storefrontDraftText(facts: DraftFacts) {
  const hello = `Hello ${firstName(facts.customerName)}, this is ${facts.businessName}.`
  const ref = `Request ${facts.reference}`
  const receipt = facts.receiptUrl
    ? `\n\nTrack it here: ${facts.receiptUrl}`
    : ""
  if (facts.order) {
    const fee = facts.order.deliveryFeeMinor
      ? `\nDelivery: ${money(facts.order.deliveryFeeMinor, facts.order.currencyCode)}`
      : ""
    if (facts.order.paymentStatus === "PAID")
      return `${hello} Thank you, we've received full payment for order ${facts.order.orderNumber}. We'll let you know when it's ready.${receipt}`
    return `${hello} We've confirmed your ${facts.kind === "order" ? "order" : "service"} (${ref}, order ${facts.order.orderNumber}).\n\n${itemsText(facts.lines)}${fee}\nTotal: ${money(facts.order.totalMinor, facts.order.currencyCode)}\n\nWe'll send payment details next.${receipt}`
  }
  switch (facts.stage) {
    case "needs_information":
      return `${hello} About your ${ref}: ${facts.staffResponse ?? "we have a quick question."}${receipt}`
    case "declined":
      return `${hello} Sorry, we can't take your ${ref}. ${facts.staffResponse ?? ""}`.trim()
    case "quoted":
      return facts.quote
        ? `${hello} Your quote for ${ref} is ready: ${money(facts.quote.totalMinor, facts.quote.currencyCode)}${facts.quote.expiresAt ? `, valid until ${new Date(facts.quote.expiresAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}` : ""}. Please review and accept it here.${receipt}`
        : `${hello} Your quote for ${ref} is ready.${receipt}`
    default:
      return `${hello} We've received your ${ref}:\n\n${itemsText(facts.lines)}${facts.preferredDate ? `\nPreferred date: ${facts.preferredDate}` : ""}\n\nWe're checking it now and will confirm the total before you pay.${receipt}`
  }
}

export function whatsAppDraftUrl(
  phoneE164: string | null | undefined,
  text: string,
) {
  const digits = phoneE164?.replace(/\D/g, "") ?? ""
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export const stageLabels: Record<string, string> = {
  received: "New",
  needs_information: "Waiting for customer",
  quoted: "Quote sent",
  confirmed: "Confirmed",
  ready: "Ready",
  completed: "Completed",
  declined: "Declined",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
}

export const alertLabels: Record<string, string> = {
  PENDING: "Alert queued",
  SENT: "WhatsApp alert sent",
  FAILED: "WhatsApp alert failed",
  SKIPPED: "No WhatsApp alert",
}

/** Naira-style amount entry → minor units; null when invalid. */
export function parseMoneyInput(value: string) {
  const trimmed = value.replace(/[,\s₦]/g, "")
  if (!trimmed) return null
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(trimmed)) return null
  const [whole = "0", fraction = ""] = trimmed.split(".")
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
}
