import { prisma } from "@ewatrade/db"
import {
  RetailOpsServiceOperationsError,
  createPublicRetailOpsServiceRequest,
  getPublicRetailOpsServiceRequestLink,
} from "@ewatrade/db/queries"
import { formatMinorMoney } from "@ewatrade/utils"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

type ServiceRequestPageProps = {
  params: Promise<{ token: string }>
  searchParams: Promise<{
    error?: string
    requested?: string
  }>
}

export const dynamic = "force-dynamic"

function getFormValue(formData: FormData, name: string) {
  const value = formData.get(name)

  return typeof value === "string" ? value : ""
}

async function resolveServiceRequestLink(token: string, recordFailure = true) {
  try {
    return await getPublicRetailOpsServiceRequestLink(prisma, { token })
  } catch (error) {
    if (error instanceof RetailOpsServiceOperationsError && recordFailure) {
      notFound()
    }

    throw error
  }
}

async function submitServiceRequest(formData: FormData) {
  "use server"

  const token = getFormValue(formData, "token")
  const link = await resolveServiceRequestLink(token, false).catch(() => null)

  if (!link) {
    notFound()
  }

  const lines = link.items.flatMap((item) => {
    const quantity = Number(getFormValue(formData, `quantity:${item.id}`))
    if (!Number.isInteger(quantity) || quantity <= 0) return []

    const defaultVariant =
      item.variants.find((variant) => variant.isDefault) ?? item.variants[0]
    const catalogItemVariantId =
      getFormValue(formData, `variant:${item.id}`) || defaultVariant?.id
    if (!catalogItemVariantId) return []

    return [
      {
        catalogItemVariantId,
        quantity,
      },
    ]
  })

  if (lines.length === 0) {
    redirect(`/service-request/${token}?error=NO_LINES`)
  }

  const customerName = getFormValue(formData, "customerName").trim()
  const customerPhone = getFormValue(formData, "customerPhone").trim()
  const customerEmail = getFormValue(formData, "customerEmail")
    .trim()
    .toLowerCase()

  if (!customerName || (!customerPhone && !customerEmail)) {
    redirect(`/service-request/${token}?error=CUSTOMER_REQUIRED`)
  }

  const request = await createPublicRetailOpsServiceRequest(prisma, {
    customerEmail: customerEmail || undefined,
    customerName,
    customerPhone: customerPhone || undefined,
    lines,
    notes: getFormValue(formData, "notes").trim() || undefined,
    token,
  })

  redirect(`/service-request/${token}?requested=${request.trackingToken}`)
}

function getErrorMessage(error?: string) {
  if (error === "NO_LINES") return "Choose at least one service quantity."
  if (error === "CUSTOMER_REQUIRED") {
    return "Enter your name and either phone number or email address."
  }

  return null
}

function getPublicAssetUrl(path: string) {
  const origin =
    process.env.NEXT_PUBLIC_MARKETING_URL ??
    process.env.NEXT_PUBLIC_STOREFRONT_URL ??
    process.env.STOREFRONT_URL ??
    "https://ewatrade.com"

  return `${origin.replace(/\/$/, "")}${path}`
}

export async function generateMetadata({
  params,
}: ServiceRequestPageProps): Promise<Metadata> {
  const { token } = await params
  const link = await resolveServiceRequestLink(token, false).catch(() => null)

  if (!link) {
    return {
      title: "Service request unavailable | ewatrade",
    }
  }

  const description = `Request a service from ${link.store.name}.`

  return {
    title: `${link.store.name} service request`,
    description,
    openGraph: {
      title: `${link.store.name} service request`,
      description,
      images: [
        {
          alt: `${link.store.name} service request`,
          height: 630,
          url: getPublicAssetUrl("/brand/ewatrade-logo.png"),
          width: 1200,
        },
      ],
      siteName: link.store.name,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${link.store.name} service request`,
      description,
    },
  }
}

export default async function ServiceRequestPage({
  params,
  searchParams,
}: ServiceRequestPageProps) {
  const { token } = await params
  const query = await searchParams
  const link = await resolveServiceRequestLink(token)
  const errorMessage = getErrorMessage(query.error)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-border border-b bg-surface">
        <div className="mx-auto max-w-4xl px-5 py-10 md:px-8 md:py-14">
          <p className="text-sm text-muted-foreground">
            {link.store.name} / Service request
          </p>
          <h1 className="mt-3 max-w-3xl font-semibold text-4xl leading-tight md:text-5xl">
            Request a service
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground leading-7">
            Select the services you need, then submit your contact details. The
            business will confirm pickup, timing, and payment.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-8 px-5 py-10 md:px-8">
        {query.requested ? (
          <div className="border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
            Request received. Tracking token:{" "}
            <span className="font-semibold">{query.requested}</span>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="border border-destructive/20 bg-destructive/10 p-5 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <form action={submitServiceRequest} className="grid gap-6">
          <input type="hidden" name="token" value={token} />

          <div className="grid gap-4 rounded-lg border border-border bg-background p-5">
            <h2 className="text-lg font-semibold tracking-tight">Services</h2>
            <div className="grid gap-4">
              {link.items.map((item) => {
                const defaultVariant =
                  item.variants.find((variant) => variant.isDefault) ??
                  item.variants[0]

                return (
                  <div
                    key={item.id}
                    className="grid gap-3 border border-border p-4 md:grid-cols-[1fr_160px_110px]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.category ?? "Service"} ·{" "}
                        {defaultVariant
                          ? formatMinorMoney(
                              defaultVariant.priceMinor,
                              link.store.currencyCode,
                            )
                          : "Price unavailable"}
                      </p>
                      {item.description ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    <select
                      name={`variant:${item.id}`}
                      className="h-10 border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                      defaultValue={defaultVariant?.id ?? ""}
                    >
                      {item.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.name} ·{" "}
                          {formatMinorMoney(
                            variant.priceMinor,
                            link.store.currencyCode,
                          )}
                        </option>
                      ))}
                    </select>
                    <input
                      name={`quantity:${item.id}`}
                      className="h-10 border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary"
                      min={0}
                      inputMode="numeric"
                      type="number"
                      placeholder="Qty"
                    />
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-border bg-background p-5">
            <h2 className="text-lg font-semibold tracking-tight">
              Your details
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                name="customerName"
                className="h-11 border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary"
                placeholder="Enter your name"
                required
              />
              <input
                name="customerPhone"
                className="h-11 border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary"
                placeholder="Enter your phone number"
              />
            </div>
            <input
              name="customerEmail"
              className="h-11 border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary"
              placeholder="Enter your email address"
              type="email"
            />
            <textarea
              name="notes"
              className="min-h-[108px] border border-border bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary"
              placeholder="Pickup address, preferred time, or special instructions"
            />
          </div>

          <button
            type="submit"
            className="h-11 rounded-3xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/80"
          >
            Submit request
          </button>
        </form>
      </section>
    </main>
  )
}
