import { createHash } from "node:crypto"

import { formatMinorMoney } from "@ewatrade/utils"
import { notFound, redirect } from "next/navigation"

import { trpc } from "@/trpc/server"

export const dynamic = "force-dynamic"

function commandId(prefix: string, token: string) {
  return `${prefix}:${createHash("sha256").update(token).digest("hex")}`
}

async function selectOption(data: FormData) {
  "use server"
  const token = String(data.get("token") ?? "")
  try {
    await trpc.serviceCommerce.selectInquiryQuoteOption.mutate({
      acceptanceToken: token,
      clientSelectionId: commandId("inquiry-option", token),
      optionId: String(data.get("optionId") ?? ""),
    })
  } catch {
    notFound()
  }
  redirect(`/commerce-inquiry-quote/${encodeURIComponent(token)}?selected=1`)
}

async function accept(data: FormData) {
  "use server"
  const token = String(data.get("token") ?? "")
  try {
    await trpc.serviceCommerce.acceptInquiryQuote.mutate({
      acceptanceToken: token,
      clientAcceptanceId: commandId("inquiry-acceptance", token),
    })
  } catch {
    notFound()
  }
  redirect(`/commerce-inquiry-quote/${encodeURIComponent(token)}?accepted=1`)
}

export default async function CommerceInquiryQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ accepted?: string; selected?: string }>
}) {
  const { token } = await params
  const query = await searchParams
  const quote = await trpc.serviceCommerce.inquiryQuote
    .query({ acceptanceToken: token })
    .catch(() => notFound())
  const canAccept = quote.customerAction === null
  const canSelect =
    quote.customerAction === null ||
    quote.customerAction === "choose_quote_option"
  const selected =
    quote.options.find((option) => option.id === quote.selectedOptionId) ??
    (quote.options.length === 1 ? quote.options[0] : null)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto grid max-w-2xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <header className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            {quote.storeName} · Quote version {quote.version}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Product quote
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Review the exact available option. An Order is created only after
            you accept the current quotation.
          </p>
        </header>
        {query.accepted || quote.accepted ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Quote accepted. Your Order was created once.
          </p>
        ) : null}
        {quote.requiresSelection ? (
          <section className="grid gap-4" aria-labelledby="quote-options">
            <h2 className="text-xl font-semibold" id="quote-options">
              Choose one option
            </h2>
            {quote.options.map((option) => (
              <form
                action={selectOption}
                className="grid gap-4 rounded-2xl border border-border bg-card p-5"
                key={option.id}
              >
                <input name="token" type="hidden" value={token} />
                <input name="optionId" type="hidden" value={option.id} />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="font-semibold">{option.label}</h3>
                  <p className="font-semibold">
                    {formatMinorMoney(option.totalMinor, quote.currencyCode)}
                  </p>
                </div>
                <ul className="grid gap-2 text-sm text-muted-foreground">
                  {option.lines.map((line, index) => (
                    <li key={`${line.catalogItemName}:${index}`}>
                      {line.catalogItemName} · {line.quantity}
                    </li>
                  ))}
                </ul>
                {canSelect ? (
                  <button
                    className="min-h-11 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
                    type="submit"
                  >
                    Choose {option.label}
                  </button>
                ) : null}
              </form>
            ))}
          </section>
        ) : selected ? (
          <section className="grid gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-semibold">{selected.label}</h2>
              <p className="text-lg font-semibold">
                {formatMinorMoney(selected.totalMinor, quote.currencyCode)}
              </p>
            </div>
            <ul className="grid gap-2 text-sm text-muted-foreground">
              {selected.lines.map((line, index) => (
                <li key={`${line.catalogItemName}:${index}`}>
                  {line.catalogItemName} · {line.quantity}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {!quote.accepted &&
        !quote.requiresSelection &&
        selected &&
        canAccept ? (
          <form action={accept}>
            <input name="token" type="hidden" value={token} />
            <button
              className="min-h-11 w-full rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
              type="submit"
            >
              Accept quote
            </button>
          </form>
        ) : null}
        {query.selected ? (
          <p className="text-sm text-muted-foreground">
            Option selected. Review the total, then accept the quotation.
          </p>
        ) : null}
      </section>
    </main>
  )
}
