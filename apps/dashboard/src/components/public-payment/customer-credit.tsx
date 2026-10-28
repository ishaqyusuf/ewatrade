"use client"

import { cn } from "@/utils"
import { Spinner } from "@ewatrade/ui"
import type { ReactNode } from "react"
import { money } from "./payment-format"
import {
  DetailList,
  cardClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./payment-parts"
import type { CustomerCreditState } from "./use-customer-credit"

function Note({
  tone,
  title,
  children,
  actions,
}: {
  tone: "ok" | "info" | "warn"
  title?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section
      className={cn(
        cardClass,
        "flex flex-col gap-1 border-l-4 px-3.5 py-3 text-sm leading-relaxed",
        tone === "ok"
          ? "border-l-success-border"
          : tone === "warn"
            ? "border-l-warning"
            : "border-l-info-border",
      )}
      aria-live="polite"
    >
      {title ? <b>{title}</b> : null}
      <span className="text-muted-foreground">{children}</span>
      {actions ? (
        <div className="mt-2 flex flex-col gap-2">{actions}</div>
      ) : null}
    </section>
  )
}

/**
 * Held customer credit on the payment page. An amount appears only after the server verified
 * this order's customer; using it is a separate explicit review, and what was applied comes
 * from the server's answer.
 */
export function CustomerCredit({
  credit,
  businessName,
  currencyCode,
  appliedMinor,
  transferMinor,
}: {
  credit: CustomerCreditState
  businessName: string
  currencyCode: string
  /** Credit the server says is already applied to the shown payment attempt. */
  appliedMinor: number
  /** What the server says is left to transfer for that attempt. */
  transferMinor: number
}) {
  const { offer, command, sending, unknownError, fundsQuery } = credit

  // Cached money and earlier consent never bypass a fresh successful customer proof.
  if (!credit.proofVerified) {
    if (offer.kind === "verify")
      return (
        <Note
          tone="info"
          actions={
            <a className={secondaryButtonClass} href={offer.url}>
              Sign in to use credit
            </a>
          }
        >
          Have credit with {businessName}? Sign in as this order's customer to
          see it.
        </Note>
      )
    if (fundsQuery.isError)
      return (
        <Note
          tone="info"
          actions={
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => void fundsQuery.refetch()}
            >
              Try again
            </button>
          }
        >
          Couldn't check customer credit.
        </Note>
      )
    if (credit.needsRecovery)
      return (
        <Note tone="warn" title="Credit use needs checking">
          Sign in as this order's customer and check again before making a
          transfer.
        </Note>
      )
    return null
  }
  if (credit.needsRecovery && command) {
    if (sending)
      return (
        <Note tone="info" title="Using your credit…">
          Asking {businessName} to check your credit request for this order.
        </Note>
      )
    return (
      <Note
        tone="warn"
        title="We couldn't confirm your credit use"
        actions={
          <>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={sending || !credit.proofVerified}
              onClick={credit.retry}
            >
              Check again
            </button>
            {offer.kind === "verify" ? (
              <a className={secondaryButtonClass} href={offer.url}>
                Sign in again
              </a>
            ) : null}
          </>
        }
      >
        An earlier credit request is still unconfirmed. Don't transfer for this
        payment until it is checked. Checking again reuses the same request.
        {unknownError ? (
          <span role="alert" className="mt-1 block text-destructive">
            {unknownError}
          </span>
        ) : null}
      </Note>
    )
  }

  if (credit.applied) {
    const applied = credit.applied.minor
    return (
      <Note tone="ok" title={`${money(applied, currencyCode)} credit applied`}>
        Paid from money {businessName} already holds for you. No bank transfer
        was recorded.
      </Note>
    )
  }

  return (
    <>
      {appliedMinor > 0 ? (
        <Note
          tone="ok"
          title={`${money(appliedMinor, currencyCode)} credit applied`}
        >
          {transferMinor > 0
            ? `Left to transfer for this payment: ${money(transferMinor, currencyCode)}.`
            : "Nothing is left to transfer for this payment."}
        </Note>
      ) : null}
      <CreditOfferNote
        credit={credit}
        businessName={businessName}
        currencyCode={currencyCode}
      />
    </>
  )
}

/** Sign-in, the available amount and its explicit review, or nothing. */
function CreditOfferNote({
  credit,
  businessName,
  currencyCode,
}: {
  credit: CustomerCreditState
  businessName: string
  currencyCode: string
}) {
  const { offer, phase, sending, fundsQuery } = credit
  if (phase.kind === "stale")
    return (
      <Note
        tone="warn"
        title="Your credit changed"
        actions={
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={credit.reset}
          >
            Review current credit
          </button>
        }
      >
        The balance changed while you were reviewing. Nothing was applied.
      </Note>
    )

  if (phase.kind === "review") {
    const leftMinor = phase.availableMinor - phase.amountMinor
    return (
      <section
        className={`${cardClass} flex flex-col gap-3 p-4`}
        aria-label="Use your credit"
      >
        <h2 className="text-[19px] font-extrabold leading-snug">
          Use your credit on this order?
        </h2>
        <DetailList
          rows={[
            {
              label: "Available credit",
              value: (
                <span className="tabular-nums">
                  {money(phase.availableMinor, currencyCode)}
                </span>
              ),
            },
            {
              label: "Use on this order",
              value: (
                <b className="tabular-nums">
                  {money(phase.amountMinor, currencyCode)}
                </b>
              ),
            },
            {
              label: "Credit left",
              value: (
                <span className="tabular-nums">
                  {money(leftMinor, currencyCode)}
                </span>
              ),
            },
          ]}
        />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          This uses money {businessName} already holds for you. No new bank
          transfer is recorded.
        </p>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={sending}
          onClick={credit.confirm}
        >
          {sending ? <Spinner className="size-5" /> : null}
          {sending
            ? "Using credit…"
            : `Use ${money(phase.amountMinor, currencyCode)} credit`}
        </button>
        <button
          type="button"
          className={cn(
            secondaryButtonClass,
            "border-transparent bg-transparent",
          )}
          disabled={sending}
          onClick={credit.cancel}
        >
          Back
        </button>
      </section>
    )
  }

  if (offer.kind === "verify")
    return (
      <Note
        tone="info"
        actions={
          <a className={secondaryButtonClass} href={offer.url}>
            Sign in to use credit
          </a>
        }
      >
        Have credit with {businessName}? Sign in as this order's customer to see
        it. This link alone doesn't show your balance.
      </Note>
    )
  if (offer.kind === "unavailable")
    return (
      <Note tone="info">
        Your credit with {businessName} can't be shown right now.
      </Note>
    )
  if (offer.kind === "available")
    return (
      <Note
        tone="info"
        actions={
          offer.applyMinor > 0 ? (
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={credit.review}
            >
              Use credit on this order
            </button>
          ) : null
        }
      >
        You have{" "}
        <b className="text-foreground tabular-nums">
          {money(offer.availableMinor, currencyCode)}
        </b>{" "}
        credit with {businessName}.
        {offer.applyMinor > 0 ? "" : " It can't be used on this payment."}
      </Note>
    )
  // A failed read is not a zero balance: say so quietly and let the customer retry.
  if (fundsQuery.isError && !fundsQuery.data)
    return (
      <p className="text-center text-[13px] text-muted-foreground">
        Couldn't check for credit.{" "}
        <button
          type="button"
          className="font-semibold text-foreground underline underline-offset-2"
          onClick={() => void fundsQuery.refetch()}
        >
          Try again
        </button>
      </p>
    )
  return null
}
