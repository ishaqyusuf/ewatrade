import { randomUUID } from "node:crypto"

import { prisma } from "@ewatrade/db"
import {
  acceptServiceQuote,
  CatalogError,
  getPublicServiceQuote,
} from "@ewatrade/db/queries"
import { formatMinorMoney } from "@ewatrade/utils"
import { notFound, redirect } from "next/navigation"

import { publicServiceDetail } from "@/lib/service-display"

export const dynamic = "force-dynamic"

async function load(token: string) {
  try {
    return await getPublicServiceQuote(prisma, { acceptanceToken: token })
  } catch (error) {
    if (error instanceof CatalogError) notFound()
    throw error
  }
}

async function accept(data: FormData) {
  "use server"
  const token = String(data.get("token") ?? "")
  try {
    await acceptServiceQuote(prisma, {
      acceptanceToken: token,
      actorUserId: "public_quote_acceptance",
      clientAcceptanceId: `acceptance-${randomUUID()}`,
    })
  } catch (error) {
    if (error instanceof CatalogError) notFound()
    throw error
  }
  redirect(`/service-quote/${token}?accepted=1`)
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ accepted?: string }>
}) {
  const { token } = await params
  const query = await searchParams
  const quote = await load(token)
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto grid max-w-3xl gap-6 px-5 py-12 md:px-8">
        <div>
          <p className="text-sm text-muted-foreground">
            {quote.storeName} · Quote version {quote.version}
          </p>
          <h1 className="mt-2 text-4xl font-semibold">Service Quote</h1>
        </div>
        {query.accepted || quote.accepted ? (
          <p className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Quote accepted. Your order was created once.
          </p>
        ) : null}
        <div className="grid gap-3 border border-border p-5">
          {quote.lines.map((line, index) => (
            <div
              className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
              key={`${line.catalogItemName}:${index}`}
            >
              <div>
                <p className="font-medium">{line.catalogItemName}</p>
                <p className="text-sm text-muted-foreground">
                  {publicServiceDetail(
                    line.catalogItemName,
                    line.variantName,
                    line.offeringName,
                  )}{" "}
                  · {line.quantity} ×{" "}
                  {formatMinorMoney(line.unitPriceMinor, quote.currencyCode)}
                </p>
              </div>
              <p className="font-medium">
                {formatMinorMoney(line.totalMinor, quote.currencyCode)}
              </p>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-4 text-lg font-semibold">
            <span>Total</span>
            <span>
              {formatMinorMoney(quote.totalMinor, quote.currencyCode)}
            </span>
          </div>
        </div>
        {!quote.accepted ? (
          <form action={accept}>
            <input name="token" type="hidden" value={token} />
            <button
              className="h-12 w-full bg-primary px-6 text-sm font-medium text-primary-foreground"
              type="submit"
            >
              Accept Quote
            </button>
          </form>
        ) : null}
      </section>
    </main>
  )
}
