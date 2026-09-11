import {
  parseGuestStoreConversationAttachmentRequest,
  storeConversationAttachmentErrorResponse,
} from "@ewatrade/api/store-conversation-attachments"
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
  try {
    const result = await parseGuestStoreConversationAttachmentRequest(request, {
      channel: "web",
      credentialToken,
      uploadAuthorization: request.headers.get(
        "x-store-conversation-attachment-authorization",
      ),
    })
    const response = NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
      status: result.replayed ? 200 : 201,
    })
    if (credentialToken) {
      response.cookies.set(
        STORE_CONVERSATION_GUEST_COOKIE,
        credentialToken,
        STORE_CONVERSATION_GUEST_COOKIE_OPTIONS,
      )
    }
    return response
  } catch (error) {
    return storeConversationAttachmentErrorResponse(error)
  }
}
