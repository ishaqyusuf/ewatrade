"use client"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  type GeneralProposal,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  SelectControl,
  Switch,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useId, useState } from "react"
import {
  PAYMENT_LINK_LIFETIMES,
  PaymentLinkOrderRows,
  type PaymentLinksAction,
  paymentLinkLifetimeLabel,
  paymentLinksReviewParts,
} from "./general-payment-links"

/**
 * Edits the receiving account, amount rule and lifetime. The orders stay
 * fixed; saving makes a new revision that must be confirmed again.
 */
export function GeneralPaymentLinksEditor({
  proposal,
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  proposal: GeneralProposal
  initial: PaymentLinksAction
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const fieldId = useId()
  const trpc = useTRPC()
  // Masked receiving accounts any order operator may choose from.
  const candidates = useQuery({
    ...trpc.businessBanking.linkCandidates.queryOptions({ period: "today" }),
    retry: false,
  })
  const accounts = candidates.data?.accounts ?? []
  const [bankAccountId, setBankAccountId] = useState(initial.bankAccountId)
  const [allowPartial, setAllowPartial] = useState(initial.allowPartial)
  const [lifetimeMinutes, setLifetimeMinutes] = useState(
    initial.lifetimeMinutes,
  )
  const [error, setError] = useState("")
  const { orders } = paymentLinksReviewParts(proposal.review)
  const known = accounts.some((account) => account.id === bankAccountId)
  const lifetimes = PAYMENT_LINK_LIFETIMES.includes(initial.lifetimeMinutes)
    ? PAYMENT_LINK_LIFETIMES
    : [...PAYMENT_LINK_LIFETIMES, initial.lifetimeMinutes].sort((a, b) => a - b)
  function save() {
    if (disabled) return
    if (candidates.isSuccess && !known) {
      setError("Choose an account with bank details.")
      return
    }
    const parsed = generalActionSchema.safeParse({
      ...initial,
      bankAccountId,
      allowPartial,
      lifetimeMinutes,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.")
      return
    }
    setError("")
    onSave(parsed.data)
  }
  return (
    <form
      className="flex min-h-0 flex-col gap-5 overflow-y-auto"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <FieldGroup>
        <div className="grid gap-2 text-sm">
          <span className="font-medium">
            {initial.orderIds.length === 1 ? "Order" : "Orders"}
          </span>
          <PaymentLinkOrderRows
            orders={orders}
            fallbackCount={initial.orderIds.length}
          />
          <p className="text-xs text-muted-foreground">
            Ask in chat to choose other orders.
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-account`}>Pays into</FieldLabel>
          {candidates.isError ? (
            <p className="text-sm text-muted-foreground">
              Accounts couldn't load. The chosen account stays as it is.
            </p>
          ) : (
            <SelectControl
              id={`${fieldId}-account`}
              placeholder={
                candidates.isPending ? "Loading accounts…" : "Choose an account"
              }
              options={accounts.map((account) => ({
                value: account.id,
                label: `${account.name} · ${account.bankName ?? "Bank"} ••${account.accountSuffix}`,
              }))}
              // Always controlled: "" shows the placeholder while accounts load
              // (undefined would let the Select pick the first account itself).
              // The saved account stays in state and is kept if saved meanwhile.
              value={known ? bankAccountId : ""}
              disabled={disabled || candidates.isPending}
              onValueChange={(value) => {
                setBankAccountId(value)
                setError("")
              }}
            />
          )}
          {candidates.isSuccess && !accounts.length ? (
            <p className="text-sm text-muted-foreground">
              No account has bank details yet. An Owner or Admin can add them in
              Money accounts.
            </p>
          ) : null}
        </Field>
        <Field orientation="horizontal">
          <FieldLabel htmlFor={`${fieldId}-partial`}>
            Customer can change the amount
          </FieldLabel>
          <Switch
            id={`${fieldId}-partial`}
            checked={allowPartial}
            disabled={disabled}
            onCheckedChange={(checked) => setAllowPartial(checked)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-lifetime`}>
            Link works for
          </FieldLabel>
          <SelectControl
            id={`${fieldId}-lifetime`}
            options={lifetimes.map((minutes) => ({
              value: String(minutes),
              label: paymentLinkLifetimeLabel(minutes),
            }))}
            value={String(lifetimeMinutes)}
            disabled={disabled}
            onValueChange={(value) => setLifetimeMinutes(Number(value))}
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          This only creates links to copy or share. Nothing is sent and no
          payment is recorded. Saving updates the review; confirm it again.
        </p>
      </FieldGroup>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={disabled}>
          Save draft
        </Button>
      </div>
    </form>
  )
}
