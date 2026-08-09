import { PrescriptionReport } from "@/components/prescriptions/prescription-report"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { Button } from "@ewatrade/ui"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = { title: "Prescription reports | EwaTrade" }

export default async function Page() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/")
  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 86_400_000)
  await prefetch(
    trpc.prescriptions.report.queryOptions({ from, storeId: store.id, to }),
  )
  return (
    <HydrateClient>
      <div className="grid flex-1 gap-6 p-6 lg:p-8">
        <header className="flex items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="text-sm text-muted-foreground">
              {store.name} · Last 30 days
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              Prescription operations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              De-identified lifecycle and commercial metrics.
            </p>
          </div>
          <Button render={<Link href="/prescriptions" />} variant="outline">
            Back to queue
          </Button>
        </header>
        <Suspense fallback={<div className="h-72 animate-pulse bg-muted" />}>
          <PrescriptionReport
            from={from}
            initialStoreId={store.id}
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
