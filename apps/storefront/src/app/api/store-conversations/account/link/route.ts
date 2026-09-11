import { prisma } from "@ewatrade/db"
import { linkGuestStoreConversationsToAccount } from "@ewatrade/db/queries"
import { storeConversationAccountLinkInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import {
  requireStorefrontCustomerAccount,
  storeConversationAccountErrorResponse,
} from "@/lib/store-conversation-account-session"
import {
  STORE_CONVERSATION_GUEST_COOKIE,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "This request is unavailable." },
      { status: 403 },
    )
  }
  try {
    const account = await requireStorefrontCustomerAccount(request.headers)
    const credentialToken = request.cookies.get(
      STORE_CONVERSATION_GUEST_COOKIE,
    )?.value
    if (!credentialToken) {
      return NextResponse.json(
        {
          code: "GUEST_CREDENTIAL_EXPIRED",
          message: "Open the Store conversation on this browser to continue.",
        },
        { status: 401 },
      )
    }
    const input = storeConversationAccountLinkInputSchema.parse(
      await request.json(),
    )
    return NextResponse.json(
      await linkGuestStoreConversationsToAccount(prisma, {
        ...input,
        accountUserId: account.user.id,
        credentialToken,
      }),
    )
  } catch (error) {
    return storeConversationAccountErrorResponse(error)
  }
}
