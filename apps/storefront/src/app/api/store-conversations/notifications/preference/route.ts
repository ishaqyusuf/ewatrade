import { prisma } from "@ewatrade/db"
import {
  getStoreConversationAccountNotificationPreference,
  updateStoreConversationAccountNotificationPreference,
} from "@ewatrade/db/queries"
import { storeConversationAccountNotificationPreferenceInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import { getStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"
import { requestIsSameOrigin } from "@/lib/store-conversation-cookie"
import { storeConversationNotificationErrorResponse } from "@/lib/store-conversation-notification-route"

export async function GET(request: NextRequest) {
  const account = await getStorefrontCustomerAccount(request.headers)
  if (!account) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Sign in to manage notifications." },
      { status: 401 },
    )
  }
  try {
    return NextResponse.json(
      await getStoreConversationAccountNotificationPreference(prisma, {
        accountUserId: account.user.id,
      }),
    )
  } catch (error) {
    return storeConversationNotificationErrorResponse(
      error,
      "Notification preferences are unavailable.",
    )
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "This request is unavailable." },
      { status: 403 },
    )
  }
  const account = await getStorefrontCustomerAccount(request.headers)
  if (!account) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Sign in to manage notifications." },
      { status: 401 },
    )
  }
  try {
    const input =
      storeConversationAccountNotificationPreferenceInputSchema.parse(
        await request.json(),
      )
    return NextResponse.json(
      await updateStoreConversationAccountNotificationPreference(prisma, {
        ...input,
        accountUserId: account.user.id,
      }),
    )
  } catch (error) {
    return storeConversationNotificationErrorResponse(
      error,
      "Notification preferences could not be saved.",
    )
  }
}
