"use client"

import { PageHeader } from "@/components/page-header"
import { ReportError } from "@/components/reports/report-error"
import {
  ReportHeadlineStrip,
  ReportHeadlineStripSkeleton,
} from "@/components/reports/report-headline-strip"
import {
  ReportMetricGroups,
  ReportTabPanel,
  ReportTabsList,
  ReportToneDot,
} from "@/components/reports/report-metric-groups"
import {
  reportCountFormat as countFormat,
  sectionTone,
} from "@/components/reports/report-metrics"
import { ScrollableContent } from "@/components/scrollable-content"
import {
  isOperationsReportTab,
  useOperationsReportParams,
} from "@/hooks/use-operations-report-params"
import { useTRPC } from "@/trpc/client"
import { Tabs, TabsContent, TabsTrigger } from "@ewatrade/ui"
import { formatMinorMoney } from "@ewatrade/utils"
import { useSuspenseQuery } from "@tanstack/react-query"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import {
  type ComponentProps,
  type ReactNode,
  Suspense,
  useCallback,
} from "react"
import {
  buildInventoryGroups,
  buildServiceGroups,
} from "./operations-report-sections"

type Store = { currencyCode: string; id: string; name: string }

function useServiceSummary(store: Store) {
  const trpc = useTRPC()
  return useSuspenseQuery(
    trpc.serviceReporting.summary.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  ).data
}

function CommerceHeadlines({ store }: { store: Store }) {
  const trpc = useTRPC()
  const service = useServiceSummary(store)
  const { data: orders } = useSuspenseQuery(
    trpc.orders.reportSummary.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  return (
    <ReportHeadlineStrip
      label="Commerce"
      items={[
        {
          label: "Orders",
          value: countFormat.format(orders.orderCount),
          muted: orders.orderCount === 0,
        },
        {
          label: "Order value",
          value: formatMinorMoney(orders.orderValueMinor, store.currencyCode),
          money: true,
          muted: orders.orderValueMinor === 0,
        },
        {
          label: "Service revenue",
          value: formatMinorMoney(
            service.commercial.serviceRevenueMinor,
            store.currencyCode,
          ),
          money: true,
          muted: service.commercial.serviceRevenueMinor === 0,
        },
        {
          label: "Service quantity",
          value: countFormat.format(
            service.commercial.immutableServiceQuantity,
          ),
          muted: service.commercial.immutableServiceQuantity === 0,
        },
      ]}
    />
  )
}

function InventoryPanel({ store }: { store: Store }) {
  const trpc = useTRPC()
  const { data: reconciliation } = useSuspenseQuery(
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
    <ReportTabPanel
      description="Stock balance sources and offline commands awaiting reconciliation."
      title="Inventory"
    >
      <ReportMetricGroups
        groups={buildInventoryGroups({ balances, reconciliation })}
      />
      <p className="text-xs text-muted-foreground">
        Compatible canonical totals show their component balances and are
        informational; they are never used as automatic fulfillment
        availability.
      </p>
    </ReportTabPanel>
  )
}

function ServicePanel({ store }: { store: Store }) {
  const service = useServiceSummary(store)
  return (
    <ReportTabPanel
      description="Service work, quality and customer messaging for this Store."
      title="Service operations"
    >
      <ReportMetricGroups groups={buildServiceGroups(service)} />
    </ReportTabPanel>
  )
}

/** Shares the cached summary; renders nothing until it is available. */
function ServiceTabTone({ store }: { store: Store }) {
  const service = useServiceSummary(store)
  return (
    <ReportToneDot
      tone={sectionTone({ groups: buildServiceGroups(service) })}
    />
  )
}

function IsolatedReport({
  children,
  fallback,
  title,
}: {
  children: ReactNode
  fallback: ReactNode
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
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  )
}

function SilentFailure() {
  return null
}

const panelSkeleton = (
  <div aria-hidden="true" className="h-72 animate-pulse bg-muted" />
)

export function OperationsReports({
  store,
  tenantName,
}: { store: Store; tenantName: string }) {
  const params = useOperationsReportParams()
  return (
    <ScrollableContent>
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-6 pt-6">
        <PageHeader
          eyebrow={`${tenantName} · ${store.name}`}
          title="Reports"
          description="Commerce, inventory, service work, and offline reconciliation keep their own source of truth."
        />
        <IsolatedReport
          fallback={<ReportHeadlineStripSkeleton count={4} />}
          title="Commerce"
        >
          <CommerceHeadlines store={store} />
        </IsolatedReport>
        <Tabs
          className="min-w-0 gap-6"
          onValueChange={(value) => {
            if (isOperationsReportTab(value)) void params.setTab(value)
          }}
          value={params.tab}
        >
          <ReportTabsList label="Report sections">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="service">
              Service operations
              <ErrorBoundary errorComponent={SilentFailure}>
                <Suspense fallback={null}>
                  <ServiceTabTone store={store} />
                </Suspense>
              </ErrorBoundary>
            </TabsTrigger>
          </ReportTabsList>
          <TabsContent value="inventory">
            <IsolatedReport fallback={panelSkeleton} title="Inventory">
              <InventoryPanel store={store} />
            </IsolatedReport>
          </TabsContent>
          <TabsContent value="service">
            <IsolatedReport fallback={panelSkeleton} title="Service operations">
              <ServicePanel store={store} />
            </IsolatedReport>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollableContent>
  )
}
