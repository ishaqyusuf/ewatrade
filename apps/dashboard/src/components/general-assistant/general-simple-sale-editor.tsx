"use client"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  type SimpleSale,
  similarSaleNames,
  simpleSaleAction,
} from "@ewatrade/assistant/general/contracts"
import { Button, Input } from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import { useQuery } from "@tanstack/react-query"
import { useDeferredValue, useId, useState } from "react"

export function GeneralSimpleSaleEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: SimpleSale
  disabled: boolean
  onSave: (sale: GeneralAction) => void
  onCancel: () => void
}) {
  const fieldId = useId()
  const [sale, setSale] = useState(initial)
  const [received, setReceived] = useState(
    initial.receivedMinor === undefined
      ? ""
      : minorToMajorInput(initial.receivedMinor),
  )
  const [total, setTotal] = useState(
    initial.totalMinor === undefined
      ? ""
      : minorToMajorInput(initial.totalMinor),
  )
  const [error, setError] = useState("")
  const trpc = useTRPC()
  const query = useDeferredValue(sale.customerName)
  const options = useQuery(
    trpc.assistant.saleOptions.queryOptions({ customerName: query }),
  )
  const patch = (changes: Partial<SimpleSale>) =>
    setSale((current) => ({ ...current, ...changes }))
  function save() {
    const paid = majorToMinor(received)
    const full = majorToMinor(total)
    if ((received.trim() && paid === null) || (total.trim() && full === null)) {
      setError("Enter a valid amount.")
      return
    }
    const parsed = simpleSaleAction.safeParse({
      ...sale,
      receivedMinor: paid ?? undefined,
      totalMinor: full ?? undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the sale details.")
      return
    }
    onSave(parsed.data)
  }
  const accounts = sale.accountName
    ? similarSaleNames(sale.accountName, options.data?.accounts ?? [])
    : (options.data?.accounts ?? [])
  return (
    <div className="grid gap-4">
      <label htmlFor={`${fieldId}-account`} className="grid gap-2 text-sm">
        Receiving account
        <Input
          id={`${fieldId}-account`}
          value={sale.accountName ?? ""}
          disabled={disabled}
          maxLength={160}
          placeholder="e.g. Ishaq PalmPay"
          onChange={(event) =>
            patch({
              accountName: event.target.value || undefined,
              moneyAccountId: undefined,
              createAccount: false,
            })
          }
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {accounts.map((account) => (
          <Button
            key={account.id}
            variant="outline"
            disabled={disabled}
            onClick={() =>
              patch({
                moneyAccountId: account.id,
                accountName: account.name,
                createAccount: false,
                method: account.purpose === "CASH" ? "cash" : "bank_transfer",
              })
            }
          >
            {account.name}
          </Button>
        ))}
        {sale.accountName && !sale.moneyAccountId ? (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => patch({ createAccount: true })}
          >
            Create {sale.accountName}
          </Button>
        ) : null}
      </div>
      <label htmlFor={`${fieldId}-customer`} className="grid gap-2 text-sm">
        Customer
        <Input
          id={`${fieldId}-customer`}
          value={sale.customerName ?? ""}
          disabled={disabled}
          maxLength={160}
          placeholder="Name or choose Walk-in"
          onChange={(event) =>
            patch({
              customerName: event.target.value || undefined,
              customerId: undefined,
              customerChoice: undefined,
            })
          }
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {options.data?.customers.map((customer) => (
          <Button
            key={customer.id}
            variant="outline"
            disabled={disabled}
            onClick={() =>
              patch({
                customerId: customer.id,
                customerName: customer.name,
                customerChoice: undefined,
              })
            }
          >
            {customer.name}
          </Button>
        ))}
        {sale.customerName && !sale.customerId ? (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => patch({ customerChoice: "new" })}
          >
            New customer
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() =>
            patch({
              customerChoice: "walk_in",
              customerId: undefined,
              customerName: undefined,
            })
          }
        >
          Walk-in
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {sale.customerChoice === "walk_in"
          ? "Walk-in selected"
          : sale.customerChoice === "new"
            ? "New customer selected"
            : sale.customerId
              ? "Saved customer selected"
              : "Choose a customer or Walk-in"}
        {sale.createAccount ? ` · New account: ${sale.accountName}` : ""}
      </p>
      <label htmlFor={`${fieldId}-received`} className="grid gap-2 text-sm">
        Amount received
        <Input
          id={`${fieldId}-received`}
          inputMode="decimal"
          value={received}
          disabled={disabled}
          onChange={(event) => setReceived(event.target.value)}
        />
      </label>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => patch({ partial: !sale.partial })}
      >
        {sale.partial ? "Part paid" : "Fully paid"}
      </Button>
      <label htmlFor={`${fieldId}-total`} className="grid gap-2 text-sm">
        Full sale total{sale.partial ? "" : " (optional for a fully paid sale)"}
        <Input
          id={`${fieldId}-total`}
          inputMode="decimal"
          value={total}
          disabled={disabled}
          onChange={(event) => setTotal(event.target.value)}
        />
      </label>
      <label htmlFor={`${fieldId}-description`} className="grid gap-2 text-sm">
        Description (optional)
        <Input
          id={`${fieldId}-description`}
          value={sale.description ?? ""}
          disabled={disabled}
          maxLength={200}
          onChange={(event) =>
            patch({ description: event.target.value || undefined })
          }
        />
      </label>
      {sale.attachmentIds.length ? (
        <p className="text-sm text-muted-foreground">
          Image will be attached to order activity.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={disabled} onClick={save}>
          Update order card
        </Button>
        <Button variant="ghost" disabled={disabled} onClick={onCancel}>
          Close
        </Button>
      </div>
    </div>
  )
}
