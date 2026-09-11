import { protectCommunicationsRecipient } from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  listGuestStoreConversationNotificationContacts,
  requestGuestStoreConversationNotificationVerification,
  revokeGuestStoreConversationNotificationContact,
} from "@ewatrade/db/queries"
import { enqueueStoreConversationNotificationVerification } from "@ewatrade/jobs"
import {
  storeConversationNotificationContactListInputSchema,
  storeConversationNotificationContactRequestInputSchema,
  storeConversationNotificationContactRevokeInputSchema,
} from "@ewatrade/service-commerce"
import { prepareStoreConversationNotificationVerification } from "@ewatrade/service-commerce/server"
import { type NextRequest, NextResponse } from "next/server"

import {
  STORE_CONVERSATION_GUEST_COOKIE,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"
import { storeConversationNotificationErrorResponse } from "@/lib/store-conversation-notification-route"

function credential(request: NextRequest) {
  return request.cookies.get(STORE_CONVERSATION_GUEST_COOKIE)?.value ?? null
}

export async function GET(request: NextRequest) {
  const credentialToken = credential(request)
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
    const input = storeConversationNotificationContactListInputSchema.parse({
      conversationId: request.nextUrl.searchParams.get("conversationId"),
      publicToken: request.nextUrl.searchParams.get("publicToken"),
    })
    return NextResponse.json(
      await listGuestStoreConversationNotificationContacts(prisma, {
        ...input,
        credentialToken,
      }),
    )
  } catch (error) {
    return storeConversationNotificationErrorResponse(
      error,
      "Notification contacts are unavailable.",
    )
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "This request is unavailable." },
      { status: 403 },
    )
  }
  const credentialToken = credential(request)
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
    const input = storeConversationNotificationContactRequestInputSchema.parse(
      await request.json(),
    )
    const verification = prepareStoreConversationNotificationVerification(
      { channel: input.channel, destination: input.destination },
      { protectDestination: protectCommunicationsRecipient },
    )
    const result = await requestGuestStoreConversationNotificationVerification(
      prisma,
      { ...input, ...verification, credentialToken },
    )
    await enqueueStoreConversationNotificationVerification(result.dispatch)
    return NextResponse.json({
      contact: result.contact,
      expiresAt: result.expiresAt,
      replayed: result.replayed,
      verificationId: result.verificationId,
    })
  } catch (error) {
    return storeConversationNotificationErrorResponse(
      error,
      "Verification could not be started.",
    )
  }
}

export async function DELETE(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "This request is unavailable." },
      { status: 403 },
    )
  }
  const credentialToken = credential(request)
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
    const input = storeConversationNotificationContactRevokeInputSchema.parse(
      await request.json(),
    )
    return NextResponse.json(
      await revokeGuestStoreConversationNotificationContact(prisma, {
        ...input,
        credentialToken,
      }),
    )
  } catch (error) {
    return storeConversationNotificationErrorResponse(
      error,
      "Notification contact could not be removed.",
    )
  }
}
