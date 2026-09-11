import { issueServiceCommerceCustomerActionToken } from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  getAccountStoreConversationMessagesAfter,
  getGuestStoreConversationMessagesAfter,
} from "@ewatrade/db/queries"
import { storeConversationMessagesAfterInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import { STORE_CONVERSATION_GUEST_COOKIE } from "@/lib/store-conversation-cookie"
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
    const publicToken = request.nextUrl.searchParams.get("publicToken")
    if (!publicToken) {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "Store link is required." },
        { status: 400 },
      )
    }
    const input = storeConversationMessagesAfterInputSchema.parse({
      actionMessageIds: request.nextUrl.searchParams.getAll("actionMessageId"),
      afterSequence: Number(
        request.nextUrl.searchParams.get("afterSequence") ?? "0",
      ),
      conversationId: request.nextUrl.searchParams.get("conversationId"),
      limit: request.nextUrl.searchParams.get("limit")
        ? Number(request.nextUrl.searchParams.get("limit"))
        : undefined,
    })
    return NextResponse.json(
      accountAccess
        ? await getAccountStoreConversationMessagesAfter(
            prisma,
            {
              ...input,
              accountUserId: (
                await requireStorefrontCustomerAccount(request.headers)
              ).user.id,
              publicToken,
            },
            { issueCapabilityToken: issueServiceCommerceCustomerActionToken },
          )
        : await getGuestStoreConversationMessagesAfter(
            prisma,
            {
              ...input,
              credentialToken: credentialToken as string,
              publicToken,
            },
            undefined,
            { issueCapabilityToken: issueServiceCommerceCustomerActionToken },
          ),
    )
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
      { code: "UNAVAILABLE", message: "New messages could not be loaded." },
      { status: 503 },
    )
  }
}
