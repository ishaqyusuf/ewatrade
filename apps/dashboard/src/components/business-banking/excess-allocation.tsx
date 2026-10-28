"use client"
import { cn } from "@ewatrade/ui"
import { Alert02Icon, Wallet01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  type ConfirmedAllocation,
  type ExcessPlan,
  confirmedAllocationSummary,
} from "./excess-allocation-model"

/**
 * The live line when more arrived than the Order's balance. With a current
 * customer-funds snapshot it shows the server's split; without one it says
 * plainly that the extra can't be recorded here yet.
 */
export function ExcessLine({
  plan,
  money,
  balanceMinor,
}: {
  plan: Exclude<ExcessPlan, { kind: "none" }>
  money: (value: number) => string
  balanceMinor: number
}) {
  if (plan.kind !== "excess")
    return (
      <p
        role="alert"
        className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        <HugeiconsIcon
          icon={Alert02Icon}
          className="mt-0.5 size-4 shrink-0"
          aria-hidden
        />
        <span>
          {plan.kind === "changed"
            ? "This Order changed while you were checking. Refresh before recording more than the balance."
            : `That’s more than the ${money(balanceMinor)} balance. Only an owner or admin with this customer’s balance set up in Finance can record the full receipt here. Keep the actual bank amount unchanged and ask them to review it.`}
        </span>
      </p>
    )
  return (
    <div
      aria-live="polite"
      className="grid gap-1 rounded-lg bg-sky-500/10 px-3 py-2 text-sm"
    >
      <span className="flex items-start gap-1.5">
        <HugeiconsIcon
          icon={Wallet01Icon}
          className="mt-0.5 size-4 shrink-0"
          aria-hidden
        />
        <span>
          {money(plan.applyMinor)} pays{" "}
          {plan.applyMinor > 0
            ? "the rest of this Order"
            : "nothing on this Order"}
          . {money(plan.heldMinor)} is kept as the customer’s money with you.
        </span>
      </span>
      <span className="text-xs text-muted-foreground">
        The split follows what the Order still owes. Nothing is sent back from
        here.
      </span>
    </div>
  )
}

/** The customer's preference for the extra, shown as a request only. */
export function CustomerPreferenceNote({
  words,
  className,
}: {
  words: string | null
  className?: string
}) {
  if (!words) return null
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>{words}</p>
  )
}

/** This payment's saved split. Historical amounts, not a current balance. */
export function ConfirmedAllocationFacts({
  allocation,
  money,
}: {
  allocation: ConfirmedAllocation
  money: (value: number) => string
}) {
  const { rows, extra } = confirmedAllocationSummary(allocation)
  return (
    <section className="grid gap-2 rounded-lg border border-border px-3 py-2.5 text-sm">
      <dl className="grid gap-1">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-medium tabular-nums">{money(row.minor)}</dd>
          </div>
        ))}
      </dl>
      {extra ? <p>{extra}</p> : null}
      <p className="text-xs text-muted-foreground">
        These are this payment’s amounts when it was recorded, not the
        customer’s balance now.
      </p>
    </section>
  )
}
