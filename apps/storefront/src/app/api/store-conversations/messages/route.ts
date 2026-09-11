import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  sendAccountStoreConversationText,
  sendGuestStoreConversationText,
} from "@ewatrade/db/queries"
import { storeConversationSendTextInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

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
    const { access: _access, ...messageBody } = body ?? {}
    const input = storeConversationSendTextInputSchema.parse(messageBody)
    const response = NextResponse.json(
      accountAccess
        ? await sendAccountStoreConversationText(prisma, {
            ...input,
            accountUserId: (
              await requireStorefrontCustomerAccount(request.headers)
            ).user.id,
            channel: "web",
          })
        : await sendGuestStoreConversationText(prisma, {
            ...input,
            credentialToken: credentialToken as string,
          }),
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
        {
          status:
            error.code === "GUEST_CREDENTIAL_EXPIRED"
              ? 401
              : error.code === "FORBIDDEN"
                ? 403
                : error.code === "NOT_FOUND"
                  ? 404
                  : error.code === "STORE_UNAVAILABLE"
                    ? 412
                    : 409,
        },
      )
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "Enter a valid message." },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { code: "UNAVAILABLE", message: "Your message could not be sent." },
      { status: 503 },
    )
  }
}
