import { prisma } from "@ewatrade/db"
import {
  PrescriptionPaymentError,
  getPublicPrescriptionPaymentStatus,
} from "@ewatrade/db/queries"
import { formatMinorMoney } from "@ewatrade/utils"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const payment = await getPublicPrescriptionPaymentStatus(prisma, {
    statusToken: token,
  }).catch((error) => {
    if (error instanceof PrescriptionPaymentError) notFound()
    throw error
  })
  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground">
      <section className="mx-auto grid max-w-xl gap-6 border border-border p-6">
        <div>
          <p className="text-sm text-muted-foreground">Secure payment status</p>
          <h1 className="mt-2 text-3xl font-semibold capitalize">
            {payment.status.replaceAll("_", " ")}
          </h1>
        </div>
        <dl className="grid gap-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Paid</dt>
            <dd>
              {formatMinorMoney(payment.amountPaidMinor, payment.currencyCode)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Remaining</dt>
            <dd>
              {formatMinorMoney(payment.balanceDueMinor, payment.currencyCode)}
            </dd>
          </div>
        </dl>
        <a
          className="border border-border px-4 py-3 text-center text-sm"
          href={`/prescription-payment/${token}`}
        >
          Refresh status
        </a>
        <p className="text-xs text-muted-foreground">
          This receipt intentionally excludes prescription and medicine details.
        </p>
      </section>
    </main>
  )
}
