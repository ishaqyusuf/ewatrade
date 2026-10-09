"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { PageHeader, PageToolbar } from "@/components/page-header"
import {
  ReportHeadlineStrip,
  ReportHeadlineStripSkeleton,
} from "@/components/reports/report-headline-strip"
import {
  ReportFunnel,
  ReportMetricGroups,
  ReportTabPanel,
  ReportTabsList,
  ReportTabsSkeleton,
} from "@/components/reports/report-metric-groups"
import { reportCountFormat as countFormat } from "@/components/reports/report-metrics"
import {
  InlineRowCheckbox,
  InlineSelectAllCheckbox,
  InlineSelectionStatus,
  useInlineSelection,
} from "@/components/tables/core"
import {
  Button,
  SelectControl,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsTrigger,
  cn,
} from "@ewatrade/ui"
import Link from "next/link"

import {
  type PrescriptionReportTab,
  isPrescriptionReportTab,
  usePrescriptionReportParams,
} from "@/hooks/use-prescription-report-params"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  type PrescriptionReportData,
  buildPrescriptionReportSections,
  hasPrescriptionReportActivity,
  prescriptionConversionPercent,
  prescriptionReportFunnel,
} from "./prescription-report-sections"

type StoreOption = { id: string; name: string }

export function PrescriptionReport({
  from,
  stores,
  to,
}: {
  from: Date
  stores: StoreOption[]
  to: Date
}) {
  const trpc = useTRPC()
  const params = usePrescriptionReportParams()
  const storeId = stores.some((store) => store.id === params.storeId)
    ? params.storeId
    : null
  const report = useQuery(
    trpc.prescriptions.report.queryOptions({ from, storeId, to }),
  )

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        eyebrow="Prescriptions"
        title="Prescription operations"
        description="De-identified lifecycle and commercial metrics for the last 30 days."
      >
        <PageToolbar
          actions={
            <>
              <SelectControl
                aria-label="Prescription report Store"
                className="h-9 w-full sm:w-64"
                value={storeId ?? ""}
                onValueChange={(value) => void params.setStoreId(value || null)}
                options={[
                  { value: "", label: <>All Stores</> },
                  ...stores.map((store) => ({
                    value: store.id,
                    label: store.name,
                  })),
                ]}
              />
              <Button
                render={<Link href="/prescriptions" />}
                variant="outline"
                className="h-9 rounded-none"
              >
                Back to queue
              </Button>
            </>
          }
        />
      </PageHeader>

      {report.isPending ? (
        <PrescriptionReportLoading />
      ) : report.isError ? (
        <div className="grid gap-3">
          <FormFeedback appearance="dashboard">
            {report.error.message}
          </FormFeedback>
          <Button
            appearance="form"
            className="w-fit"
            variant="outline"
            onClick={() => void report.refetch()}
            type="button"
          >
            Retry report
          </Button>
        </div>
      ) : !report.data ? null : !hasPrescriptionReportActivity(report.data) ? (
        <section className="border border-border bg-background p-6">
          <h2 className="font-semibold">
            No prescription activity in the last 30 days
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try another Store. Counts appear here once requests, Quotes or
            payments are recorded; unavailable provider costs remain explicitly
            unknown.
          </p>
        </section>
      ) : (
        <PrescriptionReportContent
          onTabChange={(tab) => void params.setTab(tab)}
          report={report.data}
          scopeKey={`${storeId ?? "all"}:${from.toISOString()}:${to.toISOString()}`}
          tab={params.tab}
        />
      )}
    </div>
  )
}

function PrescriptionReportContent({
  onTabChange,
  report,
  scopeKey,
  tab,
}: {
  onTabChange: (tab: PrescriptionReportTab) => void
  report: PrescriptionReportData
  scopeKey: string
  tab: PrescriptionReportTab
}) {
  const sections = useMemo(
    () => buildPrescriptionReportSections(report),
    [report],
  )
  const showStores =
    report.scope === "tenant" && report.storeBreakdown.length > 0
  const activeTab = tab === "stores" && !showStores ? "lifecycle" : tab
  const conversion = prescriptionConversionPercent(report)

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <ReportHeadlineStrip
        label="Headline figures"
        items={[
          {
            label: "Requests",
            value: countFormat.format(report.requestCount),
            detail:
              conversion === null
                ? "None received"
                : `${conversion}% converted to orders`,
            muted: report.requestCount === 0,
          },
          {
            label: "Quotes issued",
            value: countFormat.format(report.quoteCount),
            detail: `${countFormat.format(report.quoteOutcomes.accepted)} accepted`,
            muted: report.quoteCount === 0,
          },
          {
            label: "Paid orders",
            value: countFormat.format(report.payment.paidCount),
            detail: `${countFormat.format(report.payment.totalAttempts)} payment ${report.payment.totalAttempts === 1 ? "attempt" : "attempts"}`,
            muted: report.payment.paidCount === 0,
          },
          {
            label: "Payment value",
            value: formatMinorMoney(
              report.payment.paidAmountMinor,
              report.currencyCode,
            ),
            detail: "Paid in the last 30 days",
            money: true,
            muted: report.payment.paidAmountMinor === 0,
          },
        ]}
      />

      <Tabs
        className="min-w-0 gap-6"
        onValueChange={(value) => {
          if (isPrescriptionReportTab(value)) onTabChange(value)
        }}
        value={activeTab}
      >
        <ReportTabsList label="Report sections">
          {sections.map((section) => (
            <TabsTrigger key={section.key} value={section.key}>
              {section.tab}
            </TabsTrigger>
          ))}
          {showStores ? (
            <TabsTrigger value="stores">
              Stores · {report.storeBreakdown.length}
            </TabsTrigger>
          ) : null}
        </ReportTabsList>
        {sections.map((section) => (
          <TabsContent key={section.key} value={section.key}>
            <ReportTabPanel
              description={section.description}
              title={section.title}
            >
              {section.key === "lifecycle" ? (
                <ReportFunnel
                  label="Prescription lifecycle funnel"
                  steps={prescriptionReportFunnel(report)}
                />
              ) : null}
              <ReportMetricGroups groups={section.groups} />
            </ReportTabPanel>
          </TabsContent>
        ))}
        {showStores ? (
          <TabsContent value="stores">
            <ReportTabPanel
              description="Each Store's requests in the last 30 days."
              title="Store breakdown"
            >
              <PrescriptionStoreTable report={report} scopeKey={scopeKey} />
            </ReportTabPanel>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}

function PrescriptionStoreTable({
  report,
  scopeKey,
}: {
  report: PrescriptionReportData
  scopeKey: string
}) {
  const storeIds = useMemo(
    () => report.storeBreakdown.map((store) => store.storeId),
    [report.storeBreakdown],
  )
  const selection = useInlineSelection({ ids: storeIds, scope: scopeKey })
  return (
    <div className="grid min-w-0 gap-3">
      <InlineSelectionStatus selection={selection} />
      <section
        className="overflow-x-auto border border-border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the report table.
        tabIndex={0}
        aria-label="Store breakdown table"
      >
        <Table className="w-full min-w-[24rem] text-left text-sm">
          <TableHeader className="bg-muted/40 text-xs text-muted-foreground">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.storeBreakdown.map((store) => (
              <TableRow
                className="border-b border-border/70 last:border-b-0"
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
                <TableCell className="px-4 py-2">{store.name}</TableCell>
                <TableCell
                  className={cn(
                    "px-4 py-2 text-right tabular-nums",
                    store.requestCount === 0 && "text-muted-foreground",
                  )}
                >
                  {countFormat.format(store.requestCount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}

function PrescriptionReportLoading() {
  return (
    <div className="grid min-w-0 gap-6">
      <output className="sr-only">Loading prescription report</output>
      <ReportHeadlineStripSkeleton count={4} />
      <ReportTabsSkeleton />
    </div>
  )
}

export function PrescriptionReportSkeleton() {
  return <PrescriptionReportLoading />
}
