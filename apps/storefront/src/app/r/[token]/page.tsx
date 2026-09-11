import { StoreConversationWeb } from "@/components/store-conversations/store-conversation-web"
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
  return (
    <StoreConversationWeb
      publicToken={token}
      storeName={entryPoint.storeName}
    />
  )
}
