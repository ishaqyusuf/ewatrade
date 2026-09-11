import {
  StoreConversationAttachmentViewerUnavailableError,
  issueGuestStoreConversationVoiceNoteGrant,
} from "@ewatrade/api/store-conversation-attachment-viewer"
import { prisma } from "@ewatrade/db"
import { StoreConversationError } from "@ewatrade/db/queries"
import { storeConversationCustomerVoiceNoteGrantInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import {
  STORE_CONVERSATION_GUEST_COOKIE,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { message: "This request is unavailable." },
      { status: 403 },
    )
  }
  const credentialToken = request.cookies.get(
    STORE_CONVERSATION_GUEST_COOKIE,
  )?.value
  if (!credentialToken) {
    return NextResponse.json(
      { message: "Open the Store link to continue." },
      { status: 401 },
    )
  }
  try {
    const input = storeConversationCustomerVoiceNoteGrantInputSchema.parse(
      await request.json(),
    )
    return NextResponse.json(
      await issueGuestStoreConversationVoiceNoteGrant(prisma, {
        ...input,
        channel: "web",
        credentialToken,
      }),
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    if (error instanceof StoreConversationError) {
      return NextResponse.json(
        { message: error.message },
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
    if (error instanceof StoreConversationAttachmentViewerUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 503 })
    }
    return NextResponse.json(
      { message: "This voice note is currently unavailable." },
      { status: 400 },
    )
  }
}
