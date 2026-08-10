import { randomUUID } from "node:crypto"

import { Prisma, prisma } from "@ewatrade/db"
import {
  CatalogError,
  CommerceInquiryError,
  CustomerChannelsError,
  ServiceCommerceIntakeError,
  ServiceCommercePolicyError,
  resolveCustomerEntryPointIntakeContext,
  submitServiceCommerceIntake,
} from "@ewatrade/db/queries"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"

const CLIENT_COMMAND_PATTERN = /^[A-Za-z0-9:_-]{8,160}$/

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{
    command?: string
    error?: string
    requested?: string
  }>
}

function value(data: FormData, key: string) {
  const result = data.get(key)
  return typeof result === "string" ? result.trim() : ""
}

async function loadContext(token: string) {
  try {
    const context = await resolveCustomerEntryPointIntakeContext(prisma, {
      publicToken: token,
    })
    if (!context.webVerticals.service) notFound()
    return context
  } catch (error) {
    if (error instanceof CustomerChannelsError) notFound()
    throw error
  }
}

async function submit(data: FormData) {
  "use server"
  const token = value(data, "token")
  const clientCommandId = value(data, "clientCommandId")
  await loadContext(token)
  if (!CLIENT_COMMAND_PATTERN.test(clientCommandId)) {
    redirect(`/request/${encodeURIComponent(token)}?error=unavailable`)
  }
  const customerName = value(data, "customerName")
  const customerPhone = value(data, "customerPhone")
  const customerEmail = value(data, "customerEmail").toLowerCase()
  const description = value(data, "description")
  if (!customerName || !description || (!customerPhone && !customerEmail)) {
    redirect(
      `/request/${encodeURIComponent(token)}?error=details&command=${encodeURIComponent(clientCommandId)}`,
    )
  }
  const reason = value(data, "reason")
  const demandReason =
    reason === "needs_quote" || reason === "needs_availability_confirmation"
      ? reason
      : "needs_identification"
  let result: Awaited<ReturnType<typeof submitServiceCommerceIntake>>
  try {
    result = await submitServiceCommerceIntake(prisma, {
      envelope: {
        channel: "web",
        clientCommandId,
        consent: {
          contactOptIn: value(data, "contactOptIn") === "yes",
          privacyNoticeVersion: "service-commerce-public-v1",
        },
        context: { kind: "entry_point", token },
        intent: {
          customer: {
            email: customerEmail || undefined,
            name: customerName,
            phone: customerPhone || undefined,
          },
          demand: { kind: "commerce_inquiry", reason: demandReason },
          kind: "commerce_inquiry",
          lines: [
            {
              description,
              requestedQuantity: value(data, "quantity") || undefined,
            },
          ],
          summary: description,
        },
      },
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientInitializationError ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P1001", "P1002", "P2024", "P2028"].includes(error.code))
    ) {
      redirect(
        `/request/${encodeURIComponent(token)}?error=temporary&command=${encodeURIComponent(clientCommandId)}`,
      )
    }
    if (
      error instanceof CatalogError ||
      error instanceof CommerceInquiryError ||
      error instanceof CustomerChannelsError ||
      error instanceof ServiceCommerceIntakeError ||
      error instanceof ServiceCommercePolicyError
    ) {
      redirect(
        `/request/${encodeURIComponent(token)}?error=unavailable&command=${encodeURIComponent(clientCommandId)}`,
      )
    }
    throw error
  }
  if (result.status !== "accepted") {
    redirect(
      `/request/${encodeURIComponent(token)}?error=unavailable&command=${encodeURIComponent(clientCommandId)}`,
    )
  }
  redirect(`/request/${encodeURIComponent(token)}?requested=1`)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const context = await resolveCustomerEntryPointIntakeContext(prisma, {
    publicToken: token,
  }).catch(() => null)
  return context
    ? { title: "Request a product | EwaTrade" }
    : { title: "Request unavailable | EwaTrade" }
}

export default async function CustomerRequestPage({
  params,
  searchParams,
}: Props) {
  const { token } = await params
  const query = await searchParams
  await loadContext(token)
  const clientCommandId =
    query.command && CLIENT_COMMAND_PATTERN.test(query.command)
      ? query.command
      : `web:${randomUUID()}`

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-sm text-muted-foreground">Customer request</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Ask about a product
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Describe what you need. The business will identify it, confirm
            availability, or send a Quote before any Order is created.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-3xl gap-6 px-5 py-10 md:px-8">
        {query.requested ? (
          <div className="border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <h2 className="font-semibold">Request received</h2>
            <p className="mt-2 text-sm">
              The business can clarify the item, confirm availability, and send
              a Quote next.
            </p>
          </div>
        ) : null}
        {query.error ? (
          <p className="border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {query.error === "details"
              ? "Enter your name, contact details, and product description."
              : query.error === "temporary"
                ? "The request service is temporarily unavailable. Please retry."
                : "This request is unavailable right now. Return to the current business link and try again."}
          </p>
        ) : null}
        {!query.requested ? (
          <form action={submit} className="grid gap-5 border border-border p-5">
            <input name="token" type="hidden" value={token} />
            <input
              name="clientCommandId"
              type="hidden"
              value={clientCommandId}
            />
            <label className="grid gap-2 text-sm">
              What do you need?
              <textarea
                className="min-h-32 border border-border bg-background px-3 py-2"
                name="description"
                placeholder="Example: Red small handbag like the photo I sent"
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Help needed
                <select
                  className="h-11 border border-border bg-background px-3"
                  defaultValue="needs_identification"
                  name="reason"
                >
                  <option value="needs_identification">Identify product</option>
                  <option value="needs_availability_confirmation">
                    Confirm availability
                  </option>
                  <option value="needs_quote">Request a Quote</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                Quantity (optional)
                <input
                  className="h-11 border border-border bg-background px-3"
                  name="quantity"
                  placeholder="1"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                className="h-11 border border-border bg-background px-3"
                name="customerName"
                placeholder="Your name"
                required
              />
              <input
                className="h-11 border border-border bg-background px-3"
                inputMode="tel"
                name="customerPhone"
                placeholder="Phone"
              />
            </div>
            <input
              className="h-11 border border-border bg-background px-3"
              name="customerEmail"
              placeholder="Email"
              type="email"
            />
            <label className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                className="mt-1"
                name="contactOptIn"
                type="checkbox"
                value="yes"
              />
              The business may contact me about this request.
            </label>
            <p className="text-xs text-muted-foreground">
              Want to send a product photo or document? Return to the business
              entry page and choose WhatsApp.
            </p>
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
