"use client"

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Field,
  FieldLabel,
  Separator,
  Spinner,
  Textarea,
  buttonVariants,
} from "@ewatrade/ui"
import { CheckmarkCircle02Icon, WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useId, useRef, useState } from "react"
import { formatMoney, newClientId } from "./commerce"
import { useCommerceStudio } from "./context"

type Stage =
  | "received"
  | "needs_information"
  | "quoted"
  | "confirmed"
  | "declined"
  | "withdrawn"
  | "ready"
  | "completed"
  | "cancelled"

type Message = { id: string; author: string; body: string; at: string }
type OrderFacts = {
  orderNumber: string
  status: string
  paymentStatus: string
  totalMinor: number
  paidMinor: number
  balanceMinor: number
  currencyCode: string
  subtotalMinor?: number
  deliveryFeeMinor?: number
  paymentReport: { status: string; claimedAmountMinor: number } | null
}

/** Serializable receipt prepared by the host (never includes merchant-private data). */
export type ReceiptView = {
  token: string
  kind: "order" | "service"
  reference: string
  businessName: string
  stage: Stage
  revision: number
  createdAt: string
  customerName: string
  staffResponse: string | null
  messages: Message[]
  currencyCode: string
  lines: {
    key: string
    name: string
    option: string
    quantity: string
    unitLabel: string | null
    unitPriceMinor: number | null
  }[]
  fulfilment?: "pickup" | "delivery"
  deliveryAddress?: string | null
  observedSubtotalMinor?: number
  preferredDate?: string | null
  collectionAddress?: string | null
  details?: string | null
  quote?: {
    versionId: string
    status: string
    totalMinor: number
    feeMinor: number
    currencyCode: string
    note: string | null
    expiresAt: string | null
    lines: {
      name: string
      option: string
      quantity: string | null
      totalMinor: number
    }[]
    acceptUrl: string | null
  } | null
  /** The business's booked appointment (canonical ServiceBooking), if any. */
  appointment?: {
    status: string
    startsAt: string
    timezone: string
    endsAt?: string | null
    serviceName?: string | null
  } | null
  order: OrderFacts | null
  paymentUrl: string | null
  businessWhatsApp: string | null
  canLinkToAccount: boolean
}

const stageCopy: Record<Stage, { title: string; next: string; tone: string }> =
  {
    received: {
      title: "Request received",
      next: "The business is checking your request. They'll confirm on WhatsApp before you pay anything.",
      tone: "waiting",
    },
    needs_information: {
      title: "The business has a question",
      next: "Reply below so the business can continue with your request.",
      tone: "attention",
    },
    quoted: {
      title: "Quote ready",
      next: "Review the quote. Nothing starts until you accept it.",
      tone: "attention",
    },
    confirmed: {
      title: "Confirmed",
      next: "Your order is confirmed. Payment details appear here when the business shares them.",
      tone: "good",
    },
    ready: { title: "Ready", next: "Your order is ready.", tone: "good" },
    completed: {
      title: "Completed",
      next: "This order is complete. Thank you.",
      tone: "good",
    },
    declined: {
      title: "Not accepted",
      next: "The business couldn't take this request. See their reason below.",
      tone: "closed",
    },
    withdrawn: {
      title: "Withdrawn",
      next: "You withdrew this request.",
      tone: "closed",
    },
    cancelled: {
      title: "Cancelled",
      next: "This order was cancelled.",
      tone: "closed",
    },
  }

const appointmentCopy: Record<string, { label: string; note: string }> = {
  SCHEDULED: {
    label: "Booked",
    note: "The business booked this time for you.",
  },
  CONFIRMED: {
    label: "Booked",
    note: "The business booked this time for you.",
  },
  ARRIVED: {
    label: "In progress",
    note: "You've arrived. The business has started.",
  },
  IN_SERVICE: {
    label: "In progress",
    note: "You've arrived. The business has started.",
  },
  COMPLETED: { label: "Done", note: "This appointment is done." },
  CANCELLED: {
    label: "Cancelled",
    note: "This appointment was cancelled. The business will agree a new time with you.",
  },
  NO_SHOW: {
    label: "Missed",
    note: "This appointment was missed. Message the business to book a new time.",
  },
}

/** Live appointments are the ones a customer should still turn up for. */
function isLiveAppointment(status: string | undefined) {
  return (
    status === "SCHEDULED" ||
    status === "CONFIRMED" ||
    status === "ARRIVED" ||
    status === "IN_SERVICE"
  )
}

function appointmentWhen(appointment: NonNullable<ReceiptView["appointment"]>) {
  const zone = { timeZone: appointment.timezone }
  const day = new Date(appointment.startsAt).toLocaleDateString("en-NG", {
    ...zone,
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  const time = (value: string, withZone: boolean) =>
    new Date(value).toLocaleTimeString("en-NG", {
      ...zone,
      hour: "numeric",
      minute: "2-digit",
      ...(withZone ? { timeZoneName: "short" as const } : {}),
    })
  return appointment.endsAt
    ? `${day}, ${time(appointment.startsAt, false)} to ${time(appointment.endsAt, true)}`
    : `${day}, ${time(appointment.startsAt, true)}`
}

/** A preferred date is only ever the customer's preference, never a booking. */
export function preferredDateNote(appointmentStatus: string | undefined) {
  return isLiveAppointment(appointmentStatus)
    ? " (your preference, not the booked time)"
    : " (your preference, not booked yet)"
}

/** The business's appointment as the customer should read it. */
export function ReceiptAppointment({
  appointment,
  fallbackName,
}: {
  appointment: NonNullable<ReceiptView["appointment"]>
  fallbackName: string
}) {
  const live = isLiveAppointment(appointment.status)
  const copy = appointmentCopy[appointment.status] ?? appointmentCopy.CONFIRMED
  const when = appointmentWhen(appointment)
  return (
    <div className="cs-card-panel" data-appointment-status={appointment.status}>
      <div className="cs-panel-head">
        <h2 className="cs-subtitle">Appointment</h2>
        <Badge variant={live ? "secondary" : "outline"}>{copy?.label}</Badge>
      </div>
      <p>{appointment.serviceName || fallbackName}</p>
      <p>
        {live || appointment.status === "COMPLETED" ? (
          <strong>{when}</strong>
        ) : (
          <del className="cs-muted">{when}</del>
        )}
      </p>
      <p className="cs-muted">{copy?.note}</p>
    </div>
  )
}

const steps = ["Sent", "Confirmed", "Paid", "Done"] as const
function progress(receipt: ReceiptView) {
  if (["declined", "withdrawn", "cancelled"].includes(receipt.stage)) return -1
  if (receipt.stage === "completed") return 3
  if (receipt.order?.paymentStatus === "PAID") return 2
  if (receipt.order) return 1
  return 0
}

function paymentState(order: OrderFacts) {
  if (order.paymentStatus === "PAID") return "Paid in full"
  if (order.paymentReport?.status === "SUBMITTED")
    return "Checking your payment. The business confirms it once received."
  if (order.paymentReport?.status === "NOT_RECEIVED")
    return "The business hasn't received your payment yet. Check the payment page for details."
  if (order.paidMinor > 0)
    return `Part paid. ${formatMoney(order.balanceMinor, order.currencyCode)} left to pay.`
  return "Not paid yet"
}

export function CommerceReceipt({ receipt }: { receipt: ReceiptView }) {
  const { adapter, href, themeStyle } = useCommerceStudio()
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const base = stageCopy[receipt.stage]
  // Confirmed orders say what to do about payment from canonical Order facts.
  const copy =
    receipt.stage === "confirmed" && receipt.order
      ? receipt.order.paymentStatus === "PAID"
        ? {
            ...base,
            next: "Paid in full. The business will let you know when it's ready.",
          }
        : receipt.order.paymentReport?.status === "SUBMITTED"
          ? {
              ...base,
              next: "You told the business you've paid. They'll confirm once it arrives in their account.",
            }
          : receipt.paymentUrl
            ? {
                ...base,
                next: "Your order is confirmed. Use the payment details below.",
              }
            : base
      : base
  const step = progress(receipt)
  const [reply, setReply] = useState("")
  const [declineReason, setDeclineReason] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{
    tone: "error" | "ok"
    text: string
  } | null>(null)
  const replyId = useRef(newClientId())
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Arriving from checkout or a request form, move focus to the status heading
  // once so screen readers announce it ("Request received"). Not on re-renders.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  const ids = { reply: useId(), decline: useId() }
  const run = async (
    key: string,
    action: () => Promise<{ ok: boolean; message?: string }>,
    done: string,
  ) => {
    if (busy) return
    setBusy(key)
    setMessage(null)
    try {
      const result = await action()
      if (result.ok) {
        setMessage({ tone: "ok", text: done })
        window.location.reload()
      } else
        setMessage({
          tone: "error",
          text: result.message ?? "That didn't work. Try again.",
        })
    } catch {
      setMessage({
        tone: "error",
        text: "We couldn't reach the business. Try again.",
      })
    } finally {
      setBusy(null)
    }
  }
  const whatsappDraft = receipt.businessWhatsApp
    ? `https://wa.me/${receipt.businessWhatsApp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${receipt.businessName}, about my request ${receipt.reference}.`)}`
    : null
  const total =
    receipt.order?.totalMinor ??
    receipt.quote?.totalMinor ??
    receipt.observedSubtotalMinor ??
    null
  return (
    <section className="cs-section cs-receipt">
      <div className="cs-wrap cs-narrow">
        <p className="cs-eyebrow">
          {receipt.kind === "order" ? "Order request" : "Service request"} ·{" "}
          {receipt.reference}
        </p>
        <h1 className="cs-title cs-title--page" tabIndex={-1} ref={headingRef}>
          {copy.title}
        </h1>
        <p className="cs-lead">{copy.next}</p>
        {step >= 0 ? (
          <ol className="cs-progress" aria-label="Progress">
            {steps.map((label, index) => (
              <li
                key={label}
                data-done={index <= step || undefined}
                aria-current={index === step ? "step" : undefined}
              >
                <span className="cs-progress__dot" aria-hidden="true">
                  {index <= step ? (
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      strokeWidth={2}
                    />
                  ) : null}
                </span>
                {label}
              </li>
            ))}
          </ol>
        ) : null}
        <p className="cs-muted">
          Save this page to check progress. Keep the link private: anyone with
          it can see this request.
        </p>
        {message ? (
          <Alert
            variant={message.tone === "error" ? "destructive" : "default"}
            role={message.tone === "error" ? "alert" : "status"}
          >
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}
        {receipt.staffResponse &&
        (receipt.stage === "declined" ||
          receipt.stage === "needs_information") ? (
          <Alert className="cs-note">
            <AlertTitle>
              {receipt.stage === "declined"
                ? "Reason from the business"
                : "Question from the business"}
            </AlertTitle>
            <AlertDescription>{receipt.staffResponse}</AlertDescription>
          </Alert>
        ) : null}
        {receipt.stage === "needs_information" ? (
          <form
            className="cs-reply"
            onSubmit={(event) => {
              event.preventDefault()
              if (!reply.trim()) return
              void run(
                "reply",
                () =>
                  adapter.reply({
                    token: receipt.token,
                    kind: receipt.kind,
                    reply: {
                      clientMessageId: replyId.current,
                      expectedRevision: receipt.revision,
                      body: reply.trim(),
                    },
                  }),
                "Reply sent.",
              )
            }}
          >
            <Field>
              <FieldLabel htmlFor={ids.reply}>Your reply</FieldLabel>
              <Textarea
                id={ids.reply}
                rows={3}
                maxLength={800}
                value={reply}
                onChange={(event) => setReply(event.target.value)}
              />
            </Field>
            <Button
              type="submit"
              className="cs-primary"
              disabled={busy !== null || !reply.trim()}
            >
              {busy === "reply" ? <Spinner /> : null}
              Send reply
            </Button>
          </form>
        ) : null}

        {receipt.quote &&
        receipt.quote.status === "ISSUED" &&
        !receipt.order ? (
          <div className="cs-card-panel">
            <div className="cs-panel-head">
              <h2 className="cs-subtitle">Your quote</h2>
              {receipt.quote.expiresAt ? (
                <span className="cs-muted">
                  Valid until{" "}
                  {new Date(receipt.quote.expiresAt).toLocaleDateString(
                    "en-NG",
                    {
                      day: "numeric",
                      month: "short",
                      timeZone: "Africa/Lagos",
                    },
                  )}
                </span>
              ) : null}
            </div>
            <ul className="cs-summary-lines">
              {receipt.quote.lines.map((line) => (
                <li key={`${line.name}-${line.option}`}>
                  <span>
                    {line.name}
                    {line.option && line.option !== line.name
                      ? ` · ${line.option}`
                      : ""}
                    {line.quantity ? ` × ${line.quantity}` : ""}
                  </span>
                  <span>
                    {formatMoney(
                      line.totalMinor,
                      receipt.quote?.currencyCode ?? receipt.currencyCode,
                    )}
                  </span>
                </li>
              ))}
              {receipt.quote.feeMinor ? (
                <li>
                  <span>Collection or delivery</span>
                  <span>
                    {formatMoney(
                      receipt.quote.feeMinor,
                      receipt.quote.currencyCode,
                    )}
                  </span>
                </li>
              ) : null}
            </ul>
            <div className="cs-total-row">
              <span>Total</span>
              <strong>
                {formatMoney(
                  receipt.quote.totalMinor,
                  receipt.quote.currencyCode,
                )}
              </strong>
            </div>
            {receipt.quote.note ? (
              <p className="cs-muted">{receipt.quote.note}</p>
            ) : null}
            <div className="cs-row-actions">
              {receipt.quote.acceptUrl ? (
                <a
                  className={buttonVariants({
                    size: "lg",
                    className: "cs-primary",
                  })}
                  href={receipt.quote.acceptUrl}
                >
                  Review and accept
                </a>
              ) : (
                <p className="cs-muted">
                  Use the quote link the business sent you to accept.
                </p>
              )}
            </div>
            <form
              className="cs-reply"
              onSubmit={(event) => {
                event.preventDefault()
                void run(
                  "decline",
                  () =>
                    adapter.declineQuote({
                      token: receipt.token,
                      versionId: receipt.quote?.versionId ?? "",
                      reason: declineReason,
                      clientMessageId: newClientId(),
                    }),
                  "Quote declined. The business has been told.",
                )
              }}
            >
              <Field>
                <FieldLabel htmlFor={ids.decline}>
                  Not for you? Tell the business why (optional)
                </FieldLabel>
                <Textarea
                  id={ids.decline}
                  rows={2}
                  maxLength={500}
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                />
              </Field>
              <Button type="submit" variant="outline" disabled={busy !== null}>
                {busy === "decline" ? <Spinner /> : null}
                Decline quote
              </Button>
            </form>
          </div>
        ) : null}

        {receipt.appointment ? (
          <ReceiptAppointment
            appointment={receipt.appointment}
            fallbackName={[
              ...new Set(receipt.lines.map((line) => line.name)),
            ].join(", ")}
          />
        ) : null}

        {receipt.order ? (
          <div className="cs-card-panel">
            <div className="cs-panel-head">
              <h2 className="cs-subtitle">Order {receipt.order.orderNumber}</h2>
              <Badge variant="secondary">
                {paymentState(receipt.order).split(".")[0]}
              </Badge>
            </div>
            {receipt.order.deliveryFeeMinor ? (
              <div className="cs-total-row cs-total-row--quiet">
                <span>Delivery</span>
                <span>
                  {formatMoney(
                    receipt.order.deliveryFeeMinor,
                    receipt.order.currencyCode,
                  )}
                </span>
              </div>
            ) : null}
            <div className="cs-total-row">
              <span>Total</span>
              <strong>
                {formatMoney(
                  receipt.order.totalMinor,
                  receipt.order.currencyCode,
                )}
              </strong>
            </div>
            {receipt.order.paidMinor > 0 ? (
              <div className="cs-total-row cs-total-row--quiet">
                <span>Paid</span>
                <span>
                  {formatMoney(
                    receipt.order.paidMinor,
                    receipt.order.currencyCode,
                  )}
                </span>
              </div>
            ) : null}
            <output className="cs-muted cs-block">
              {paymentState(receipt.order)}
            </output>
            {receipt.paymentUrl && receipt.order.paymentStatus !== "PAID" ? (
              <a
                className={buttonVariants({
                  size: "lg",
                  className: "cs-primary",
                })}
                href={receipt.paymentUrl}
              >
                See payment details
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="cs-card-panel">
          <h2 className="cs-subtitle">
            {receipt.kind === "order" ? "What you asked for" : "Your request"}
          </h2>
          <ul className="cs-summary-lines">
            {receipt.lines.map((line) => (
              <li key={line.key}>
                <span>
                  {line.name}
                  {line.option ? ` · ${line.option}` : ""}
                  {` × ${line.quantity}${line.unitLabel ? ` ${line.unitLabel}` : ""}`}
                </span>
                <span>
                  {line.unitPriceMinor === null
                    ? "To quote"
                    : formatMoney(line.unitPriceMinor, receipt.currencyCode)}
                </span>
              </li>
            ))}
          </ul>
          {!receipt.order && total !== null && receipt.kind === "order" ? (
            <div className="cs-total-row">
              <span>Subtotal (before confirmation)</span>
              <strong>{formatMoney(total, receipt.currencyCode)}</strong>
            </div>
          ) : null}
          <Separator />
          <dl className="cs-facts">
            {receipt.fulfilment ? (
              <>
                <dt>Getting it</dt>
                <dd>
                  {receipt.fulfilment === "delivery"
                    ? `Delivery to ${receipt.deliveryAddress ?? "your address"}`
                    : "Pick up"}
                </dd>
              </>
            ) : null}
            {receipt.preferredDate ? (
              <>
                <dt>Preferred date</dt>
                <dd>
                  {new Date(
                    `${receipt.preferredDate}T12:00:00Z`,
                  ).toLocaleDateString("en-NG", {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                    timeZone: "Africa/Lagos",
                  })}
                  <span className="cs-muted">
                    {preferredDateNote(receipt.appointment?.status)}
                  </span>
                </dd>
              </>
            ) : null}
            {receipt.collectionAddress ? (
              <>
                <dt>Collect from</dt>
                <dd>{receipt.collectionAddress}</dd>
              </>
            ) : null}
            {receipt.details ? (
              <>
                <dt>Details</dt>
                <dd>{receipt.details}</dd>
              </>
            ) : null}
            <dt>Sent</dt>
            <dd>
              {new Date(receipt.createdAt).toLocaleString("en-NG", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "Africa/Lagos",
              })}
            </dd>
          </dl>
        </div>

        {receipt.messages.length ? (
          <div className="cs-card-panel">
            <h2 className="cs-subtitle">Messages</h2>
            <ul className="cs-messages">
              {receipt.messages.map((entry) => (
                <li key={entry.id} data-author={entry.author}>
                  <span className="cs-muted">
                    {entry.author === "business" ? receipt.businessName : "You"}
                  </span>
                  <p>{entry.body}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="cs-row-actions">
          {whatsappDraft ? (
            <a
              className={buttonVariants({ variant: "outline" })}
              href={whatsappDraft}
              target="_blank"
              rel="noreferrer"
            >
              <HugeiconsIcon icon={WhatsappIcon} strokeWidth={1.8} />
              Message the business
            </a>
          ) : null}
          {receipt.canLinkToAccount ? (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "link",
                  () => adapter.linkReceipt(receipt.token),
                  "Added to your account.",
                )
              }
            >
              Add to my account
            </Button>
          ) : null}
          {receipt.stage === "received" ||
          receipt.stage === "needs_information" ? (
            <>
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() => setConfirmWithdraw(true)}
              >
                Withdraw request
              </Button>
              <AlertDialog
                open={confirmWithdraw}
                onOpenChange={setConfirmWithdraw}
              >
                <AlertDialogContent className="cs-portal" style={themeStyle}>
                  <AlertDialogTitle className="cs-subtitle">
                    Withdraw {receipt.reference}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {receipt.businessName} will stop working on it. You can send
                    a new request later.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setConfirmWithdraw(false)
                        void run(
                          "withdraw",
                          () =>
                            adapter.withdraw({
                              token: receipt.token,
                              kind: receipt.kind,
                              expectedRevision: receipt.revision,
                            }),
                          "Request withdrawn.",
                        )
                      }}
                    >
                      Withdraw
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
          <a className={buttonVariants({ variant: "ghost" })} href={href("/")}>
            Back to {receipt.businessName}
          </a>
        </div>
      </div>
    </section>
  )
}
