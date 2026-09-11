import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  acknowledgeGuestStoreConversationProgress,
  acknowledgeStoreConversationAccountProgress,
} from "@ewatrade/db/queries"
import { storeConversationReadAcknowledgementInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import { getStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"
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
    const body = (await request.json()) as Record<string, unknown>
    const publicToken =
      typeof body.publicToken === "string" ? body.publicToken : null
    if (!publicToken) {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "Store link is required." },
        { status: 400 },
      )
    }
    const input = storeConversationReadAcknowledgementInputSchema.parse({
      clientOperationId: body.clientOperationId,
      conversationId: body.conversationId,
      deliveredThroughSequence: body.deliveredThroughSequence,
      readThroughSequence: body.readThroughSequence,
    })
    const account = await getStorefrontCustomerAccount(request.headers)
    if (account) {
      return NextResponse.json(
        await acknowledgeStoreConversationAccountProgress(prisma, {
          ...input,
          accountUserId: account.user.id,
          publicToken,
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
      await acknowledgeGuestStoreConversationProgress(prisma, {
        ...input,
        credentialToken,
        publicToken,
      }),
    )
  } catch (error) {
    if (error instanceof StoreConversationError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        {
          status:
            error.code === "GUEST_CREDENTIAL_EXPIRED"
              ? 401
              : error.code === "FORBIDDEN"
                ? 403
                : error.code === "NOT_FOUND"
                  ? 404
                  : 409,
        },
      )
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "Message progress is invalid." },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { code: "UNAVAILABLE", message: "Message progress could not be saved." },
      { status: 503 },
    )
  }
}
