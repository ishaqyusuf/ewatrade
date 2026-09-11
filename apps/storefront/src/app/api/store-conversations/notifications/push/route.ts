import { protectCommunicationsEndpoint } from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  registerAccountStoreConversationPushEndpoint,
  registerGuestStoreConversationPushEndpoint,
  revokeAccountStoreConversationPushEndpoint,
  revokeGuestStoreConversationPushEndpoint,
} from "@ewatrade/db/queries"
import {
  storeConversationPushEndpointInputSchema,
  storeConversationPushEndpointRevokeInputSchema,
} from "@ewatrade/service-commerce"
import {
  digestStoreConversationPushEndpoint,
  serializeStoreConversationPushEndpoint,
} from "@ewatrade/service-commerce/server"
import { type NextRequest, NextResponse } from "next/server"

import { getStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"
import {
  STORE_CONVERSATION_GUEST_COOKIE,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"
import { storeConversationNotificationErrorResponse } from "@/lib/store-conversation-notification-route"

function protectedEndpoint(
  input: ReturnType<typeof storeConversationPushEndpointInputSchema.parse>,
) {
  const serialized = serializeStoreConversationPushEndpoint(
    input.kind === "native_expo"
      ? { expoPushToken: input.expoPushToken, kind: input.kind }
      : {
          auth: input.auth,
          endpoint: input.endpoint,
          kind: input.kind,
          p256dh: input.p256dh,
        },
  )
  return {
    endpointCiphertext: protectCommunicationsEndpoint(serialized),
    endpointDigest: digestStoreConversationPushEndpoint(serialized),
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "This request is unavailable." },
      { status: 403 },
    )
  }
  try {
    const input = storeConversationPushEndpointInputSchema.parse(
      await request.json(),
    )
    const endpoint = protectedEndpoint(input)
    const account = await getStorefrontCustomerAccount(request.headers)
    if (account) {
      return NextResponse.json(
        await registerAccountStoreConversationPushEndpoint(prisma, {
          ...input,
          ...endpoint,
          accountUserId: account.user.id,
        }),
      )
    }
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
    return NextResponse.json(
      await registerGuestStoreConversationPushEndpoint(prisma, {
        ...input,
        ...endpoint,
        credentialToken,
      }),
    )
  } catch (error) {
    return storeConversationNotificationErrorResponse(
      error,
      "Push notifications could not be enabled.",
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
  try {
    const input = storeConversationPushEndpointRevokeInputSchema.parse(
      await request.json(),
    )
    const account = await getStorefrontCustomerAccount(request.headers)
    if (account) {
      return NextResponse.json(
        await revokeAccountStoreConversationPushEndpoint(prisma, {
          ...input,
          accountUserId: account.user.id,
        }),
      )
    }
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
    return NextResponse.json(
      await revokeGuestStoreConversationPushEndpoint(prisma, {
        ...input,
        credentialToken,
      }),
    )
  } catch (error) {
    return storeConversationNotificationErrorResponse(
      error,
      "Push notifications could not be disabled.",
    )
  }
}
