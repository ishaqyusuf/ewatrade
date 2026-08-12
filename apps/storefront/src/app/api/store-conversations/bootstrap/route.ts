import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  bootstrapWebStoreConversation,
} from "@ewatrade/db/queries"
import { storeConversationBootstrapInputSchema } from "@ewatrade/service-commerce"
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
  try {
    const body = (await request.json()) as Record<string, unknown>
    const input = storeConversationBootstrapInputSchema.parse({
      publicToken: body.publicToken,
    })
    if (
      Object.keys(body).some(
        (key) => key !== "publicToken" && key !== "resetGuest",
      ) ||
      (body.resetGuest !== undefined && typeof body.resetGuest !== "boolean")
    ) {
      throw Object.assign(new Error("Invalid input"), { name: "ZodError" })
    }
    const resetGuest = body.resetGuest === true
    const currentCredential = resetGuest
      ? null
      : request.cookies.get(STORE_CONVERSATION_GUEST_COOKIE)?.value
    const result = await bootstrapWebStoreConversation(prisma, {
      credentialToken: currentCredential,
      publicToken: input.publicToken,
    })
    const response = NextResponse.json({ conversation: result.conversation })
    const responseCredential = result.credentialToken ?? currentCredential
    if (responseCredential) {
      response.cookies.set(
        STORE_CONVERSATION_GUEST_COOKIE,
        responseCredential,
        {
          ...STORE_CONVERSATION_GUEST_COOKIE_OPTIONS,
          expires: result.credentialExpiresAt,
        },
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
              : error.code === "NOT_READY"
                ? 409
                : 404,
        },
      )
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "The Store link is invalid." },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { code: "UNAVAILABLE", message: "The conversation is unavailable." },
      { status: 503 },
    )
  }
}
