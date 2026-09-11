import {
  StoreConversationAttachmentTransportError,
  resolveStoreConversationAttachmentCapability,
  storeConversationAttachmentErrorResponse,
} from "@ewatrade/api/store-conversation-attachments"
import { storeConversationAttachmentCapabilityInputSchema } from "@ewatrade/service-commerce"
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
    return storeConversationAttachmentErrorResponse(
      new StoreConversationAttachmentTransportError(
        "GUEST_CREDENTIAL_EXPIRED",
        "Open the Store link to continue.",
      ),
    )
  }
  try {
    const parsed = storeConversationAttachmentCapabilityInputSchema.parse(
      await request.json(),
    )
    const target = parsed.target
      ? parsed.target
      : parsed.request
        ? { kind: "existing_request" as const, request: parsed.request }
        : (() => {
            throw new StoreConversationAttachmentTransportError(
              "INVALID_INPUT",
              "Choose a Request for this attachment.",
            )
          })()
    return NextResponse.json(
      await resolveStoreConversationAttachmentCapability({
        channel: "web",
        conversationId: parsed.conversationId,
        credentialToken,
        publicToken: parsed.publicToken,
        target,
      }),
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return storeConversationAttachmentErrorResponse(error)
  }
}
