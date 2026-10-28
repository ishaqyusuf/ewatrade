"use client"

import { cn } from "@/utils"
import type { RefObject } from "react"
import { money } from "./payment-format"
import {
  type ExcessChoice,
  type SentAmountReview,
  excessChoiceLabel,
} from "./report-allocation"

const choices: ExcessChoice[] = ["CREDIT", "REFUND", "UNRESOLVED"]

/**
 * "Amount you sent" inside the inline "I have paid" step. What this link asks for stays in the
 * hero and payment details; this is the customer's claim, and only the business confirms what
 * actually arrived. A larger amount shows where it would go and, past the order balance, asks
 * what should happen to the extra.
 */
export function SentAmount({
  id,
  value,
  onChange,
  currencyCode,
  currencySymbol,
  businessName,
  error,
  locked,
  review,
  choice,
  onChoiceChange,
  disabled,
  inputRef,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  currencyCode: string
  currencySymbol: string
  businessName: string
  error: string | null
  /** Finishing a report already started: its amount and proposal can't change. */
  locked: boolean
  review: SentAmountReview
  choice: ExcessChoice | null
  onChoiceChange: (choice: ExcessChoice) => void
  disabled: boolean
  inputRef: RefObject<HTMLInputElement | null>
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-sent`} className="text-sm font-semibold">
          Amount you sent
        </label>
        <div
          className={cn(
            "flex h-12 items-center gap-1 rounded-2xl border-[1.5px] px-3.5 focus-within:ring-3 focus-within:ring-ring/30",
            error ? "border-destructive" : "border-border",
            locked ? "bg-muted" : "bg-card",
          )}
        >
          <span className="text-base font-bold text-muted-foreground">
            {currencySymbol}
          </span>
          <input
            ref={inputRef}
            id={`${id}-sent`}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            readOnly={locked}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-sent-hint`}
            onChange={(event) => onChange(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-base font-bold tabular-nums outline-none"
          />
        </div>
        <span
          id={`${id}-sent-hint`}
          className={cn(
            "text-[13px]",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {error ??
            (locked
              ? "The amount you gave for this report."
              : "Change it if you sent a different amount.")}
        </span>
      </div>

      {review.kind === "more" ? (
        <p className="rounded-xl bg-info px-3.5 py-2.5 text-[13px] leading-relaxed text-info-foreground">
          That's more than this link asks for. Once {businessName} confirms it,{" "}
          {money(review.applyMinor, currencyCode)} goes to this order
          {review.leftMinor > 0
            ? ` and ${money(review.leftMinor, currencyCode)} is left to pay.`
            : " and it is paid in full."}
        </p>
      ) : null}

      {review.kind === "excess" ? (
        <fieldset
          className="flex flex-col gap-2 rounded-xl border border-border px-3.5 py-3"
          disabled={disabled || locked}
        >
          <legend className="px-1 text-sm font-semibold">
            What should happen to the extra{" "}
            {money(review.extraMinor, currencyCode)}?
          </legend>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {money(review.applyMinor, currencyCode)} pays this order in full.
            This is only your preference: {businessName} first confirms what
            actually arrived.
          </p>
          {choices.map((option) => (
            <label
              key={option}
              className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border px-3 text-sm has-checked:border-primary has-checked:bg-muted"
            >
              <input
                type="radio"
                name={`${id}-extra`}
                value={option}
                checked={choice === option}
                onChange={() => onChoiceChange(option)}
                className="size-4 accent-primary"
              />
              {excessChoiceLabel[option]}
            </label>
          ))}
          {choice === "REFUND" ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Asking for a refund doesn't send one. {businessName} asks for your
              bank details after they confirm your transfer.
            </p>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  )
}
