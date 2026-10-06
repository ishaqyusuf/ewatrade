"use client"
import {
  Button,
  ControlField,
  SelectControl,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"

import { DateRangeControl } from "@/components/date-range-control"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { MetricCard } from "@/components/reports/metric-card"
import { ReportError } from "@/components/reports/report-error"
import { ReportSection as ReportPanel } from "@/components/reports/report-section"
import { ScrollableContent } from "@/components/scrollable-content"
import {
  InlineRowCheckbox,
  InlineSelectAllCheckbox,
  InlineSelectionStatus,
  useInlineSelection,
} from "@/components/tables/core"
import {
  type ServiceCommerceReportDetail,
  type ServiceCommerceReportRange,
  resolveServiceCommerceReportRange,
  useServiceCommerceReportParams,
} from "@/hooks/use-service-commerce-report-params"
import { useTRPC } from "@/trpc/client"
import type { ServiceCommerceReportOutput } from "@ewatrade/service-commerce"

import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useMemo } from "react"

type StoreOption = { id: string; name: string }

const COST_LABELS: Record<
  ServiceCommerceReportOutput["costs"][number]["costKind"],
  string
> = {
  bsp_or_twilio_markup: "BSP or Twilio markup",
  delivery: "Delivery",
  ewatrade_subscription: "EwaTrade subscription",
  ewatrade_usage: "EwaTrade usage",
  meta_delivered_message: "Meta delivered messages",
  number: "Number fees",
  payment_provider_fee: "Payment-provider fees",
  revenue: "Business revenue",
  tax: "Tax",
}

const DETAIL_LABELS: Record<ServiceCommerceReportDetail, string> = {
  catalog: "Catalog",
  costs: "Costs",
  lifecycle: "Lifecycle",
  media: "Media",
  reliability: "Reliability",
}

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10)
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function numericReportValues(value: unknown): number[] {
  if (typeof value === "number") return [value]
  if (!value || typeof value !== "object") return []
  return Object.values(value).flatMap(numericReportValues)
}

function hasReportActivity(report: ServiceCommerceReportOutput) {
  return [
    ...Object.values(report.lifecycle).filter(
      (value): value is number => typeof value === "number",
    ),
    ...Object.values(report.catalog),
    ...Object.values(report.media),
    ...Object.values(report.reliability),
    ...report.observability.map((entry) => entry.count),
    ...report.costs.flatMap((cost) => [cost.knownCount, cost.unknownCount]),
    ...numericReportValues(report.storeConversations),
  ].some((value) => value > 0)
}

function ReportSection({
  children,
  detail,
  onOpenDetail,
  title,
}: {
  children: ReactNode
  detail: ServiceCommerceReportDetail
  onOpenDetail: (detail: ServiceCommerceReportDetail) => void
  title: string
}) {
  return (
    <ReportPanel
      title={title}
      actions={
        <Button
          appearance="form"
          onClick={() => onOpenDetail(detail)}
          size="sm"
          type="button"
          variant="outline"
        >
          View detail
        </Button>
      }
    >
      {children}
    </ReportPanel>
  )
}

function CountList({
  entries,
}: {
  entries: Array<{ label: string; value: number | string }>
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <div className="border border-border p-3" key={entry.label}>
          <dt className="text-xs text-muted-foreground">{entry.label}</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums">
            {entry.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

type DrilldownRow = {
  date: string
  category: string
  outcome: string
  connectionId?: string | null
  recipientMarket?: string | null
  messageCategory?: string | null
  billingOwner?: string | null
}

/** Daily aggregate rows have no ID; this composite key is unique per row. */
function drilldownRowKey(row: DrilldownRow) {
  return [
    row.date,
    row.category,
    row.outcome,
    row.connectionId ?? "",
    row.recipientMarket ?? "",
    row.messageCategory ?? "",
    row.billingOwner ?? "",
  ].join(":")
}

function ReportDrilldown({
  detail,
  end,
  onClose,
  start,
  storeId,
}: {
  detail: ServiceCommerceReportDetail | null
  end: Date
  onClose: () => void
  start: Date
  storeId: string | null
}) {
  const trpc = useTRPC()
  const category = detail ?? "lifecycle"
  const drilldown = useQuery({
    ...trpc.serviceCommerce.reportDrilldown.queryOptions(
      {
        category,
        end,
        ...(storeId ? { storeId } : {}),
        start,
      },
      { retry: false },
    ),
    enabled: detail !== null,
  })
  const rowKeys = useMemo(
    () => drilldown.data?.rows.map(drilldownRowKey) ?? [],
    [drilldown.data],
  )
  const selection = useInlineSelection({
    ids: rowKeys,
    scope: `${category}:${storeId ?? "all"}:${start.toISOString()}:${end.toISOString()}`,
    disabled: drilldown.isFetching,
  })

  if (!detail) return null

  return (
    <section
      aria-label={`${DETAIL_LABELS[detail]} report detail`}
      className="border border-primary/30 bg-primary/5 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{DETAIL_LABELS[detail]} detail</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregate daily outcomes only. Customer content, provider operation
            identifiers, and private media are never included.
          </p>
        </div>
        <Button
          appearance="form"
          onClick={onClose}
          size="sm"
          type="button"
          variant="outline"
        >
          Close detail
        </Button>
      </div>
      {drilldown.data?.mayBeTruncated ? (
        <output className="mt-3 block text-sm text-amber-700">
          This detail reached its safe query limit and may be incomplete.
        </output>
      ) : null}
      {drilldown.isLoading ? (
        <output
          aria-label="Loading report detail"
          className="mt-4 block h-24 animate-pulse bg-muted"
        />
      ) : drilldown.isError ? (
        <div className="mt-4 grid gap-3" role="alert">
          <p className="text-sm text-destructive">
            Report detail is temporarily unavailable.
          </p>
          <Button
            appearance="form"
            className="w-fit"
            onClick={() => void drilldown.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry detail
          </Button>
        </div>
      ) : drilldown.data?.rows.length ? (
        <>
          <div className="mt-4">
            <InlineSelectionStatus selection={selection} />
          </div>
          <section
            className="mt-2 overflow-x-auto"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the report table.
            tabIndex={0}
            aria-label="Report detail table"
          >
            <Table className="w-full min-w-[37rem] text-left text-sm">
              <TableHeader className="border-b border-border text-sm font-normal text-muted-foreground">
                <TableRow>
                  <TableHead scope="col" className="w-10 px-4 py-2 font-normal">
                    <InlineSelectAllCheckbox
                      selection={selection}
                      label="Select all detail rows"
                    />
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-normal">
                    Date
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-normal">
                    Category
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-normal">
                    Outcome
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-normal">
                    Usage attribution
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="px-4 py-2 text-right font-normal"
                  >
                    Count
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drilldown.data.rows.map((row) => (
                  <TableRow
                    className="border-b border-border/70"
                    key={drilldownRowKey(row)}
                    data-state={
                      selection.isSelected(drilldownRowKey(row))
                        ? "selected"
                        : undefined
                    }
                  >
                    <TableCell className="px-4 py-2">
                      <InlineRowCheckbox
                        selection={selection}
                        id={drilldownRowKey(row)}
                        label={`Select ${row.date} ${humanize(row.category)} ${humanize(row.outcome)}`}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {row.date}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      {humanize(row.category)}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      {humanize(row.outcome)}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-muted-foreground">
                      {[
                        row.connectionId
                          ? `Connection ${row.connectionId}`
                          : null,
                        row.recipientMarket,
                        row.messageCategory,
                        row.billingOwner,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right tabular-nums">
                      {row.count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No aggregate events were recorded for this detail and date range.
        </p>
      )}
    </section>
  )
}

export function ServiceCommerceReportWorkspace({
  initialRange,
  stores,
}: {
  initialRange: ServiceCommerceReportRange
  stores: StoreOption[]
}) {
  const trpc = useTRPC()
  const params = useServiceCommerceReportParams()
  const scope = useMemo(() => {
    if (params.from && params.to && params.to > params.from) {
      return resolveServiceCommerceReportRange({
        from: params.from,
        to: params.to,
      })
    }
    return initialRange
  }, [initialRange, params.from, params.to])
  const storeId = stores.some((store) => store.id === params.store)
    ? params.store
    : null
  const report = useQuery(
    trpc.serviceCommerce.report.queryOptions(
      {
        end: scope.to,
        ...(storeId ? { storeId } : {}),
        start: scope.from,
      },
      { retry: false },
    ),
  )

  return (
    <ScrollableContent>
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-6 pt-6">
        <PageHeader
          eyebrow="Service Commerce"
          title="Operational reports"
          description="Lifecycle, Catalog, reliability, media and cost facts are scoped to the selected Store and occurrence window."
        >
          <PageToolbar
            actions={
              <>
                <ControlField label={<>Store</>}>
                  <SelectControl
                    aria-label="Service Commerce report store"
                    onValueChange={(value) =>
                      void params.setScope({
                        from: scope.from,
                        store: value || null,
                        to: scope.to,
                      })
                    }
                    value={storeId ?? ""}
                    options={[
                      { value: "", label: <>All tenant stores</> },
                      ...(stores.map((store) => ({
                        value: store.id,
                        label: store.name,
                      })) ?? []),
                    ]}
                  />
                </ControlField>
                <DateRangeControl
                  start={formatDateInput(scope.from)}
                  end={formatDateInput(scope.to)}
                  endExclusive
                  maxDays={366}
                  label="Operational report date range"
                  onApply={({ start, end }) =>
                    void params.setScope({
                      from: new Date(`${start}T00:00:00.000Z`),
                      store: storeId,
                      to: new Date(`${end}T00:00:00.000Z`),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Maximum 366 days
                </p>
              </>
            }
          />
        </PageHeader>

        <ReportDrilldown
          detail={params.detail}
          end={scope.to}
          onClose={() => void params.setDetail(null)}
          start={scope.from}
          storeId={storeId}
        />

        {report.isLoading ? (
          <ReportLoading />
        ) : report.isError ? (
          <ReportError
            error={report.error}
            retry={() => void report.refetch()}
          />
        ) : !report.data ? null : !hasReportActivity(report.data) ? (
          <section className="border border-border bg-background p-6">
            <h2 className="font-semibold">No report activity in this window</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try another Store or date range. Zero is shown only after the
              report has loaded; unavailable provider costs remain explicitly
              unknown.
            </p>
          </section>
        ) : (
          <>
            {report.data.mayBeTruncated ? (
              <output className="block border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700">
                One or more report queries reached their safe limit. Totals may
                be incomplete for this date range.
              </output>
            ) : null}
            <ReportContent
              onOpenDetail={(detail) => void params.setDetail(detail)}
              report={report.data}
            />
          </>
        )}
      </div>
    </ScrollableContent>
  )
}

function ReportContent({
  onOpenDetail,
  report,
}: {
  onOpenDetail: (detail: ServiceCommerceReportDetail) => void
  report: ServiceCommerceReportOutput
}) {
  const {
    catalog,
    costs,
    lifecycle,
    media,
    observability,
    reliability,
    storeConversations,
  } = report

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Requests" value={lifecycle.requestsReceived} />
        <MetricCard label="Quotes issued" value={lifecycle.quotesIssued} />
        <MetricCard
          label="Bookings confirmed"
          value={lifecycle.bookingsConfirmed}
        />
        <MetricCard
          label="Payment value"
          money
          value={formatMinorMoney(
            lifecycle.paymentValueMinor,
            report.currencyCode,
          )}
        />
      </div>

      <ReportSection
        detail="lifecycle"
        onOpenDetail={onOpenDetail}
        title="Lifecycle"
      >
        <CountList
          entries={[
            { label: "Quotes accepted", value: lifecycle.quotesAccepted },
            { label: "Payments succeeded", value: lifecycle.paymentsSucceeded },
            { label: "Pickup completed", value: lifecycle.pickupsCompleted },
            {
              label: "Delivery completed",
              value: lifecycle.deliveriesCompleted,
            },
            {
              label: "Service completions",
              value: lifecycle.serviceCompletions,
            },
            { label: "Bookings completed", value: lifecycle.bookingsCompleted },
          ]}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CountList
            entries={lifecycle.byChannel.map((entry) => ({
              label: humanize(entry.channel),
              value: entry.count,
            }))}
          />
          <CountList
            entries={lifecycle.bySource.map((entry) => ({
              label: humanize(entry.source),
              value: entry.count,
            }))}
          />
        </div>
      </ReportSection>

      <section className="border border-border bg-background p-5">
        <h2 className="font-semibold">Store Conversation service quality</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Content-free operational counts for the selected Store and occurrence
          window. Customer messages, contacts, credentials and provider
          identifiers are never included.
        </p>
        <div className="mt-4 grid gap-5">
          <div>
            <h3 className="mb-2 text-sm font-medium">Lifecycle and team</h3>
            <CountList
              entries={[
                {
                  label: "Conversations started",
                  value: storeConversations.lifecycle.conversationsStarted,
                },
                {
                  label: "Customer messages",
                  value: storeConversations.lifecycle.customerMessages,
                },
                {
                  label: "Store replies",
                  value: storeConversations.lifecycle.storeReplies,
                },
                {
                  label: "First response average",
                  value:
                    storeConversations.lifecycle.firstResponse
                      .averageSeconds === null
                      ? "Unknown"
                      : `${Math.round(storeConversations.lifecycle.firstResponse.averageSeconds)}s`,
                },
                { label: "Claims", value: storeConversations.team.claimed },
                {
                  label: "Unclaimed now",
                  value: storeConversations.team.unclaimedCurrent,
                },
                {
                  label: "Overdue now",
                  value: storeConversations.team.overdueCurrent,
                },
                {
                  label: "Escalations opened",
                  value: storeConversations.team.escalationsOpened,
                },
                {
                  label: "Escalations resolved",
                  value: storeConversations.team.escalationsResolved,
                },
              ]}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">
              Availability and channels
            </h3>
            <CountList
              entries={[
                {
                  label: "Paused",
                  value: storeConversations.availability.paused,
                },
                {
                  label: "Resumed",
                  value: storeConversations.availability.resumed,
                },
                {
                  label: "Schedule updates",
                  value: storeConversations.availability.scheduleUpdates,
                },
                {
                  label: "Coverage blocks",
                  value:
                    storeConversations.availability.coverageBlockObservations,
                },
                {
                  label: "Policy blocks",
                  value:
                    storeConversations.availability.policyBlockObservations,
                },
                {
                  label: "Provider blocks",
                  value:
                    storeConversations.availability.providerBlockObservations,
                },
                {
                  label: "Web messages",
                  value: storeConversations.channels.webMessages,
                },
                {
                  label: "Mobile messages",
                  value: storeConversations.channels.mobileMessages,
                },
                {
                  label: "WhatsApp messages",
                  value: storeConversations.channels.whatsAppMessages,
                },
                {
                  label: "Bridge initiated / confirmed",
                  value: `${storeConversations.channels.bridgeInitiated} / ${storeConversations.channels.bridgeConfirmed}`,
                },
              ]}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">
              Notifications and provider delivery
            </h3>
            <CountList
              entries={[
                {
                  label: "Notifications scheduled",
                  value: storeConversations.notifications.scheduled,
                },
                {
                  label: "Notifications delivered",
                  value: storeConversations.notifications.delivered,
                },
                {
                  label: "Coalesced / cancelled by read",
                  value: `${storeConversations.notifications.coalesced} / ${storeConversations.notifications.cancelledByRead}`,
                },
                {
                  label: "Suppressed / unavailable",
                  value: `${storeConversations.notifications.suppressed} / ${storeConversations.notifications.unavailable}`,
                },
                {
                  label: "Provider attempts",
                  value: storeConversations.providerReliability.attempts,
                },
                {
                  label: "Provider failures",
                  value: storeConversations.providerReliability.failed,
                },
                {
                  label: "Provider outcome unknown",
                  value: storeConversations.providerReliability.outcomeUnknown,
                },
                {
                  label: "Cost observations known / unknown",
                  value: `${storeConversations.costVisibility.knownObservations} / ${storeConversations.costVisibility.unknownObservations}`,
                },
              ]}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">
              Request and current outcome snapshots
            </h3>
            <CountList
              entries={[
                {
                  label: "Product requests",
                  value: storeConversations.lifecycle.requestKinds.product,
                },
                {
                  label: "Service requests",
                  value: storeConversations.lifecycle.requestKinds.service,
                },
                {
                  label: "Prescription requests",
                  value: storeConversations.lifecycle.requestKinds.prescription,
                },
                {
                  label: "Active now",
                  value: storeConversations.lifecycle.currentSnapshot.active,
                },
                {
                  label: "Archived now",
                  value: storeConversations.lifecycle.currentSnapshot.archived,
                },
                {
                  label: "Restricted now",
                  value:
                    storeConversations.lifecycle.currentSnapshot.restricted,
                },
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Scheduled closure and arbitrary WhatsApp history remain unknown
              because those historical observations are not persisted. They are
              not reported as zero.
            </p>
          </div>
        </div>
      </section>

      <ReportSection
        detail="catalog"
        onOpenDetail={onOpenDetail}
        title="Progressive Catalog"
      >
        <CountList
          entries={[
            { label: "Demand resolved", value: catalog.demandResolved },
            { label: "Drafts created", value: catalog.draftsCreated },
            {
              label: "Existing Offerings matched",
              value: catalog.existingOfferingsMatched,
            },
            { label: "Resolution unknown", value: catalog.resolutionUnknown },
            { label: "Quote overrides", value: catalog.quoteOverrides },
            {
              label: "Quote override unknown",
              value: catalog.quoteOverrideUnknown,
            },
            {
              label: "Reusable price promotions",
              value: catalog.reusablePricePromotions,
            },
            {
              label: "Procure-to-order commitments",
              value: catalog.procureToOrderCommitments,
            },
            {
              label: "Managed inventory graduations",
              value: catalog.managedInventoryGraduations,
            },
          ]}
        />
      </ReportSection>

      <ReportSection
        detail="reliability"
        onOpenDetail={onOpenDetail}
        title="Reliability and recovery"
      >
        <CountList
          entries={[
            { label: "Provider attempts", value: reliability.providerAttempts },
            { label: "Provider failures", value: reliability.providerFailures },
            { label: "Provider retries", value: reliability.providerRetries },
            { label: "Job recoveries", value: reliability.jobRecoveries },
            {
              label: "Job recovery attempts",
              value: reliability.jobRecoveryAttempts,
            },
            {
              label: "Stale capability rejections",
              value: reliability.staleCapabilityRejections,
            },
          ]}
        />
        <div className="mt-4">
          <CountList
            entries={observability.map((entry) => ({
              label: `${humanize(entry.kind)} · ${humanize(entry.outcome)}`,
              value: entry.count,
            }))}
          />
        </div>
      </ReportSection>

      <ReportSection
        detail="media"
        onOpenDetail={onOpenDetail}
        title="Media safety and observations"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Aggregate safety and conversion facts only; media content, object keys
          and customer descriptions remain private.
        </p>
        <CountList
          entries={[
            { label: "Active attachments", value: media.attachmentsActive },
            { label: "Safe attachments", value: media.attachmentsSafe },
            {
              label: "Quarantined attachments",
              value: media.attachmentsQuarantined,
            },
            { label: "Rejected attachments", value: media.attachmentsRejected },
            {
              label: "Retryable attachments",
              value: media.attachmentsRetryable,
            },
            { label: "Current observations", value: media.observationsCurrent },
            {
              label: "Observation conversions",
              value: media.observationsConverted,
            },
          ]}
        />
      </ReportSection>

      <ReportSection
        detail="costs"
        onOpenDetail={onOpenDetail}
        title="Costs and billing ownership"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          A known zero remains zero. External costs that are not yet available
          stay unknown and are never estimated into another category.
        </p>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {costs.map((cost) => (
            <div
              className="border border-border p-3"
              key={`${cost.costKind}:${cost.currencyCode ?? "unknown"}`}
            >
              <dt className="text-xs text-muted-foreground">
                {COST_LABELS[cost.costKind]}
              </dt>
              <dd className="mt-1 text-lg font-medium">
                {cost.knownTotalMinor === null || cost.currencyCode === null
                  ? "Unknown"
                  : formatMinorMoney(cost.knownTotalMinor, cost.currencyCode)}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                {cost.knownCount} known · {cost.unknownCount} unknown
              </p>
            </div>
          ))}
        </dl>
        {report.usageCostsByDimension.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-sm text-muted-foreground">
              Aggregate Meta usage attribution by Connection, recipient market,
              message category and billing owner.
            </p>
            <CountList
              entries={report.usageCostsByDimension.map((dimension) => ({
                label:
                  [
                    dimension.connectionId
                      ? `Connection ${dimension.connectionId}`
                      : null,
                    dimension.recipientMarket,
                    dimension.messageCategory,
                    dimension.billingOwner,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Unattributed",
                value: dimension.costs.reduce(
                  (count, cost) => count + cost.knownCount + cost.unknownCount,
                  0,
                ),
              }))}
            />
          </div>
        ) : null}
      </ReportSection>

      {report.scope.storeId === null && report.storeBreakdown.length > 0 ? (
        <section className="border border-border bg-background p-5">
          <h2 className="font-semibold">Store breakdown</h2>
          <StoreBreakdownTable report={report} />
        </section>
      ) : null}
    </div>
  )
}

function StoreBreakdownTable({
  report,
}: {
  report: ServiceCommerceReportOutput
}) {
  const storeIds = useMemo(
    () => report.storeBreakdown.map((store) => store.storeId),
    [report.storeBreakdown],
  )
  const selection = useInlineSelection({
    ids: storeIds,
    scope: JSON.stringify(report.scope),
  })
  return (
    <>
      <div className="mt-4">
        <InlineSelectionStatus selection={selection} />
      </div>
      <section
        className="mt-2 overflow-x-auto"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the report table.
        tabIndex={0}
        aria-label="Store breakdown table"
      >
        <Table className="w-full min-w-[41rem] text-left text-sm">
          <TableHeader className="border-b border-border text-xs text-muted-foreground">
            <TableRow>
              <TableHead scope="col" className="w-10 px-4 py-2 font-normal">
                <InlineSelectAllCheckbox
                  selection={selection}
                  label="Select all Stores in this breakdown"
                />
              </TableHead>
              <TableHead scope="col" className="px-4 py-2 font-normal">
                Store
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-2 text-right font-normal"
              >
                Requests
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-2 text-right font-normal"
              >
                Quotes
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-2 text-right font-normal"
              >
                Payments
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-2 text-right font-normal"
              >
                Completions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.storeBreakdown.map((store) => (
              <TableRow
                className="border-b border-border/70"
                key={store.storeId}
                data-state={
                  selection.isSelected(store.storeId) ? "selected" : undefined
                }
              >
                <TableCell className="px-4 py-2">
                  <InlineRowCheckbox
                    selection={selection}
                    id={store.storeId}
                    label={`Select ${store.name}`}
                  />
                </TableCell>
                <TableCell className="px-4 py-2 font-normal">
                  {store.name}
                </TableCell>
                <TableCell className="px-4 py-2 text-right tabular-nums">
                  {store.requestsReceived}
                </TableCell>
                <TableCell className="px-4 py-2 text-right tabular-nums">
                  {store.quotesIssued}
                </TableCell>
                <TableCell className="px-4 py-2 text-right tabular-nums">
                  {store.paymentsSucceeded}
                </TableCell>
                <TableCell className="px-4 py-2 text-right tabular-nums">
                  {store.completions}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  )
}

function ReportLoading() {
  return (
    <div className="grid min-w-0 gap-6">
      <output className="sr-only">Loading Service Commerce report</output>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-28 animate-pulse bg-muted"
            key={`report-card-skeleton-${index + 1}`}
          />
        ))}
      </div>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          className="h-52 animate-pulse bg-muted"
          key={`report-section-skeleton-${index + 1}`}
        />
      ))}
    </div>
  )
}

export function ServiceCommerceReportSkeleton() {
  return (
    <ScrollableContent>
      <div className="pt-6">
        <ReportLoading />
      </div>
    </ScrollableContent>
  )
}
