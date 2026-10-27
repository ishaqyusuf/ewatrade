"use client"
import {
  type GeneralAction,
  type GeneralReceipt,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"
import {
  Copy01Icon,
  Link01Icon,
  Share01Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

export type PaymentLinksAction = Extract<
  GeneralAction,
  { action: "payment_links_create" }
>
type PaymentLinksReceipt = Extract<GeneralReceipt, { kind: "payment_links" }>
type PaymentLink = PaymentLinksReceipt["links"][number]

/** Lifetimes offered in the editor; the server accepts 10 minutes to 72 hours. */
export const PAYMENT_LINK_LIFETIMES = [60, 1440, 2880, 4320]

export function paymentLinkLifetimeLabel(minutes: number) {
  if (minutes % 60) return `${minutes} minutes`
  const hours = minutes / 60
  return `${hours} hour${hours === 1 ? "" : "s"}`
}

/** "ORD-125 · NGN 150.00 due" server review lines, as order rows. */
export function paymentLinksReviewParts(review: string[] | undefined) {
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

export function PaymentLinkOrderRows({
  orders,
  fallbackCount,
}: {
  orders: { orderNumber: string; due: string }[]
  fallbackCount: number
}) {
  if (!orders.length)
    return (
      <p className="text-sm">
        {fallbackCount} unpaid order{fallbackCount === 1 ? "" : "s"}
      </p>
    )
  return (
    <ul className="divide-y rounded-md border text-sm">
      {orders.map((order) => (
        <li
          key={order.orderNumber}
          className="flex items-baseline justify-between gap-4 px-3 py-2"
        >
          <span className="min-w-0 font-medium">{order.orderNumber}</span>
          <span className="text-right text-muted-foreground tabular-nums">
            {order.due} due
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The payment links draft in its card: the orders, then the server's review. */
export function GeneralPaymentLinksReview({
  payload,
  review,
}: {
  payload: PaymentLinksAction
  review?: string[]
}) {
  const { orders, rest } = paymentLinksReviewParts(review)
  const count = payload.orderIds.length
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PaymentLinkOrderRows orders={orders} fallbackCount={count} />
      <ul className="space-y-1 text-sm text-muted-foreground">
        {rest.map((line) => (
          <li key={line}>
            {line.startsWith("Links expire ")
              ? `Link works for ${paymentLinkLifetimeLabel(payload.lifetimeMinutes)} after it is created.`
              : line}
          </li>
        ))}
      </ul>
      {count > 1 ? (
        <p className="text-xs text-muted-foreground">
          All {count} links are created together. If any order changes before
          you confirm, nothing is created and you review again.
        </p>
      ) : null}
    </div>
  )
}

/** Confirm label for the card: "Create link" or "Create 3 links". */
export function paymentLinksConfirmLabel(payload: PaymentLinksAction) {
  const count = payload.orderIds.length
  return count === 1 ? "Create link" : `Create ${count} links`
}

function linkMessage(link: PaymentLink, businessName?: string) {
  return (
    link.copyText ??
    `Hello, here is your payment link for order ${link.orderNumber}${businessName ? ` from ${businessName}` : ""}: ${link.url}`
  )
}

function PaymentLinkRow({
  link,
  businessName,
}: {
  link: PaymentLink
  businessName?: string
}) {
  const [status, setStatus] = useState("")
  const message = linkMessage(link, businessName)
  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus(done)
    } catch {
      setStatus("Couldn't copy. Select the link to copy it.")
    }
  }
  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `Payment link · ${link.orderNumber}`,
          text: message,
        })
        return
      } catch (error) {
        // Closing the share sheet is not a failure.
        if (error instanceof DOMException && error.name === "AbortError") return
      }
    }
    await copy(message, "Sharing isn't available here. Message copied.")
  }
  return (
    <li className="grid gap-2 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium">
          {link.orderNumber}
          {link.customerName ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {link.customerName}
            </span>
          ) : null}
        </span>
        <span className="tabular-nums">
          {generalMoney(link.amountMinor, link.currencyCode)}
        </span>
      </div>
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <HugeiconsIcon icon={Link01Icon} className="size-3 shrink-0" />
        <span className="truncate">{link.url}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Expires{" "}
        {new Date(link.expiresAt).toLocaleString([], {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void copy(link.url, "Link copied.")}
        >
          <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
          Copy link
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void copy(message, "Message copied.")}
        >
          <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
          Copy message
        </Button>
        <Button size="sm" variant="outline" onClick={() => void share()}>
          <HugeiconsIcon icon={Share01Icon} className="size-3.5" />
          Share
        </Button>
        {link.whatsappUrl ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (link.whatsappUrl)
                window.open(link.whatsappUrl, "_blank", "noopener,noreferrer")
            }}
          >
            <HugeiconsIcon icon={WhatsappIcon} className="size-3.5" />
            WhatsApp
          </Button>
        ) : null}
      </div>
      <output aria-live="polite" className="text-xs text-muted-foreground">
        {status}
      </output>
    </li>
  )
}

/** A created payment links receipt: one row per link with copy and share. */
export function GeneralPaymentLinksReceipt({
  receipt,
  businessName,
  heading = true,
}: {
  receipt: PaymentLinksReceipt
  businessName?: string
  /** Off where the page already shows the receipt title. */
  heading?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {heading ? <p className="text-sm font-medium">{receipt.title}</p> : null}
      <ul className="divide-y rounded-md border">
        {receipt.links.map((link) => (
          <PaymentLinkRow
            key={link.orderId}
            link={link}
            businessName={businessName}
          />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Nothing was sent and no payment was recorded.
      </p>
    </div>
  )
}
