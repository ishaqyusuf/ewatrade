import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  createWebStoreConversationTransfer,
} from "@ewatrade/db/queries"
import { storeConversationTransferCreateInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

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
  const credentialToken = request.cookies.get(
    STORE_CONVERSATION_GUEST_COOKIE,
  )?.value
  if (!credentialToken) {
    return NextResponse.json(
      { code: "GUEST_CREDENTIAL_EXPIRED", message: "Refresh the Store chat." },
      { status: 401 },
    )
  }

  try {
    const input = storeConversationTransferCreateInputSchema.parse(
      await request.json(),
    )
    const transfer = await createWebStoreConversationTransfer(prisma, {
      ...input,
      credentialToken,
    })
    const path = `/r/${encodeURIComponent(input.publicToken)}`
    const fragment = `transfer=${encodeURIComponent(transfer.transferToken)}`

    return NextResponse.json(
      {
        expiresAt: transfer.expiresAt,
        universalUrl: `${request.nextUrl.origin}${path}#${fragment}`,
      },
      { headers: { "Cache-Control": "no-store" } },
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
        { code: "INVALID_INPUT", message: "The app handoff is invalid." },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { code: "UNAVAILABLE", message: "The app handoff is unavailable." },
      { status: 503 },
    )
  }
}
