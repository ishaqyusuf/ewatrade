"use server"

import { storeConversationServiceContinuationSchema } from "@ewatrade/service-commerce"
import { cookies, headers } from "next/headers"
import { notFound, redirect } from "next/navigation"

import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  getStoreEntryServiceRequestForm,
  startStoreConversationServiceRequest,
  submitStoreConversationServiceRequest,
} from "@ewatrade/db/queries"

import { isPublicServiceUnavailable } from "@/lib/public-service-errors"
import { getStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"
import { STORE_CONVERSATION_GUEST_COOKIE } from "@/lib/store-conversation-cookie"

function value(data: FormData, key: string) {
  const result = data.get(key)
  return typeof result === "string" ? result.trim() : ""
}

export async function submitStoreConversationServiceAction(data: FormData) {
  const existingMessageId = value(data, "messageId")
  const clientOperationId = value(data, "clientOperationId")
  const selectedOfferingId = value(data, "serviceOfferingId")
  const parsed = storeConversationServiceContinuationSchema.safeParse({
    conversationId: value(data, "conversationId"),
    customerEmail: value(data, "customerEmail").toLowerCase() || undefined,
    customerName: value(data, "customerName"),
    customerPhone: value(data, "customerPhone") || undefined,
    details: value(data, "details") || undefined,
    messageId: existingMessageId || clientOperationId,
    publicToken: value(data, "publicToken"),
  })
  if (!parsed.success) notFound()
  const input = parsed.data
  const selectionQuery = selectedOfferingId
    ? `&serviceOfferingId=${encodeURIComponent(selectedOfferingId)}`
    : ""
  const returnTo = `/r/${encodeURIComponent(input.publicToken)}/service?conversationId=${encodeURIComponent(input.conversationId)}&${existingMessageId ? `messageId=${encodeURIComponent(existingMessageId)}` : `clientOperationId=${encodeURIComponent(clientOperationId)}`}${selectionQuery}`
  const credentialToken = (await cookies()).get(
    STORE_CONVERSATION_GUEST_COOKIE,
  )?.value
  const account = existingMessageId
    ? null
    : await getStorefrontCustomerAccount(await headers())
  if (!credentialToken && !account) {
    redirect(
      `/r/${encodeURIComponent(input.publicToken)}?recovery=session${selectionQuery}`,
    )
  }
  try {
    const form = await getStoreEntryServiceRequestForm(prisma, {
      publicToken: input.publicToken,
    })
    // Match bootstrap: signed-in customers without a linked conversation can
    // still use their independently authorized guest session. The command
    // rechecks the selected principal; this lookup grants no write authority.
    const accountAccess = account
      ? await prisma.storeConversationAccountAccess.findFirst({
          where: {
            accountUserId: account.user.id,
            conversationId: input.conversationId,
            storeId: form.storeId,
            tenantId: form.tenantId,
            status: "ACTIVE",
          },
          select: { id: true },
        })
      : null
    if (!credentialToken && !accountAccess)
      redirect(
        `/r/${encodeURIComponent(input.publicToken)}?recovery=session${selectionQuery}`,
      )
    const lines = form.offerings.flatMap((offering) => {
      const quantity = value(data, `quantity:${offering.id}`)
      return quantity ? [{ offeringId: offering.id, quantity }] : []
    })
    if (lines.length === 0) redirect(`${returnTo}&error=items`)
    const request = {
      ...input,
      lines,
    }
    if (existingMessageId && credentialToken)
      await submitStoreConversationServiceRequest(prisma, {
        ...request,
        credentialToken,
      })
    else
      await startStoreConversationServiceRequest(prisma, {
        ...request,
        ...(account && accountAccess
          ? { accountUserId: account.user.id }
          : { credentialToken }),
        clientOperationId,
      })
  } catch (error) {
    if (
      isPublicServiceUnavailable(error) ||
      error instanceof StoreConversationError
    ) {
      redirect(`${returnTo}&error=invalid`)
    }
    throw error
  }
  redirect(`/r/${encodeURIComponent(input.publicToken)}?request=service`)
}
