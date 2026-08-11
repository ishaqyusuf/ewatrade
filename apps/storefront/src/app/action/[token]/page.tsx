import { formatMinorMoney } from "@ewatrade/utils"
import type { Metadata } from "next"

import { trpc } from "@/trpc/server"
import { ActionClient } from "./action-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Customer action | EwaTrade",
}

export default async function CustomerActionPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const preview = await trpc.serviceCommerce.customerAction
    .query({ capabilityToken: token })
    .catch(() => ({
      available: false as const,
      recovery: "talk_to_staff" as const,
      supportToken: null,
    }))

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto grid max-w-xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <header className="grid gap-2">
          <p className="text-sm text-muted-foreground">Customer request</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Choose your next step
          </h1>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            We recheck the latest quotation, availability, policy, and business
            setup before applying an action.
          </p>
        </header>
        {preview.available ? (
          <>
            {preview.amountMinor !== null && preview.currencyCode ? (
              <p className="rounded-xl border border-border bg-muted/40 p-4 text-lg font-semibold">
                {formatMinorMoney(preview.amountMinor, preview.currencyCode)}
              </p>
            ) : null}
            <ActionClient
              capabilityToken={token}
              confirmationRequired={preview.confirmation === "required"}
              consequence={preview.consequence}
              label={preview.label}
            />
          </>
        ) : (
          <section className="grid gap-3 rounded-2xl border border-border bg-muted/40 p-5">
            <h2 className="font-semibold">This action needs an update</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              The link may have expired, the request changed, or the business
              needs to issue a fresh option. Return to the latest message or ask
              the business for help.
            </p>
            <a
              className="flex min-h-11 w-fit items-center rounded-lg border border-border px-4 py-3 text-sm font-medium"
              href={`/action/${encodeURIComponent(token)}`}
            >
              Retry
            </a>
            {preview.supportToken ? (
              <a
                className="flex min-h-11 w-fit items-center rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
                href={`/r/${encodeURIComponent(preview.supportToken)}`}
              >
                Talk to staff
              </a>
            ) : null}
          </section>
        )}
      </section>
    </main>
  )
}
