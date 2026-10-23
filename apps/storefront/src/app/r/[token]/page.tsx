import { StoreConversationEntryAge } from "@/components/store-conversations/store-conversation-entry-age"
import { serviceOfferingHint } from "@/lib/service-request-selection"
import { prisma } from "@ewatrade/db"
import {
  CustomerChannelsError,
  getPublicCustomerEntryPoint,
} from "@ewatrade/db/queries"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ serviceOfferingId?: string }>
}

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

export default async function CustomerEntryPage({
  params,
  searchParams,
}: Props) {
  const { token } = await params
  const entryPoint = await loadEntryPoint(token)
  const query = await searchParams
  const selectedOfferingId = serviceOfferingHint(query.serviceOfferingId)
  if (query.serviceOfferingId && !selectedOfferingId) notFound()
  return (
    <StoreConversationEntryAge
      publicToken={token}
      storeName={entryPoint.storeName}
      serviceOfferingId={selectedOfferingId ?? undefined}
    />
  )
}
