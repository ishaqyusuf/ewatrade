"use client"

import { cn } from "@/utils"
import { Spinner } from "@ewatrade/ui"
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import { PAYER_NAME_MAX, cleanPayerName, payerNameProblem } from "./payer-name"
import {
  type PublicPaymentLink,
  money,
  spacedAccountNumber,
} from "./payment-format"
import { primaryButtonClass, secondaryButtonClass } from "./payment-parts"
import type { SendStep } from "./send-payment-report"

const stepLabel: Record<SendStep, string> = {
  preparing: "Sending…",
  uploading: "Uploading receipt…",
  submitting: "Sending…",
}

/**
 * The second step of "I have paid", opened in place under the payment details: the payer's name
 * (prefilled, editable) and an explicit "Yes, I've paid". Saying so never records a payment.
 */
export function ClaimReveal({
  id,
  link,
  amountMinor,
  name,
  onNameChange,
  nameLocked,
  receipt,
  step,
  error,
  onConfirm,
  onCancel,
}: {
  id: string
  link: PublicPaymentLink
  amountMinor: number
  name: string
  onNameChange: (name: string) => void
  /** Finishing a report already started: its name can't change. */
  nameLocked: boolean
  /** Only when the page above has no receipt picker of its own. */
  receipt?: ReactNode
  step: SendStep | null
  error: string | null
  onConfirm: (payerName: string) => void
  onCancel: () => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const sending = step !== null

  // Opening moves focus into the step, so it is announced with its heading.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the step opens
  useEffect(() => {
    if (nameLocked) submitRef.current?.focus()
    else nameRef.current?.focus()
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    const problem = payerNameProblem(name)
    setNameError(problem)
    if (problem) {
      nameRef.current?.focus()
      return
    }
    onConfirm(cleanPayerName(name))
  }

  return (
    <form
      id={id}
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 border-t border-border pt-3.5 first:border-t-0 first:pt-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
    >
      <h2
        id={`${id}-title`}
        className="text-[19px] font-extrabold leading-snug"
      >
        Did you send {money(amountMinor, link.currencyCode)}?
      </h2>
      <p className="-mt-2 text-sm text-muted-foreground">
        To {link.bank.name} · {spacedAccountNumber(link.bank.accountNumber)} ·{" "}
        {link.bank.accountHolder}
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className="text-sm font-semibold">
          Your name
        </label>
        <input
          ref={nameRef}
          id={`${id}-name`}
          value={name}
          maxLength={PAYER_NAME_MAX}
          required
          aria-required="true"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={`${id}-name-hint`}
          autoComplete="name"
          readOnly={nameLocked}
          disabled={sending}
          placeholder="As it appears on your transfer"
          onChange={(event) => {
            onNameChange(event.target.value)
            if (nameError) setNameError(null)
          }}
          className={
            nameError
              ? "h-12 rounded-2xl border-[1.5px] border-destructive bg-card px-3.5 text-base outline-none focus-visible:ring-3 focus-visible:ring-destructive/20"
              : "h-12 rounded-2xl border-[1.5px] border-border bg-card px-3.5 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/30 read-only:bg-muted"
          }
        />
        <span
          id={`${id}-name-hint`}
          className={
            nameError
              ? "text-[13px] text-destructive"
              : "text-[13px] text-muted-foreground"
          }
        >
          {nameError ??
            (nameLocked
              ? "The name you gave for this report."
              : cleanPayerName(name)
                ? "Change it if the transfer came from another name."
                : "As it appears on your transfer.")}
        </span>
      </div>

      {receipt}

      <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
        {link.businessName} will check their account. Saying you've paid doesn't
        mark the order as paid.
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-danger px-3.5 py-2.5 text-sm text-danger-foreground"
        >
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col gap-2 rounded-b-2xl bg-card px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          ref={submitRef}
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
          onClick={onCancel}
        >
          Not yet
        </button>
      </div>
    </form>
  )
}
