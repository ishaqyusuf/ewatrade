"use client"

import { useTRPC } from "@/trpc/client"
import { useSuspenseQuery } from "@tanstack/react-query"

type Store = { currencyCode: string; id: string; name: string }

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { currency, style: "currency" }).format(
    value / 100,
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-background p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

export function OperationsReports({
  store,
  tenantName,
}: { store: Store; tenantName: string }) {
  const trpc = useTRPC()
  const { data: inventory } = useSuspenseQuery(
    trpc.inventory.reconciliationReport.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  const { data: balances } = useSuspenseQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: true, storeId: store.id },
      { retry: false },
    ),
  )
  const { data: service } = useSuspenseQuery(
    trpc.serviceReporting.summary.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  const { data: orderRows } = useSuspenseQuery(
    trpc.orders.list.queryOptions(
      { limit: 100, storeId: store.id },
      { retry: false },
    ),
  )
  const orderRevenue = orderRows.reduce(
    (sum, order) => sum + order.totalMinor,
    0,
  )
  return (
    <div className="flex flex-1 flex-col gap-8 p-6 lg:p-8">
      <header>
        <p className="text-sm text-muted-foreground">
          {tenantName} · {store.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Commerce, inventory, service work, and offline reconciliation keep
          their own source of truth.
        </p>
      </header>
      <section className="grid gap-4">
        <h2 className="font-semibold">Commerce</h2>
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Orders" value={orderRows.length} />
          <Metric
            label="Order value"
            value={money(orderRevenue, store.currencyCode)}
          />
          <Metric
            label="Service revenue"
            value={money(
              service.commercial.serviceRevenueMinor,
              store.currencyCode,
            )}
          />
          <Metric
            label="Service quantity"
            value={service.commercial.immutableServiceQuantity}
          />
        </div>
      </section>
      <section className="grid gap-4">
        <h2 className="font-semibold">Inventory</h2>
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Balance sources" value={balances.rows.length} />
          <Metric
            label="Provisional commands"
            value={inventory.provisionalCommands}
          />
          <Metric
            label="Shared pools"
            value={
              balances.rows.filter((row) => row.kind === "SHARED_POOL").length
            }
          />
          <Metric
            label="Packaged balances"
            value={
              balances.rows.filter((row) => row.kind === "PACKAGED_STOCK")
                .length
            }
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Compatible canonical totals show their component balances and are
          informational; they are never used as automatic fulfillment
          availability.
        </p>
      </section>
      <section className="grid gap-4">
        <h2 className="font-semibold">Service operations</h2>
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Work in progress" value={service.work.wip} />
          <Metric label="Ready" value={service.work.ready} />
          <Metric label="Blocked" value={service.work.blocked} />
          <Metric label="Overdue jobs" value={service.work.overdueJobs} />
          <Metric label="Completed lines" value={service.work.completed} />
          <Metric label="Exceptions" value={service.work.exceptions} />
          <Metric label="Rework cycles" value={service.work.rework} />
          <Metric
            label="Message intents"
            value={service.communications.intents}
          />
        </div>
      </section>
    </div>
  )
}
