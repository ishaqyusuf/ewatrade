import { prisma } from "@ewatrade/db"
import {
  CustomerChannelsError,
  getPublicCustomerEntryPoint,
} from "@ewatrade/db/queries"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ token: string }> }

async function loadEntryPoint(token: string) {
  try {
    return await getPublicCustomerEntryPoint(prisma, { publicToken: token })
  } catch (error) {
    if (error instanceof CustomerChannelsError) notFound()
    throw error
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const entryPoint = await getPublicCustomerEntryPoint(prisma, {
    publicToken: token,
  }).catch(() => null)
  return entryPoint
    ? {
        description: `Contact ${entryPoint.storeName} through an available customer channel.`,
        title: `${entryPoint.storeName} | EwaTrade`,
      }
    : { title: "Customer entry unavailable | EwaTrade" }
}

export default async function CustomerEntryPage({ params }: Props) {
  const { token } = await params
  const entryPoint = await loadEntryPoint(token)
  const canRequest = entryPoint.actions.includes("request_online")
  const canChat = entryPoint.actions.includes("chat_on_whatsapp")

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-sm text-muted-foreground">
            {entryPoint.storeName}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            How can we help?
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Choose an available channel. The business may ask for details,
            confirm availability, arrange a booking, or send a Quote before an
            Order is created.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-3xl gap-4 px-5 py-10 md:grid-cols-2 md:px-8">
        {canRequest ? (
          <a
            className="grid min-h-40 content-between rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary"
            href={`/request/${encodeURIComponent(token)}`}
          >
            <span>
              <span className="block text-lg font-semibold">
                Request online
              </span>
              <span className="mt-2 block text-sm text-muted-foreground">
                Send product or service details securely on EwaTrade.
              </span>
            </span>
            <span className="mt-6 text-sm font-medium text-primary">
              Continue on web →
            </span>
          </a>
        ) : null}
        {canChat ? (
          <a
            className="grid min-h-40 content-between rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary"
            href={`/r/${encodeURIComponent(token)}/whatsapp`}
          >
            <span>
              <span className="block text-lg font-semibold">
                Chat on WhatsApp
              </span>
              <span className="mt-2 block text-sm text-muted-foreground">
                Open the business&apos;s current WhatsApp sender with this Store
                context attached.
              </span>
            </span>
            <span className="mt-6 text-sm font-medium text-primary">
              Open WhatsApp →
            </span>
          </a>
        ) : null}
        {!canRequest && !canChat ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950 md:col-span-2">
            <h2 className="font-semibold">Channels temporarily unavailable</h2>
            <p className="mt-2 text-sm">
              This business has paused online requests. Try again later or use
              the contact details you already have.
            </p>
          </div>
        ) : null}
      </section>
    </main>
  )
}
