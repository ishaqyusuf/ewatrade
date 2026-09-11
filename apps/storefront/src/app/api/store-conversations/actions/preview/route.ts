import { issueServiceCommerceCustomerActionToken } from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  previewAccountStoreConversationActionMessage,
  previewGuestStoreConversationActionMessage,
} from "@ewatrade/db/queries"
import { storeConversationQuoteActionPreviewInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import { storeConversationActionErrorResponse } from "@/lib/store-conversation-action-response"
import {
  STORE_CONVERSATION_GUEST_COOKIE,
  STORE_CONVERSATION_GUEST_COOKIE_OPTIONS,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"
import { requireStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "This request is unavailable." },
      { status: 403 },
    )
  }
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const accountAccess = body?.access === "account"
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
    const { access: _access, ...previewBody } = body ?? {}
    const input = storeConversationQuoteActionPreviewInputSchema.parse(previewBody)
    const response = NextResponse.json(
      accountAccess
        ? await previewAccountStoreConversationActionMessage(
            prisma,
            {
              ...input,
              accountUserId: (
                await requireStorefrontCustomerAccount(request.headers)
              ).user.id,
            },
            { issueCapabilityToken: issueServiceCommerceCustomerActionToken },
          )
        : await previewGuestStoreConversationActionMessage(
            prisma,
            { ...input, credentialToken: credentialToken as string },
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
    return storeConversationActionErrorResponse(error)
  }
}
