import { notFound } from "next/navigation"

import { prisma } from "@ewatrade/db"
import {
  CatalogError,
  getStoreEntryServiceRequestForm,
} from "@ewatrade/db/queries"
import { formatMinorMoney } from "@ewatrade/utils"

import { publicServiceDisplayName } from "@/lib/service-display"

import { submitStoreConversationServiceAction } from "./actions"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{
    conversationId?: string
    error?: string
    messageId?: string
  }>
}

function opaqueId(value: string | undefined) {
  const normalized = value?.trim() ?? ""
  return normalized.length > 0 && normalized.length <= 191 ? normalized : null
}

async function loadForm(publicToken: string) {
  try {
    return await getStoreEntryServiceRequestForm(prisma, { publicToken })
  } catch (error) {
    if (error instanceof CatalogError) notFound()
    throw error
  }
}

export default async function StoreConversationServicePage({
  params,
  searchParams,
}: Props) {
  const { token } = await params
  const query = await searchParams
  const conversationId = opaqueId(query.conversationId)
  const messageId = opaqueId(query.messageId)
  if (!conversationId || !messageId) notFound()
  const form = await loadForm(token)
  const error =
    query.error === "items"
      ? "Choose at least one service and enter a quantity."
      : query.error === "contact"
        ? "Enter your name and either a phone number or email address."
        : query.error
          ? "This Request could not be linked. Return to the conversation and try again."
          : null

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-8 md:px-8">
          <a
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            href={`/r/${encodeURIComponent(token)}`}
          >
            Back to conversation
          </a>
          <p className="mt-6 text-sm text-muted-foreground">
            {form.store.name}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {form.label}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose the service for this message. The Store can clarify details
            or send a Quote next.
          </p>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-5 py-8 md:px-8">
        {error ? (
          <p
            className="mb-5 border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <form
          action={submitStoreConversationServiceAction}
          className="grid gap-6"
        >
          <input name="publicToken" type="hidden" value={token} />
          <input name="conversationId" type="hidden" value={conversationId} />
          <input name="messageId" type="hidden" value={messageId} />
          <section className="grid border border-border">
            <h2 className="p-5 font-semibold">Services</h2>
            {form.offerings.map((offering) => (
              <div
                className="grid gap-3 border-t border-border p-5 sm:grid-cols-[1fr_110px] sm:items-center"
                key={offering.id}
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
                  className="h-11 border border-border bg-background px-3 text-sm"
                  inputMode="decimal"
                  name={`quantity:${offering.id}`}
                  placeholder="Quantity"
                />
              </div>
            ))}
          </section>
          <section className="grid gap-4 border border-border p-5">
            <h2 className="font-semibold">Contact details</h2>
            <input
              className="h-11 border border-border bg-background px-3 text-sm"
              name="customerName"
              placeholder="Name"
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                className="h-11 border border-border bg-background px-3 text-sm"
                inputMode="tel"
                name="customerPhone"
                placeholder="Phone"
              />
              <input
                className="h-11 border border-border bg-background px-3 text-sm"
                inputMode="email"
                name="customerEmail"
                placeholder="Email"
                type="email"
              />
            </div>
            <textarea
              className="min-h-28 border border-border bg-background p-3 text-sm"
              name="details"
              placeholder="Extra details (optional)"
            />
          </section>
          <button
            className="h-12 bg-foreground px-5 font-medium text-background"
            type="submit"
          >
            Add Service Request to conversation
          </button>
        </form>
      </section>
    </main>
  )
}
