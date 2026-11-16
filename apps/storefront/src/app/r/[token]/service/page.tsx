import { randomUUID } from "node:crypto"
import { notFound } from "next/navigation"

import { prisma } from "@ewatrade/db"
import { getStoreEntryServiceRequestForm } from "@ewatrade/db/queries"
import { formatMinorMoney } from "@ewatrade/utils"

import { isPublicServiceUnavailable } from "@/lib/public-service-errors"
import { publicServiceDisplayName } from "@/lib/service-display"
import {
  selectedRequestOffering,
  serviceRequestFormHref,
} from "@/lib/service-request-selection"

import { ServiceRequestForm } from "./service-request-form"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{
    conversationId?: string
    clientOperationId?: string
    messageId?: string
    serviceOfferingId?: string
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
    if (isPublicServiceUnavailable(error)) notFound()
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
  if (!conversationId) notFound()
  const clientOperationId = opaqueId(query.clientOperationId) ?? randomUUID()
  const form = await loadForm(token)
  const selectedOffering = selectedRequestOffering(
    form.offerings,
    query.serviceOfferingId,
  )
  if (query.serviceOfferingId && !selectedOffering) notFound()
  const offerings = selectedOffering ? [selectedOffering] : form.offerings
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
            {selectedOffering
              ? `Request ${selectedOffering.catalogItemName}`
              : form.label}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose your services and quantities. The Store can clarify details
            or send a Quote next.
          </p>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-5 py-8 md:px-8">
        <ServiceRequestForm
          changeServiceHref={
            selectedOffering
              ? serviceRequestFormHref({ publicToken: token, conversationId })
              : null
          }
          clientOperationId={clientOperationId}
          conversationId={conversationId}
          messageId={messageId}
          offerings={offerings.map((offering) => ({
            defaultQuantity:
              selectedOffering?.id === offering.id ? "1" : undefined,
            guidance: offering.guidance ?? null,
            id: offering.id,
            name: publicServiceDisplayName(
              offering.catalogItemName,
              offering.variantName,
              offering.name,
            ),
            price:
              offering.pricingPolicy === "fixed" &&
              offering.fixedPriceMinor !== null
                ? formatMinorMoney(
                    offering.fixedPriceMinor,
                    form.store.currencyCode,
                  )
                : "Quote required",
          }))}
          publicToken={token}
          selectedOfferingId={selectedOffering?.id ?? null}
        />
      </section>
    </main>
  )
}
