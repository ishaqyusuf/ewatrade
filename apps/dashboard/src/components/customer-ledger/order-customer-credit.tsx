"use client"
import { errorCode } from "@/components/business-banking/business-banking-model"
import { useTRPC } from "@/trpc/client"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { Wallet01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  type OrderCreditView,
  orderCreditIdentity,
  orderCreditView,
} from "./order-customer-credit-model"

type CreditOrder = Parameters<typeof orderCreditIdentity>[0]

/**
 * The customer's unused credit, shown on an Order before a payment link is
 * made (Workshop v18). Owner/Admin only; read straight from the server, with
 * holds already taken out. It's information: nothing here uses the credit.
 */
export function OrderCustomerCredit({ order }: { order: CreditOrder }) {
  const trpc = useTRPC()
  const context = useQuery(
    trpc.tenant.current.queryOptions(undefined, { retry: false }),
  )
  const role = normalizeRole(context.data?.membership.role)
  // Unknown access is not permission: no read until the role is known.
  const allowed = context.isSuccess
    ? Boolean(role && canManageTenant(role))
    : null
  if (allowed !== true) return null
  return (
    <CreditRead
      // A different customer, currency or Order total reads afresh.
      key={orderCreditIdentity(order)}
      order={order}
    />
  )
}

function CreditRead({ order }: { order: CreditOrder }) {
  const trpc = useTRPC()
  const funds = useQuery(
    trpc.businessBanking.orderCustomerFunds.queryOptions(
      { orderId: order.id },
      { retry: false, staleTime: 0, refetchOnMount: "always" },
    ),
  )
  const view = orderCreditView({
    allowed: true,
    status: funds.status,
    forbidden: errorCode(funds.error) === "FORBIDDEN",
    fetchedAfterMount: funds.isFetchedAfterMount,
    data: funds.data,
    orderId: order.id,
    customerId: order.customerId,
    orderCurrency: order.currencyCode,
  })
  return (
    <CreditNote
      view={view}
      customerId={order.customerId}
      retrying={funds.isFetching}
      onRetry={() => void funds.refetch()}
    />
  )
}

function CreditNote({
  view,
  customerId,
  retrying,
  onRetry,
}: {
  view: OrderCreditView
  customerId: string | null
  retrying: boolean
  onRetry: () => void
}) {
  if (view.kind === "hidden") return null
  if (view.kind === "loading")
    return (
      <output aria-busy="true" className="text-xs text-muted-foreground">
        Checking customer credit…
      </output>
    )
  if (view.kind === "changed")
    return (
      <output className="block text-sm text-muted-foreground">
        The Order’s customer changed. Reopen this Order before checking customer
        credit.
      </output>
    )
  if (view.kind === "unavailable")
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Customer credit couldn’t be checked right now.
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? "Checking…" : "Try again"}
        </Button>
      </div>
    )
  return (
    <section
      aria-label="Customer credit"
      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm"
    >
      <span className="flex items-start gap-2">
        <HugeiconsIcon
          icon={Wallet01Icon}
          className="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-300"
          aria-hidden
        />
        <span className="grid gap-0.5">
          <b className="font-medium tabular-nums">
            {formatFinanceMoney(view.availableMinor, view.currencyCode)}{" "}
            customer credit available
          </b>
          <span className="text-xs text-muted-foreground">
            Paid ahead and not held for a refund. It hasn’t been used on this
            Order.
          </span>
        </span>
      </span>
      {customerId ? (
        <Button
          variant="outline"
          size="sm"
          render={
            <Link
              href={`/customers/${encodeURIComponent(customerId)}/statement?${new URLSearchParams(
                { ledgerAccount: view.accountId },
              )}`}
            />
          }
        >
          View customer balance
        </Button>
      ) : null}
    </section>
  )
}
