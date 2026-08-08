import { prisma } from "@ewatrade/db"
import {
  PrescriptionFulfillmentError,
  revisePrescriptionQuoteForDelivery,
} from "@ewatrade/db/queries"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

function field(data: FormData, key: string) {
  const value = data.get(key)
  return typeof value === "string" ? value.trim() : ""
}

async function selectDelivery(data: FormData) {
  "use server"
  const token = field(data, "token")
  let nextToken: string
  try {
    const result = await revisePrescriptionQuoteForDelivery(prisma, {
      acceptanceToken: token,
      address: {
        addressLine1: field(data, "addressLine1"),
        addressLine2: field(data, "addressLine2") || undefined,
        locality: field(data, "locality"),
        postalCode: field(data, "postalCode") || undefined,
        recipientName: field(data, "recipientName"),
        recipientPhone: field(data, "recipientPhone"),
        region: field(data, "region") || undefined,
      },
    })
    if (result.outcome === "manual_review") {
      redirect(`/prescription-quote/${token}?delivery=manual`)
    }
    nextToken = result.acceptanceToken
  } catch (error) {
    if (error instanceof PrescriptionFulfillmentError) {
      redirect(`/prescription-delivery/${token}?error=ineligible`)
    }
    throw error
  }
  redirect(`/prescription-quote/${nextToken}`)
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const query = await searchParams
  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground">
      <section className="mx-auto grid max-w-xl gap-6 border border-border p-6">
        <div>
          <p className="text-sm text-muted-foreground">Secure delivery check</p>
          <h1 className="mt-2 text-3xl font-semibold">
            Confirm delivery address
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The address is encrypted and never placed in the page URL or routine
            analytics.
          </p>
        </div>
        {query.error ? (
          <p
            role="alert"
            className="border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
          >
            Delivery is unavailable or needs pharmacy confirmation. Pickup
            remains available on the current Quote.
          </p>
        ) : null}
        <form action={selectDelivery} className="grid gap-4">
          <input name="token" type="hidden" value={token} />
          <input
            className="h-11 border border-border bg-background px-3"
            name="recipientName"
            placeholder="Recipient name"
            required
          />
          <input
            className="h-11 border border-border bg-background px-3"
            name="recipientPhone"
            placeholder="Recipient phone"
            required
          />
          <input
            className="h-11 border border-border bg-background px-3"
            name="addressLine1"
            placeholder="Address"
            required
          />
          <input
            className="h-11 border border-border bg-background px-3"
            name="addressLine2"
            placeholder="Address details (optional)"
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <input
              className="h-11 border border-border bg-background px-3"
              name="locality"
              placeholder="Locality"
              required
            />
            <input
              className="h-11 border border-border bg-background px-3"
              name="region"
              placeholder="Region"
            />
            <input
              className="h-11 border border-border bg-background px-3"
              name="postalCode"
              placeholder="Postal code"
            />
          </div>
          <button
            className="h-12 bg-primary px-5 text-sm font-medium text-primary-foreground"
            type="submit"
          >
            Check fee and promise
          </button>
        </form>
      </section>
    </main>
  )
}
