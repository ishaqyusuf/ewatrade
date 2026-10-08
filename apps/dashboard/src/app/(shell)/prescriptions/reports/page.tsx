import {
  PrescriptionReport,
  PrescriptionReportSkeleton,
} from "@/components/prescriptions/prescription-report"
import { loadPrescriptionReportParams } from "@/hooks/use-prescription-report-params"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
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
  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 86_400_000)
  const reportParams = await loadPrescriptionReportParams(searchParams)
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
      <div className="grid min-w-0 flex-1 gap-6 pt-6">
        <Suspense fallback={<PrescriptionReportSkeleton />}>
          <PrescriptionReport
            from={from}
            stores={ctx.stores.map((item) => ({
              id: item.id,
              name: item.name,
            }))}
            to={to}
          />
        </Suspense>
      </div>
    </HydrateClient>
  )
}
