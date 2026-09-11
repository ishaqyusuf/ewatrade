import { prisma } from "@ewatrade/db"
import { confirmGuestStoreConversationNotificationContact } from "@ewatrade/db/queries"
import { storeConversationNotificationContactConfirmInputSchema } from "@ewatrade/service-commerce"
import { digestStoreConversationNotificationVerificationCode } from "@ewatrade/service-commerce/server"
import { type NextRequest, NextResponse } from "next/server"

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
  try {
    const input = storeConversationNotificationContactConfirmInputSchema.parse(
      await request.json(),
    )
    return NextResponse.json(
      await confirmGuestStoreConversationNotificationContact(prisma, {
        ...input,
        codeDigest: digestStoreConversationNotificationVerificationCode({
          code: input.code,
          verificationId: input.verificationId,
        }),
        credentialToken,
      }),
    )
  } catch (error) {
    return storeConversationNotificationErrorResponse(
      error,
      "Verification could not be completed.",
    )
  }
}
