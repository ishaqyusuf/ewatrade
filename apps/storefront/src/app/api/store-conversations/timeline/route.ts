import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  getGuestStoreConversationTimeline,
} from "@ewatrade/db/queries"
import { type NextRequest, NextResponse } from "next/server"

import {
  STORE_CONVERSATION_GUEST_COOKIE,
  STORE_CONVERSATION_GUEST_COOKIE_OPTIONS,
} from "@/lib/store-conversation-cookie"

export async function GET(request: NextRequest) {
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
    const conversationId = request.nextUrl.searchParams.get("conversationId")
    const before = request.nextUrl.searchParams.get("beforeSequence")
    if (!conversationId) {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "Conversation is required." },
        { status: 400 },
      )
    }
    const response = NextResponse.json(
      await getGuestStoreConversationTimeline(prisma, {
        beforeSequence: before ? Number(before) : undefined,
        conversationId,
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
