"use client"

import { secondaryButtonClass } from "./payment-parts"
import type { RefundDestinationText } from "./refund-destination"

/** Private values stay in the owning page's memory and go only to authenticated prepare. */
export function RefundFields({
  id,
  value,
  onChange,
  proof,
  disabled,
  error,
  saved,
}: {
  id: string
  value: RefundDestinationText
  onChange: (value: RefundDestinationText) => void
  proof:
    | { kind: "verified" }
    | { kind: "verify"; url: string }
    | { kind: "none" }
  disabled: boolean
  error: string | null
  saved: boolean
}) {
  return (
    <fieldset
      disabled={disabled}
      className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3.5"
    >
      <legend className="text-sm font-semibold">
        Where should a refund go?
      </legend>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        This requests a refund of the confirmed extra. The business must check
        the transfer and approve it before any money is returned.
      </p>
      {saved ? (
        <p className="text-[13px] text-muted-foreground">
          Bank details are already attached to this draft. Leave these blank to
          keep them, or enter all three fields to replace them.
        </p>
      ) : null}
      {proof.kind === "verified" ? (
        <>
          {(
            [
              ["bankName", "Bank name", "text", 100],
              ["accountNumber", "Account number", "text", 14],
              ["accountName", "Account holder's name", "text", 160],
            ] as const
          ).map(([field, label, type, maxLength]) => (
            <label
              key={field}
              className="flex flex-col gap-1 text-sm font-semibold"
              htmlFor={`${id}-${field}`}
            >
              {label}
              <input
                id={`${id}-${field}`}
                type={type}
                value={value[field]}
                maxLength={maxLength}
                autoComplete="off"
                inputMode={field === "accountNumber" ? "numeric" : "text"}
                onChange={(event) =>
                  onChange({ ...value, [field]: event.target.value })
                }
                className="h-12 rounded-2xl border-[1.5px] border-border bg-card px-3.5 text-base font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </label>
          ))}
          <p className="text-[13px] text-muted-foreground">
            Optional. If you leave these blank, the business will need your bank
            details before arranging a refund. They are never saved in this
            browser.
          </p>
        </>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">
            Sign in as this order's customer to attach bank details. You can
            send the refund preference now and give details to the business
            later.
          </p>
          {proof.kind === "verify" ? (
            <a href={proof.url} className={secondaryButtonClass}>
              Sign in to add bank details
            </a>
          ) : null}
        </>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
