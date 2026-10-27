"use client"

import { cn } from "@/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Spinner,
} from "@ewatrade/ui"
import { type FormEvent, useEffect, useId, useRef, useState } from "react"
import {
  type PublicPaymentLink,
  money,
  spacedAccountNumber,
} from "./payment-format"
import {
  ReceiptPicker,
  primaryButtonClass,
  secondaryButtonClass,
} from "./payment-parts"
import type { PickedReceipt } from "./receipt-file"
import type { SendStep } from "./send-payment-report"

const NAME_MAX = 160

/** Same normalisation the server applies, so the length check matches it. */
export function cleanPayerName(value: string) {
  return Array.from(value.trim())
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
}

const stepLabel: Record<SendStep, string> = {
  preparing: "Sending…",
  uploading: "Uploading receipt…",
  submitting: "Sending…",
}

export function ClaimSheet({
  open,
  onOpenChange,
  link,
  amountMinor,
  initialName,
  detailsLocked,
  receipt,
  onReceiptChange,
  step,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  link: PublicPaymentLink
  amountMinor: number
  initialName: string
  /** Finishing a report already started: its name and amount can't change. */
  detailsLocked: boolean
  receipt: PickedReceipt | null
  onReceiptChange: (receipt: PickedReceipt | null) => void
  step: SendStep | null
  error: string | null
  onConfirm: (payerName: string) => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const [name, setName] = useState(initialName)
  const [nameError, setNameError] = useState<string | null>(null)
  const sending = step !== null

  useEffect(() => {
    if (open) {
      setName(initialName)
      setNameError(null)
    }
  }, [open, initialName])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    const cleaned = cleanPayerName(name)
    const problem = !cleaned
      ? "Enter your name so they can find your transfer."
      : cleaned.length > NAME_MAX
        ? `Use up to ${NAME_MAX} characters.`
        : null
    setNameError(problem)
    if (problem) {
      nameRef.current?.focus()
      return
    }
    onConfirm(cleaned)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!sending) onOpenChange(next)
      }}
    >
      <SheetContent
        mobileLayout="bottom"
        initialFocus={detailsLocked ? false : nameRef}
        className="bg-card p-0 max-md:rounded-t-[26px] md:rounded-2xl dark:bg-card"
      >
        <form
          onSubmit={submit}
          noValidate
          className="flex h-full flex-col gap-3 overflow-y-auto px-5 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <span
            aria-hidden="true"
            className="mx-auto mt-1 h-1 w-10 shrink-0 rounded-full bg-border md:hidden"
          />
          <SheetTitle className="mt-2 text-[21px] font-extrabold leading-snug">
            Did you send {money(amountMinor, link.currencyCode)}?
          </SheetTitle>
          <SheetDescription className="-mt-1.5 text-sm text-muted-foreground">
            To {link.bank.name} · {spacedAccountNumber(link.bank.accountNumber)}{" "}
            · {link.bank.accountHolder}
          </SheetDescription>

          <div className="flex flex-col gap-1">
            <label htmlFor={nameId} className="text-sm font-semibold">
              Your name
            </label>
            <input
              ref={nameRef}
              id={nameId}
              value={name}
              maxLength={NAME_MAX}
              required
              aria-required="true"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={`${nameId}-hint`}
              autoComplete="name"
              readOnly={detailsLocked}
              disabled={sending}
              placeholder="As it appears on your transfer"
              onChange={(event) => {
                setName(event.target.value)
                if (nameError) setNameError(null)
              }}
              className={
                nameError
                  ? "h-12 rounded-2xl border-[1.5px] border-destructive bg-card px-3.5 text-base outline-none focus-visible:ring-3 focus-visible:ring-destructive/20"
                  : "h-12 rounded-2xl border-[1.5px] border-border bg-card px-3.5 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/30 read-only:bg-muted"
              }
            />
            <span
              id={`${nameId}-hint`}
              className={
                nameError
                  ? "text-[13px] text-destructive"
                  : "text-[13px] text-muted-foreground"
              }
            >
              {nameError ?? "Required. Helps them find your transfer."}
            </span>
          </div>

          {link.receiptAllowed ? (
            <ReceiptPicker
              receipt={receipt}
              onChange={onReceiptChange}
              disabled={sending}
            />
          ) : null}

          <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
            {link.businessName} will check their account. Saying you've paid
            doesn't mark the order as paid.
          </p>

          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-danger px-3.5 py-2.5 text-sm text-danger-foreground"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-auto flex flex-col gap-2 pt-1">
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={sending}
            >
              {sending ? <Spinner className="size-5" /> : null}
              {step ? stepLabel[step] : "Yes, I've paid"}
            </button>
            <button
              type="button"
              className={cn(
                secondaryButtonClass,
                "border-transparent bg-transparent",
              )}
              disabled={sending}
              onClick={() => onOpenChange(false)}
            >
              Not yet
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
