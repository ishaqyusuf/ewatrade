"use server"

import { storeConversationServiceContinuationSchema } from "@ewatrade/service-commerce"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"

import { prisma } from "@ewatrade/db"
import {
  CatalogError,
  StoreConversationError,
  getStoreEntryServiceRequestForm,
  submitStoreConversationServiceRequest,
} from "@ewatrade/db/queries"

import { STORE_CONVERSATION_GUEST_COOKIE } from "@/lib/store-conversation-cookie"

function value(data: FormData, key: string) {
  const result = data.get(key)
  return typeof result === "string" ? result.trim() : ""
}

export async function submitStoreConversationServiceAction(data: FormData) {
  const parsed = storeConversationServiceContinuationSchema.safeParse({
    conversationId: value(data, "conversationId"),
    customerEmail: value(data, "customerEmail").toLowerCase() || undefined,
    customerName: value(data, "customerName"),
    customerPhone: value(data, "customerPhone") || undefined,
    details: value(data, "details") || undefined,
    messageId: value(data, "messageId"),
    publicToken: value(data, "publicToken"),
  })
  if (!parsed.success) notFound()
  const input = parsed.data
  const returnTo = `/r/${encodeURIComponent(input.publicToken)}/service?conversationId=${encodeURIComponent(input.conversationId)}&messageId=${encodeURIComponent(input.messageId)}`
  const credentialToken = (await cookies()).get(
    STORE_CONVERSATION_GUEST_COOKIE,
  )?.value
  if (!credentialToken) {
    redirect(`/r/${encodeURIComponent(input.publicToken)}?recovery=session`)
  }
  const form = await getStoreEntryServiceRequestForm(prisma, {
    publicToken: input.publicToken,
  })
  const lines = form.offerings.flatMap((offering) => {
    const quantity = value(data, `quantity:${offering.id}`)
    return quantity ? [{ offeringId: offering.id, quantity }] : []
  })
  if (lines.length === 0) redirect(`${returnTo}&error=items`)
  try {
    await submitStoreConversationServiceRequest(prisma, {
      ...input,
      credentialToken,
      lines,
    })
  } catch (error) {
    if (
      error instanceof CatalogError ||
      error instanceof StoreConversationError
    ) {
      redirect(`${returnTo}&error=invalid`)
    }
    throw error
  }
  redirect(`/r/${encodeURIComponent(input.publicToken)}?request=service`)
}
