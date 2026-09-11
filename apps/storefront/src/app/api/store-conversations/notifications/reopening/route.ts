import { prisma } from "@ewatrade/db"
import {
  subscribeAccountStoreConversationReopening,
  subscribeGuestStoreConversationReopening,
} from "@ewatrade/db/queries"
import { storeConversationNotifyWhenAvailableInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import { getStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"
import {
  STORE_CONVERSATION_GUEST_COOKIE,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"
import { storeConversationNotificationErrorResponse } from "@/lib/store-conversation-notification-route"

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "This request is unavailable." },
      { status: 403 },
    )
  }
  try {
    const input = storeConversationNotifyWhenAvailableInputSchema.parse(
      await request.json(),
    )
    const account = await getStorefrontCustomerAccount(request.headers)
    if (account) {
      return NextResponse.json(
        await subscribeAccountStoreConversationReopening(prisma, {
          ...input,
          accountUserId: account.user.id,
        }),
      )
    }
    const credentialToken = request.cookies.get(
      STORE_CONVERSATION_GUEST_COOKIE,
    )?.value
    if (!credentialToken) {
      return NextResponse.json(
        {
          code: "GUEST_CREDENTIAL_EXPIRED",
          message: "Start from the Store link.",
        },
        { status: 401 },
      )
    }
    return NextResponse.json(
      await subscribeGuestStoreConversationReopening(prisma, {
        ...input,
        credentialToken,
      }),
    )
  } catch (error) {
    return storeConversationNotificationErrorResponse(
      error,
      "Reopening notification could not be saved.",
    )
  }
}
