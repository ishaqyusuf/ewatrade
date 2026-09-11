import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  createStoreConversationPrivacyRequest,
  getStoreConversationPrivacyRequest,
} from "@ewatrade/db/queries"
import { enqueueStoreConversationPrivacyRequest } from "@ewatrade/jobs"
import {
  storeConversationAccountPrivacyRequestInputSchema,
  storeConversationGuestPrivacyRequestInputSchema,
  storeConversationPrivacyRequestStatusInputSchema,
} from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import { requireStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"
import {
  STORE_CONVERSATION_GUEST_COOKIE,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"

function errorResponse(error: unknown) {
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
      { code: "INVALID_INPUT", message: "Choose valid privacy options." },
      { status: 400 },
    )
  }
  return NextResponse.json(
    { code: "INTERNAL_SERVER_ERROR", message: "Privacy request unavailable." },
    { status: 500 },
  )
}

export async function GET(request: NextRequest) {
  const credentialToken = request.cookies.get(
    STORE_CONVERSATION_GUEST_COOKIE,
  )?.value
  const accountAccess = request.nextUrl.searchParams.get("access") === "account"
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
    const input = storeConversationPrivacyRequestStatusInputSchema.parse({
      conversationId: request.nextUrl.searchParams.get("conversationId"),
      privacyRequestId: request.nextUrl.searchParams.get("privacyRequestId"),
      publicToken: request.nextUrl.searchParams.get("publicToken"),
    })
    const privacyRequest = accountAccess
      ? await getStoreConversationPrivacyRequest(prisma, input, {
          accountUserId: (
            await requireStorefrontCustomerAccount(request.headers)
          ).user.id,
          kind: "account",
        })
      : await getStoreConversationPrivacyRequest(prisma, input, {
          credentialToken: credentialToken as string,
          kind: "guest",
        })
    return NextResponse.json(privacyRequest)
  } catch (error) {
    return errorResponse(error)
  }
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
    const { access: _access, ...requestBody } = body ?? {}
    const createPrivacyRequest = async () => {
      if (accountAccess) {
        return createStoreConversationPrivacyRequest(
          prisma,
          storeConversationAccountPrivacyRequestInputSchema.parse(requestBody),
          {
            accountUserId: (
              await requireStorefrontCustomerAccount(request.headers)
            ).user.id,
            kind: "account",
          },
        )
      }
      const input =
        storeConversationGuestPrivacyRequestInputSchema.parse(requestBody)
      return createStoreConversationPrivacyRequest(prisma, input, {
        challenge: input.challenge,
        credentialToken: credentialToken as string,
        kind: "guest",
      })
    }
    const privacyRequest = await createPrivacyRequest()
    await enqueueStoreConversationPrivacyRequest(privacyRequest.id)
    return NextResponse.json(privacyRequest)
  } catch (error) {
    return errorResponse(error)
  }
}
