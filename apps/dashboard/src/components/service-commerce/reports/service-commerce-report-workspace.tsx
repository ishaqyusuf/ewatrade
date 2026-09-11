"use client"

import {
  type ServiceCommerceReportDetail,
  type ServiceCommerceReportRange,
  resolveServiceCommerceReportRange,
  useServiceCommerceReportParams,
} from "@/hooks/use-service-commerce-report-params"
import { useTRPC } from "@/trpc/client"
import type { ServiceCommerceReportOutput } from "@ewatrade/service-commerce"
import { Button } from "@ewatrade/ui"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

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

const MAX_REPORT_WINDOW_MILLISECONDS = 366 * 24 * 60 * 60 * 1_000

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10)
}

function readDateInput(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
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

function MetricCard({
  label,
  value,
}: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function ReportSection({
  children,
  detail,
  onOpenDetail,
  title,
}: {
  children: React.ReactNode
  detail: ServiceCommerceReportDetail
  onOpenDetail: (detail: ServiceCommerceReportDetail) => void
  title: string
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <Button
          onClick={() => onOpenDetail(detail)}
          size="sm"
          type="button"
          variant="outline"
        >
          View detail
        </Button>
      </div>
      <div className="mt-4">{children}</div>
    </section>
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
        <div className="rounded-lg border border-border p-3" key={entry.label}>
          <dt className="text-xs text-muted-foreground">{entry.label}</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums">
            {entry.value}
          </dd>
        </div>
      ))}
    </dl>
  )
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

  if (!detail) return null

  return (
    <section
      aria-label={`${DETAIL_LABELS[detail]} report detail`}
      className="rounded-xl border border-primary/30 bg-primary/5 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{DETAIL_LABELS[detail]} detail</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregate daily outcomes only. Customer content, provider operation
            identifiers, and private media are never included.
          </p>
        </div>
        <Button onClick={onClose} size="sm" type="button" variant="outline">
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
          className="mt-4 block h-24 animate-pulse rounded-lg bg-muted"
        />
      ) : drilldown.isError ? (
        <div className="mt-4 grid gap-3" role="alert">
          <p className="text-sm text-destructive">
            Report detail is temporarily unavailable.
          </p>
          <Button
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
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Category</th>
                <th className="px-2 py-2 font-medium">Outcome</th>
                <th className="px-2 py-2 font-medium">Usage attribution</th>
                <th className="px-2 py-2 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {drilldown.data.rows.map((row) => (
                <tr
                  className="border-b border-border/70"
                  key={[
                    row.date,
                    row.category,
                    row.outcome,
                    row.connectionId ?? "",
                    row.recipientMarket ?? "",
                    row.messageCategory ?? "",
                    row.billingOwner ?? "",
                  ].join(":")}
                >
                  <td className="px-2 py-2 tabular-nums">{row.date}</td>
                  <td className="px-2 py-2">{humanize(row.category)}</td>
                  <td className="px-2 py-2">{humanize(row.outcome)}</td>
                  <td className="px-2 py-2 text-muted-foreground">
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
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {row.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const [draftFrom, setDraftFrom] = useState(formatDateInput(initialRange.from))
  const [draftTo, setDraftTo] = useState(formatDateInput(initialRange.to))
  const scope = useMemo(() => {
    if (params.from && params.to && params.to > params.from) {
      return resolveServiceCommerceReportRange({
        from: params.from,
        to: params.to,
      })
    }
    return initialRange
  }, [initialRange, params.from, params.to])
  useEffect(() => {
    setDraftFrom(formatDateInput(scope.from))
    setDraftTo(formatDateInput(scope.to))
  }, [scope.from, scope.to])
  const storeId = stores.some((store) => store.id === params.store)
    ? params.store
    : null
  const draftRange = {
    from: readDateInput(draftFrom),
    to: readDateInput(draftTo),
  }
  const canApplyScope =
    draftRange.from !== null &&
    draftRange.to !== null &&
    draftRange.to > draftRange.from &&
    draftRange.to.getTime() - draftRange.from.getTime() <=
      MAX_REPORT_WINDOW_MILLISECONDS
  const rangeValidationMessage =
    draftRange.from &&
    draftRange.to &&
    draftRange.to.getTime() - draftRange.from.getTime() >
      MAX_REPORT_WINDOW_MILLISECONDS
      ? "Choose a range of 366 days or fewer."
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

  const applyScope = () => {
    const { from, to } = draftRange
    if (!from || !to || to <= from) return
    void params.setScope({ from, store: storeId, to })
  }

  return (
    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-6 p-6 lg:p-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Service Commerce</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Operational reports
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Lifecycle, Catalog, reliability, media and cost facts are scoped to
            the selected Store and occurrence window.
          </p>
        </div>
      </header>

      <form
        className="grid gap-4 rounded-xl border border-border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          applyScope()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            Store
            <select
              className="h-10 rounded-lg border border-border bg-background px-3"
              onChange={(event) =>
                void params.setScope({
                  from: scope.from,
                  store: event.target.value || null,
                  to: scope.to,
                })
              }
              value={storeId ?? ""}
            >
              <option value="">All tenant stores</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            From
            <input
              className="h-10 rounded-lg border border-border bg-background px-3"
              onChange={(event) => setDraftFrom(event.target.value)}
              type="date"
              value={draftFrom}
            />
          </label>
          <label className="grid gap-1 text-sm">
            To (exclusive)
            <input
              className="h-10 rounded-lg border border-border bg-background px-3"
              onChange={(event) => setDraftTo(event.target.value)}
              type="date"
              value={draftTo}
            />
          </label>
        </div>
        <div className="grid gap-2">
          <Button disabled={!canApplyScope} type="submit">
            Apply range
          </Button>
          <p
            className={
              rangeValidationMessage
                ? "text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
            role={rangeValidationMessage ? "alert" : undefined}
          >
            {rangeValidationMessage ?? "Maximum 366 days"}
          </p>
        </div>
      </form>

      <ReportDrilldown
        detail={params.detail}
        end={scope.to}
        onClose={() => void params.setDetail(null)}
        start={scope.from}
        storeId={storeId}
      />

      {report.isLoading ? (
        <ServiceCommerceReportSkeleton />
      ) : report.isError ? (
        <section
          className="grid gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5"
          role="alert"
        >
          <p className="text-sm text-destructive">
            This report is temporarily unavailable.
          </p>
          <Button
            className="w-fit"
            onClick={() => void report.refetch()}
            type="button"
            variant="outline"
          >
            Retry report
          </Button>
        </section>
      ) : !report.data ? null : !hasReportActivity(report.data) ? (
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold">No report activity in this window</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try another Store or date range. Zero is shown only after the report
            has loaded; unavailable provider costs remain explicitly unknown.
          </p>
        </section>
      ) : (
        <>
          {report.data.mayBeTruncated ? (
            <output className="block rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700">
              One or more report queries reached their safe limit. Totals may be
              incomplete for this date range.
            </output>
          ) : null}
          <ReportContent
            onOpenDetail={(detail) => void params.setDetail(detail)}
            report={report.data}
          />
        </>
      )}
    </div>
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
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Requests" value={lifecycle.requestsReceived} />
        <MetricCard label="Quotes issued" value={lifecycle.quotesIssued} />
        <MetricCard
          label="Bookings confirmed"
          value={lifecycle.bookingsConfirmed}
        />
        <MetricCard
          label="Payment value"
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

      <section className="rounded-xl border border-border bg-card p-5">
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
              className="rounded-lg border border-border p-3"
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
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Store breakdown</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Store</th>
                  <th className="px-2 py-2 text-right font-medium">Requests</th>
                  <th className="px-2 py-2 text-right font-medium">Quotes</th>
                  <th className="px-2 py-2 text-right font-medium">Payments</th>
                  <th className="px-2 py-2 text-right font-medium">
                    Completions
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.storeBreakdown.map((store) => (
                  <tr className="border-b border-border/70" key={store.storeId}>
                    <td className="px-2 py-2 font-medium">{store.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {store.requestsReceived}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {store.quotesIssued}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {store.paymentsSucceeded}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {store.completions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export function ServiceCommerceReportSkeleton() {
  return (
    <div className="grid gap-6">
      <output className="sr-only">Loading Service Commerce report</output>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-28 animate-pulse rounded-xl bg-muted"
            key={`report-card-skeleton-${index + 1}`}
          />
        ))}
      </div>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          className="h-52 animate-pulse rounded-xl bg-muted"
          key={`report-section-skeleton-${index + 1}`}
        />
      ))}
    </div>
  )
}
