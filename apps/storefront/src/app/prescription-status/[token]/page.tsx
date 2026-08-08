import { prisma } from "@ewatrade/db"
import {
  PrescriptionRequestError,
  getPublicPrescriptionRequestStatus,
} from "@ewatrade/db/queries"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const status = await getPublicPrescriptionRequestStatus(prisma, {
    statusToken: token,
  }).catch((error) => {
    if (error instanceof PrescriptionRequestError) notFound()
    throw error
  })
  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground">
      <section className="mx-auto grid max-w-xl gap-6 border border-border p-6">
        <div>
          <p className="text-sm text-muted-foreground">{status.storeName}</p>
          <h1 className="mt-2 text-3xl font-semibold">Request received</h1>
        </div>
        <dl className="grid gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="mt-1 font-medium tabular-nums">
              {status.reference}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Current update</dt>
            <dd className="mt-1 capitalize">
              {status.status.replaceAll("_", " ")}
            </dd>
          </div>
        </dl>
        {status.pickup?.code ? (
          <section className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">Ready for pickup</p>
            <p className="mt-2">
              Your one-time collection code is{" "}
              <strong>{status.pickup.code}</strong>.
            </p>
            <p className="mt-1 text-xs">
              Show this code only at the pharmacy counter.
            </p>
          </section>
        ) : null}
        <p className="text-sm text-muted-foreground">
          This page intentionally does not show prescription contents. The
          pharmacy will contact you through the details you supplied.
        </p>
      </section>
    </main>
  )
}
