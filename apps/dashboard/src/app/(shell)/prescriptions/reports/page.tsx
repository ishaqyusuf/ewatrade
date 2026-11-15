import {
  PrescriptionReport,
  PrescriptionReportSkeleton,
} from "@/components/prescriptions/prescription-report"
import { PrescriptionReportGate } from "@/components/prescriptions/prescription-report-gate"
import { ReportTimeZoneProvider } from "@/components/reports/report-time-zone"
import { loadPrescriptionReportParams } from "@/hooks/use-prescription-report-params"
import { reportRangeInstants } from "@/lib/report-range"
import { canSeePrescriptionReports } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { findBusinessProfile } from "@ewatrade/utils"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = { title: "Prescription reports | EwaTrade" }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/")
  // Owners and admins only, as the API and the Reports sidebar row require.
  if (!canSeePrescriptionReports(ctx.membership.role)) redirect("/")
  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")
  // A business that isn't a pharmacy gets the setup card, not an empty report.
  if (
    findBusinessProfile(store.businessOnboarding?.businessProfileKey)?.key !==
    "pharmacy-health-retail"
  )
    return <PrescriptionReportGate reason="setup" />
  // Business days, so "Today" matches the Overview.
  const timeZone = ctx.tenant.timezone ?? "UTC"
  const reportParams = await loadPrescriptionReportParams(
    searchParams,
    timeZone,
  )
  const { from, to } = reportRangeInstants(reportParams.range, timeZone)
  const reportStoreId = reportParams.storeId
    ? (ctx.stores.find((item) => item.id === reportParams.storeId)?.id ?? null)
    : null
  void prefetch(
    trpc.prescriptions.report.queryOptions({
      from,
      storeId: reportStoreId,
      to,
    }),
  )
  return (
    <HydrateClient>
      <Suspense fallback={<PrescriptionReportSkeleton />}>
        <ReportTimeZoneProvider timeZone={timeZone}>
          <PrescriptionReport
            stores={ctx.stores.map((item) => ({
              id: item.id,
              name: item.name,
            }))}
          />
        </ReportTimeZoneProvider>
      </Suspense>
    </HydrateClient>
  )
}
