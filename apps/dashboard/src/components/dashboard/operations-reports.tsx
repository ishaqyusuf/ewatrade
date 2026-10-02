"use client"

import { PageHeader } from "@/components/page-header"
import { MetricCard as Metric } from "@/components/reports/metric-card"
import { ReportError } from "@/components/reports/report-error"
import { ReportSectionSkeleton } from "@/components/reports/report-section"
import { ScrollableContent } from "@/components/scrollable-content"
import { useTRPC } from "@/trpc/client"
import { useSuspenseQuery } from "@tanstack/react-query"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import {
  type ComponentProps,
  type ReactNode,
  Suspense,
  useCallback,
} from "react"

type Store = { currencyCode: string; id: string; name: string }

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { currency, style: "currency" }).format(
    value / 100,
  )
}

function CommerceReports({ store }: { store: Store }) {
  const trpc = useTRPC()
  const { data: service } = useSuspenseQuery(
    trpc.serviceReporting.summary.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  const { data: orders } = useSuspenseQuery(
    trpc.orders.reportSummary.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )

  return (
    <section className="grid gap-4">
      <h2 className="font-semibold">Commerce</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Orders" value={orders.orderCount} />
        <Metric
          label="Order value"
          value={money(orders.orderValueMinor, store.currencyCode)}
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
  )
}

function InventoryReports({ store }: { store: Store }) {
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

  return (
    <section className="grid gap-4">
      <h2 className="font-semibold">Inventory</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            balances.rows.filter((row) => row.kind === "PACKAGED_STOCK").length
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Compatible canonical totals show their component balances and are
        informational; they are never used as automatic fulfillment
        availability.
      </p>
    </section>
  )
}

function ServiceReports({ store }: { store: Store }) {
  const trpc = useTRPC()
  const { data: service } = useSuspenseQuery(
    trpc.serviceReporting.summary.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )

  return (
    <section className="grid gap-4">
      <h2 className="font-semibold">Service operations</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
  )
}

function IsolatedReportSection({
  children,
  count,
  title,
}: {
  children: ReactNode
  count: number
  title: string
}) {
  const ReportFailure = useCallback(
    (props: ComponentProps<typeof ReportError>) => (
      <ReportError {...props} title={title} />
    ),
    [title],
  )
  return (
    <ErrorBoundary errorComponent={ReportFailure}>
      <Suspense
        fallback={<ReportSectionSkeleton count={count} title={title} />}
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

export function OperationsReports({
  store,
  tenantName,
}: { store: Store; tenantName: string }) {
  return (
    <ScrollableContent>
      <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
        <PageHeader
          eyebrow={`${tenantName} · ${store.name}`}
          title="Reports"
          description="Commerce, inventory, service work, and offline reconciliation keep their own source of truth."
        />
        <IsolatedReportSection count={4} title="Commerce">
          <CommerceReports store={store} />
        </IsolatedReportSection>
        <IsolatedReportSection count={4} title="Inventory">
          <InventoryReports store={store} />
        </IsolatedReportSection>
        <IsolatedReportSection count={8} title="Service operations">
          <ServiceReports store={store} />
        </IsolatedReportSection>
      </div>
    </ScrollableContent>
  )
}
