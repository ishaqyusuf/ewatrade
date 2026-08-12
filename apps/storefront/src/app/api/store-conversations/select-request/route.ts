import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  selectGuestStoreConversationRequest,
} from "@ewatrade/db/queries"
import { storeConversationSelectRequestInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import {
  STORE_CONVERSATION_GUEST_COOKIE,
  STORE_CONVERSATION_GUEST_COOKIE_OPTIONS,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"

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
    const input = storeConversationSelectRequestInputSchema.parse(
      await request.json(),
    )
    const response = NextResponse.json(
      await selectGuestStoreConversationRequest(prisma, {
        ...input,
        credentialToken,
      }),
    )
    response.cookies.set(
      STORE_CONVERSATION_GUEST_COOKIE,
      credentialToken,
      STORE_CONVERSATION_GUEST_COOKIE_OPTIONS,
    )
    return response
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
        { code: "INVALID_INPUT", message: "Choose a valid Request." },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { code: "UNAVAILABLE", message: "The Request could not be selected." },
      { status: 503 },
    )
  }
}
