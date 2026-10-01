import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  setCustomerStoreConversationBlock,
} from "@ewatrade/db/queries"
import { storeConversationCustomerBlockInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import { requireStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"
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
    const { access: _access, blocked, ...blockBody } = body ?? {}
    if (typeof blocked !== "boolean") {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "Choose block or unblock." },
        { status: 400 },
      )
    }
    const input = storeConversationCustomerBlockInputSchema.parse(blockBody)
    const principal = accountAccess
      ? {
          accountUserId: (
            await requireStorefrontCustomerAccount(request.headers)
          ).user.id,
          kind: "account" as const,
        }
      : {
          credentialToken: credentialToken as string,
          kind: "guest" as const,
          purpose: "WEB_DEVICE" as const,
        }
    return NextResponse.json(
      await setCustomerStoreConversationBlock(
        prisma,
        { ...input, blocked },
        principal,
      ),
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
        { code: "INVALID_INPUT", message: "Choose block or unblock." },
        { status: 400 },
      )
    }
    return NextResponse.json(
      {
        code: "UNAVAILABLE",
        message: "The block setting is unavailable. Try again.",
      },
      { status: 503 },
    )
  }
}
