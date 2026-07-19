import { randomUUID } from "node:crypto"

import { prisma } from "@ewatrade/db"
import {
  CatalogError,
  getPublicServiceRequestForm,
  submitPublicServiceRequest,
} from "@ewatrade/db/queries"
import { formatMinorMoney } from "@ewatrade/utils"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { publicServiceDisplayName } from "@/lib/service-display"

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string; requested?: string }>
}

export const dynamic = "force-dynamic"

function value(data: FormData, key: string) {
  const result = data.get(key)
  return typeof result === "string" ? result.trim() : ""
}

async function loadForm(token: string) {
  try {
    return await getPublicServiceRequestForm(prisma, { formToken: token })
  } catch (error) {
    if (error instanceof CatalogError) notFound()
    throw error
  }
}

async function submit(data: FormData) {
  "use server"
  const token = value(data, "token")
  const form = await loadForm(token)
  const lines = form.offerings.flatMap((offering) => {
    const quantity = value(data, `quantity:${offering.id}`)
    return quantity ? [{ offeringId: offering.id, quantity }] : []
  })
  if (lines.length === 0) redirect(`/service-request/${token}?error=items`)
  const customerName = value(data, "customerName")
  const customerPhone = value(data, "customerPhone")
  const customerEmail = value(data, "customerEmail").toLowerCase()
  if (!customerName || (!customerPhone && !customerEmail)) {
    redirect(`/service-request/${token}?error=contact`)
  }
  try {
    await submitPublicServiceRequest(prisma, {
      clientRequestId: `request-${randomUUID()}`,
      customerEmail: customerEmail || undefined,
      customerName,
      customerPhone: customerPhone || undefined,
      details: value(data, "details") || undefined,
      formToken: token,
      lines,
      requestedAt: value(data, "requestedAt")
        ? new Date(value(data, "requestedAt"))
        : undefined,
    })
  } catch (error) {
    if (error instanceof CatalogError) {
      redirect(`/service-request/${token}?error=invalid`)
    }
    throw error
  }
  redirect(`/service-request/${token}?requested=1`)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const form = await getPublicServiceRequestForm(prisma, {
    formToken: token,
  }).catch(() => null)
  return form
    ? {
        title: `${form.store.name} service request`,
        description: `Request a service from ${form.store.name}.`,
      }
    : { title: "Service request unavailable | ewatrade" }
}

export default async function Page({ params, searchParams }: Props) {
  const { token } = await params
  const query = await searchParams
  const form = await loadForm(token)
  const error =
    query.error === "items"
      ? "Choose at least one service and enter a quantity."
      : query.error === "contact"
        ? "Enter your name and either a phone number or email address."
        : query.error
          ? "Review the request details and try again."
          : null

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
          <p className="text-sm text-muted-foreground">{form.store.name}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {form.label}
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Tell the business what you need. This is a request, not yet an order
            or price commitment.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-3xl gap-6 px-5 py-10 md:px-8">
        {query.requested ? (
          <p className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Request received. The business can clarify details or send a Quote
            next.
          </p>
        ) : null}
        {error ? (
          <p className="border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {!query.requested ? (
          <form action={submit} className="grid gap-6">
            <input type="hidden" name="token" value={token} />
            <section className="grid border border-border">
              <h2 className="p-5 font-semibold">Services</h2>
              {form.offerings.map((offering) => (
                <div
                  key={offering.id}
                  className="grid gap-3 border-t border-border p-5 sm:grid-cols-[1fr_110px] sm:items-center"
                >
                  <div>
                    <p className="font-medium">
                      {publicServiceDisplayName(
                        offering.catalogItemName,
                        offering.variantName,
                        offering.name,
                      )}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {offering.pricingPolicy === "fixed" &&
                      offering.fixedPriceMinor !== null
                        ? formatMinorMoney(
                            offering.fixedPriceMinor,
                            form.store.currencyCode,
                          )
                        : "Quote required"}
                    </p>
                    {offering.guidance ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {offering.guidance}
                      </p>
                    ) : null}
                  </div>
                  <input
                    aria-label={`${offering.catalogItemName} quantity`}
                    className="h-11 scroll-mt-24 border border-border bg-background px-3 text-sm"
                    inputMode="decimal"
                    name={`quantity:${offering.id}`}
                    placeholder="Quantity"
                  />
                </div>
              ))}
            </section>
            <section className="grid gap-4 border border-border p-5">
              <h2 className="font-semibold">Your details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  className="h-11 scroll-mt-24 border border-border bg-background px-3 text-sm"
                  name="customerName"
                  placeholder="Name"
                  required
                />
                <input
                  className="h-11 scroll-mt-24 border border-border bg-background px-3 text-sm"
                  inputMode="tel"
                  name="customerPhone"
                  placeholder="Phone"
                />
              </div>
              <input
                className="h-11 scroll-mt-24 border border-border bg-background px-3 text-sm"
                name="customerEmail"
                placeholder="Email"
                type="email"
              />
              <input
                className="h-11 scroll-mt-24 border border-border bg-background px-3 text-sm"
                name="requestedAt"
                type="datetime-local"
              />
              <textarea
                className="min-h-24 scroll-mt-24 border border-border bg-background px-3 py-2 text-sm"
                name="details"
                placeholder="What should the business know?"
              />
            </section>
            <button
              className="h-12 bg-primary px-6 text-sm font-medium text-primary-foreground"
              type="submit"
            >
              Send request
            </button>
          </form>
        ) : null}
      </section>
    </main>
  )
}
