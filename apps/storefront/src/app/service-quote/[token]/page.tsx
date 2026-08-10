import { createHash } from "node:crypto"

import { formatMinorMoney } from "@ewatrade/utils"
import { notFound, redirect } from "next/navigation"

import { publicServiceDetail } from "@/lib/service-display"
import { trpc } from "@/trpc/server"

export const dynamic = "force-dynamic"

async function load(token: string) {
  try {
    return await trpc.serviceAccess.quote.query({ acceptanceToken: token })
  } catch {
    notFound()
  }
}

function commandId(prefix: string, token: string) {
  return `${prefix}:${createHash("sha256").update(token).digest("hex")}`
}

async function accept(data: FormData) {
  "use server"
  const token = String(data.get("token") ?? "")
  try {
    await trpc.serviceAccess.acceptQuote.mutate({
      acceptanceToken: token,
      clientAcceptanceId: commandId("service-acceptance", token),
    })
  } catch {
    notFound()
  }
  redirect(`/service-quote/${token}?accepted=1`)
}

async function selectOption(data: FormData) {
  "use server"
  const token = String(data.get("token") ?? "")
  try {
    await trpc.serviceAccess.selectQuoteOption.mutate({
      acceptanceToken: token,
      clientSelectionId: commandId("service-option", token),
      optionId: String(data.get("optionId") ?? ""),
    })
  } catch {
    notFound()
  }
  redirect(`/service-quote/${token}?selected=1`)
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
        {quote.requiresSelection ? (
          <section aria-labelledby="offer-options" className="grid gap-3">
            <div>
              <h2 id="offer-options" className="text-xl font-semibold">
                Choose one option
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Options are alternatives. Only your selected option becomes
                payable.
              </p>
            </div>
            {quote.options.map((option) => (
              <form
                action={selectOption}
                className="grid gap-3 border border-border p-5"
                key={option.id}
              >
                <input name="token" type="hidden" value={token} />
                <input name="optionId" type="hidden" value={option.id} />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{option.label}</h3>
                    {option.fulfilmentPromise ? (
                      <p className="text-sm text-muted-foreground">
                        {option.fulfilmentPromise}
                      </p>
                    ) : null}
                  </div>
                  <p className="font-semibold">
                    {formatMinorMoney(option.totalMinor, quote.currencyCode)}
                  </p>
                </div>
                <ul className="grid gap-1 text-sm text-muted-foreground">
                  {option.lines.map((line, index) => (
                    <li key={`${line.catalogItemName}:${index}`}>
                      {line.catalogItemName} · {line.quantity}
                    </li>
                  ))}
                </ul>
                <button
                  className="h-11 bg-primary px-5 text-sm font-medium text-primary-foreground"
                  type="submit"
                >
                  Choose {option.label}
                </button>
              </form>
            ))}
          </section>
        ) : (
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
        )}
        {!quote.accepted && quote.payable ? (
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
