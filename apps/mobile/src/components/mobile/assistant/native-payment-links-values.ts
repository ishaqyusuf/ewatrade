import type {
  GeneralAction,
  GeneralReceipt,
} from "@ewatrade/assistant/general/contracts"

export type PaymentLinksAction = Extract<
  GeneralAction,
  { action: "payment_links_create" }
>
export type PaymentLinksReceipt = Extract<
  GeneralReceipt,
  { kind: "payment_links" }
>
export type PaymentLink = PaymentLinksReceipt["links"][number]

/** Lifetimes offered in the editor; the server accepts 10 minutes to 72 hours. */
export const PAYMENT_LINK_LIFETIMES = [60, 1440, 2880, 4320] as const

export function paymentLinkLifetimeLabel(minutes: number) {
  if (minutes % 60) return `${minutes} minutes`
  const hours = minutes / 60
  return `${hours} hour${hours === 1 ? "" : "s"}`
}

/** The offered lifetimes, plus a saved one that is not among them. */
export function paymentLinkLifetimeChoices(current: number) {
  const choices: number[] = [...PAYMENT_LINK_LIFETIMES]
  return choices.includes(current)
    ? choices
    : [...choices, current].sort((a, b) => a - b)
}

/** Server review lines "ORD-125 · NGN 150.00 due" as order rows; the rest as text. */
export function paymentLinksReviewParts(review: readonly string[] | undefined) {
  const orders: { orderNumber: string; due: string }[] = []
  const rest: string[] = []
  for (const line of review ?? []) {
    const match = /^(.+) · (.+) due$/.exec(line)
    if (match?.[1] && match[2])
      orders.push({ orderNumber: match[1], due: match[2] })
    else rest.push(line)
  }
  return { orders, rest }
}

/** The server's lifetime line in plain words; other lines unchanged. */
export function paymentLinksReviewLine(
  line: string,
  payload: PaymentLinksAction,
) {
  return line.startsWith("Links expire ")
    ? `Link works for ${paymentLinkLifetimeLabel(payload.lifetimeMinutes)} after it is created.`
    : line
}

/** The server's prepared text, or a short one when an older receipt has none. */
export function paymentLinkMessage(link: PaymentLink, businessName?: string) {
  return (
    link.copyText ??
    `Hello, here is your payment link for order ${link.orderNumber}${businessName ? ` from ${businessName}` : ""}: ${link.url}`
  )
}
