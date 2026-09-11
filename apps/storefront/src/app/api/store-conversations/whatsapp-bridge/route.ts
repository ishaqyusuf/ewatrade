import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  StoreConversationWhatsAppBridgeError,
  issueStoreConversationWhatsAppBridge,
  projectStoreConversationWhatsAppBridgeIssue,
} from "@ewatrade/db/queries"
import { storeConversationWhatsAppBridgeIssueInputSchema } from "@ewatrade/service-commerce"
import { storeConversationWhatsAppBridgeTokenDigest } from "@ewatrade/service-commerce/server"
import { type NextRequest, NextResponse } from "next/server"

import { requireStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"
import {
  STORE_CONVERSATION_GUEST_COOKIE,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"

function errorResponse(error: unknown) {
  if (
    error instanceof StoreConversationWhatsAppBridgeError ||
    error instanceof StoreConversationError
  ) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      {
        status:
          error.code === "FORBIDDEN" ||
          error.code === "GUEST_CREDENTIAL_EXPIRED"
            ? 401
            : error.code === "NOT_FOUND" || error.code === "EXPIRED"
              ? 404
              : error.code === "NOT_READY" || error.code === "STORE_UNAVAILABLE"
                ? 412
                : 409,
      },
    )
  }
  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Start again from the Store chat." },
      { status: 400 },
    )
  }
  return NextResponse.json(
    {
      code: "UNAVAILABLE",
      message: "WhatsApp is unavailable right now. Try again from the chat.",
    },
    { status: 503 },
  )
}

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
    const { access: _access, ...issueBody } = body ?? {}
    const input =
      storeConversationWhatsAppBridgeIssueInputSchema.parse(issueBody)
    let principal: Parameters<
      typeof issueStoreConversationWhatsAppBridge
    >[1]["principal"]
    if (accountAccess) {
      principal = {
        accountUserId: (await requireStorefrontCustomerAccount(request.headers))
          .user.id,
        kind: "account",
      }
    } else {
      if (!credentialToken) {
        return NextResponse.json(
          {
            code: "GUEST_CREDENTIAL_EXPIRED",
            message: "Start from the Store link.",
          },
          { status: 401 },
        )
      }
      principal = {
        credentialToken,
        kind: "guest",
        purpose: "WEB_DEVICE",
      }
    }
    const result = await issueStoreConversationWhatsAppBridge(prisma, {
      bridgeTokenDigest: storeConversationWhatsAppBridgeTokenDigest(
        input.bridgeToken,
      ),
      clientOperationId: input.clientOperationId,
      conversationId: input.conversationId,
      principal,
      publicToken: input.publicToken,
    })
    return NextResponse.json(
      projectStoreConversationWhatsAppBridgeIssue({
        bridgeToken: input.bridgeToken,
        displayNumber: result.displayNumber,
        expiresAt: result.expiresAt,
        replayed: result.replayed,
      }),
    )
  } catch (error) {
    return errorResponse(error)
  }
}
