import { issueServiceCommerceCustomerActionToken } from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  getAccountStoreConversationTimeline,
  getGuestStoreConversationTimeline,
} from "@ewatrade/db/queries"
import { type NextRequest, NextResponse } from "next/server"

import {
  STORE_CONVERSATION_GUEST_COOKIE,
  STORE_CONVERSATION_GUEST_COOKIE_OPTIONS,
} from "@/lib/store-conversation-cookie"
import { requireStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"

export async function GET(request: NextRequest) {
  const accountAccess = request.nextUrl.searchParams.get("access") === "account"
  const credentialToken = request.cookies.get(
    STORE_CONVERSATION_GUEST_COOKIE,
  )?.value
  if (!accountAccess && !credentialToken) {
    return NextResponse.json(
      {
        code: "GUEST_CREDENTIAL_EXPIRED",
        message: "Start from the Store link.",
      },
      { status: 401 },
    )
  }
  try {
    const conversationId = request.nextUrl.searchParams.get("conversationId")
    const publicToken = request.nextUrl.searchParams.get("publicToken")
    const before = request.nextUrl.searchParams.get("beforeSequence")
    if (!conversationId || !publicToken) {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "Conversation is required." },
        { status: 400 },
      )
    }
    const timelineInput = {
      beforeSequence: before ? Number(before) : undefined,
      conversationId,
      publicToken,
    }
    const response = NextResponse.json(
      accountAccess
        ? await getAccountStoreConversationTimeline(
            prisma,
            {
              ...timelineInput,
              accountUserId: (
                await requireStorefrontCustomerAccount(request.headers)
              ).user.id,
            },
            { issueCapabilityToken: issueServiceCommerceCustomerActionToken },
          )
        : await getGuestStoreConversationTimeline(
            prisma,
            { ...timelineInput, credentialToken: credentialToken as string },
            undefined,
            { issueCapabilityToken: issueServiceCommerceCustomerActionToken },
          ),
    )
    if (!accountAccess && credentialToken) {
      response.cookies.set(
        STORE_CONVERSATION_GUEST_COOKIE,
        credentialToken,
        STORE_CONVERSATION_GUEST_COOKIE_OPTIONS,
      )
    }
    return response
  } catch (error) {
    if (error instanceof StoreConversationError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.code === "GUEST_CREDENTIAL_EXPIRED" ? 401 : 404 },
      )
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "The message cursor is invalid." },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { code: "UNAVAILABLE", message: "Messages could not be loaded." },
      { status: 503 },
    )
  }
}
