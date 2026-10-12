"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import { ControlField, SelectControl } from "@ewatrade/ui"
import {
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_METHOD_LABELS,
  type OrderPaymentMethod,
} from "@ewatrade/utils/finance-payment-methods"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

/** Shared identity-only lookup. Sales staff never need Finance management access. */
export function useOrderPaymentAccounts(enabled = true) {
  return useQuery(
    useTRPC().orders.paymentAccounts.queryOptions(undefined, {
      enabled,
      retry: false,
    }),
  )
}

/**
 * Where a payment lands (or a refund leaves from). Only accounts that take
 * the chosen method are offered; payments skip paused accounts. A single
 * match is preselected, and changing the method drops a choice that no
 * longer fits.
 */
export function useOrderPaymentAccountChoice({
  method,
  refund = false,
  suggestedAccountId,
  enabled = true,
}: {
  method: OrderPaymentMethod
  refund?: boolean
  /** A refund's original account, or the one a draft already names. */
  suggestedAccountId?: string | null
  /** Skip the lookup where no money moves. */
  enabled?: boolean
}) {
  const query = useOrderPaymentAccounts(enabled)
  const [chosen, setChosen] = useState("")
  const book = query.data?.book ?? null
  const eligible = (query.data?.accounts ?? []).filter(
    (account) =>
      account.paymentMethods.includes(method) && (refund || !account.paused),
  )
  const fits = (id: string | null | undefined) =>
    Boolean(id) && eligible.some((account) => account.id === id)
  const [only] = eligible
  const moneyAccountId = fits(chosen)
    ? chosen
    : fits(suggestedAccountId)
      ? (suggestedAccountId ?? "")
      : eligible.length === 1 && only
        ? only.id
        : ""
  const label = ORDER_PAYMENT_METHOD_LABELS[method]
  const problem = query.isPending
    ? "Loading payment accounts…"
    : query.isError
      ? "Payment accounts could not load. Try again."
      : !book
        ? null
        : !eligible.length
          ? `No available account takes ${label} payments. An owner or admin can turn one on in Finance → Money accounts.`
          : !moneyAccountId
            ? refund
              ? "Choose the account the refund was paid from."
              : "Choose the account that received the payment."
            : null
  return {
    book,
    eligible,
    isError: query.isError,
    moneyAccountId,
    setMoneyAccountId: setChosen,
    problem,
    /** Send this; undefined when the business has no Finance book yet. */
    payloadAccountId: book ? moneyAccountId || undefined : undefined,
  }
}

/**
 * How the order was paid, when every payment agrees: refunds suggest the
 * same method and account. Customer credit is not money in an account.
 */
export function originalReceipt(
  payments: ReadonlyArray<{
    method: string
    moneyAccountId?: string | null
    type: string
  }>,
) {
  const received = payments.filter(
    (payment) =>
      payment.type === "PAYMENT" && payment.method !== "CUSTOMER_CREDIT",
  )
  const one = <T,>(values: T[]) =>
    new Set(values).size === 1 ? (values[0] ?? null) : null
  const method = one(received.map((payment) => payment.method.toLowerCase()))
  return {
    method: (ORDER_PAYMENT_METHODS as readonly string[]).includes(method ?? "")
      ? (method as OrderPaymentMethod)
      : null,
    moneyAccountId: one(
      received.map((payment) => payment.moneyAccountId ?? null),
    ),
  }
}

export type OrderPaymentAccountChoice = ReturnType<
  typeof useOrderPaymentAccountChoice
>

export function OrderPaymentAccount({
  choice,
  disabled,
  label = "Received into",
}: {
  choice: OrderPaymentAccountChoice
  disabled?: boolean
  label?: string
}) {
  if (choice.isError)
    return (
      <FormFeedback appearance="dashboard">
        Payment accounts could not load. Try again.
      </FormFeedback>
    )
  if (!choice.book) return null
  if (!choice.eligible.length)
    return <FormFeedback appearance="dashboard">{choice.problem}</FormFeedback>
  return (
    <ControlField label={label}>
      <SelectControl
        aria-label={label}
        value={choice.moneyAccountId}
        onValueChange={choice.setMoneyAccountId}
        disabled={disabled}
        placeholder="Choose cash or a bank account"
        options={choice.eligible.map((account) => ({
          value: account.id,
          label: account.name,
        }))}
      />
    </ControlField>
  )
}
