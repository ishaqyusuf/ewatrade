"use client"
import {
  daysOut,
  daysOutLabel,
  returnableCount,
  useReturnableBalances,
} from "@/components/returnables/use-returnables"
import { describeCustomerBalance } from "@/components/tables/customers/columns"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { parseAsString, useQueryStates } from "nuqs"
import { SheetFrame } from "./sheet-frame"

type Summary = {
  id: string
  name: string
  email: string | null
  phone: string | null
  canSeeBalance: boolean
  currencyCode: string | null
  balance: {
    owedMinor: string
    paidAheadMinor: string
    netMinor: string
  } | null
}

/** wa.me wants digits with the country code; Nigerian 0-numbers get 234. */
export function whatsAppHref(phone: string) {
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 7) return null
  const international =
    digits.startsWith("0") && digits.length === 11
      ? `234${digits.slice(1)}`
      : digits
  return `https://wa.me/${international}`
}

export function customerStatementPath(customerId: string, action?: string) {
  const base = `/customers/${encodeURIComponent(customerId)}/statement`
  return action ? `${base}?ledgerAction=${action}` : base
}

/**
 * The customer's details (`customerDetail=<id>`, any page): how to reach
 * them, what they owe (owners and admins) and what they still hold, with the
 * next step one tap away.
 */
export function CustomerDetailsSheet() {
  const [{ customerDetail }, setParams] = useQueryStates(
    { customerDetail: parseAsString },
    { history: "push" },
  )
  const trpc = useTRPC()
  const query = useQuery(
    trpc.customers.summary.queryOptions(
      { customerId: customerDetail ?? "" },
      { enabled: Boolean(customerDetail), retry: false, staleTime: 0 },
    ),
  )
  const close = () => void setParams({ customerDetail: null })
  return (
    <Sheet
      open={Boolean(customerDetail)}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      {customerDetail ? (
        <SheetFrame
          title={query.data?.name ?? "Customer"}
          footer={query.data ? <CustomerActions customer={query.data} /> : null}
        >
          {query.isPending ? (
            <output>Loading…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>{query.error.message}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <CustomerDetailsBody customer={query.data} />
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}

function CustomerDetailsBody({ customer }: { customer: Summary }) {
  const wa = customer.phone ? whatsAppHref(customer.phone) : null
  return (
    <div className="grid gap-6">
      <dl className="grid gap-4">
        <div className="grid gap-1">
          <dt className="text-sm text-muted-foreground">Phone</dt>
          <dd className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="break-words text-base">
              {customer.phone || "Not saved"}
            </span>
            {customer.phone ? (
              <span className="flex gap-2">
                <Button
                  variant="outline"
                  render={
                    // biome-ignore lint/a11y/useAnchorContent: the button renders its label into this anchor.
                    <a href={`tel:${customer.phone}`} />
                  }
                >
                  Call
                </Button>
                {wa ? (
                  <Button
                    variant="outline"
                    render={
                      // biome-ignore lint/a11y/useAnchorContent: the button renders its label into this anchor.
                      <a href={wa} target="_blank" rel="noreferrer" />
                    }
                  >
                    WhatsApp
                  </Button>
                ) : null}
              </span>
            ) : null}
          </dd>
        </div>
        {customer.email ? (
          <div className="grid gap-1">
            <dt className="text-sm text-muted-foreground">Email</dt>
            <dd className="break-words text-base">{customer.email}</dd>
          </div>
        ) : null}
        {customer.canSeeBalance ? (
          <div className="grid gap-1">
            <dt className="text-sm text-muted-foreground">Balance</dt>
            <dd>
              <BalanceLine customer={customer} />
            </dd>
          </div>
        ) : null}
      </dl>
      <ReturnablesLine customerId={customer.id} />
    </div>
  )
}

function BalanceLine({ customer }: { customer: Summary }) {
  if (!customer.balance || !customer.currencyCode)
    return <p className="text-base text-muted-foreground">No statement yet</p>
  const view = describeCustomerBalance(customer.balance)
  if (view.kind === "settled")
    return <p className="text-base text-muted-foreground">Paid up</p>
  return (
    <p className="text-2xl font-semibold tabular-nums">
      {formatFinanceMoney(view.amountMinor, customer.currencyCode)}
      <span className="ml-2 text-base font-normal text-muted-foreground">
        {view.kind === "owes" ? "owes you" : "paid ahead"}
      </span>
    </p>
  )
}

/** Crates, hangers and other returnables this customer still holds. */
function ReturnablesLine({ customerId }: { customerId: string }) {
  const query = useReturnableBalances({ customerId })
  const rows = query.data ?? []
  if (!rows.length) return null
  return (
    <section aria-label="Returnables" className="grid gap-2">
      <h3 className="text-sm text-muted-foreground">Still has</h3>
      <ul className="grid gap-1">
        {rows.map((row) => (
          <li key={row.catalogItemId} className="text-base">
            <span className="font-medium tabular-nums">
              {returnableCount(row.out, row.itemName)}
            </span>
            <span className="text-muted-foreground">
              {` · ${daysOutLabel(daysOut(row.oldestOutAt)).toLowerCase()}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Links carry no `customerDetail`, so leaving for them closes the sheet. */
function CustomerActions({ customer }: { customer: Summary }) {
  const view = customer.balance
    ? describeCustomerBalance(customer.balance)
    : null
  const owes = view?.kind === "owes"
  const go = (href: string) => <Link href={href} prefetch={false} />
  return (
    <div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:justify-end">
      {customer.canSeeBalance && owes ? (
        <Button render={go(customerStatementPath(customer.id, "receipt"))}>
          Record payment
        </Button>
      ) : null}
      {customer.canSeeBalance && owes && customer.phone ? (
        <Button
          variant="outline"
          render={go(customerStatementPath(customer.id, "remind"))}
        >
          Send reminder
        </Button>
      ) : null}
      {customer.canSeeBalance ? (
        <Button
          variant={owes ? "outline" : "default"}
          render={go(customerStatementPath(customer.id))}
        >
          Statement
        </Button>
      ) : null}
      <Button
        variant="outline"
        render={go(
          `/customers?customerSheet=edit&customerId=${encodeURIComponent(customer.id)}`,
        )}
      >
        Edit
      </Button>
    </div>
  )
}
