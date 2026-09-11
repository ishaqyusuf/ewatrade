import { prisma } from "@ewatrade/db"
import {
  listStoreConversationAccountDevices,
  revokeStoreConversationAccountDevice,
} from "@ewatrade/db/queries"
import { storeConversationAccountDeviceRevokeInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import {
  requireStorefrontCustomerAccount,
  storeConversationAccountErrorResponse,
} from "@/lib/store-conversation-account-session"
import {
  STORE_CONVERSATION_GUEST_COOKIE,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"

export async function GET(request: NextRequest) {
  try {
    const account = await requireStorefrontCustomerAccount(request.headers)
    const credentialToken = request.cookies.get(
      STORE_CONVERSATION_GUEST_COOKIE,
    )?.value
    return NextResponse.json(
      await listStoreConversationAccountDevices(prisma, {
        accountUserId: account.user.id,
        currentGuest: credentialToken
          ? { credentialToken, purpose: "WEB_DEVICE" }
          : undefined,
      }),
    )
  } catch (error) {
    return storeConversationAccountErrorResponse(error)
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
    const account = await requireStorefrontCustomerAccount(request.headers)
    const credentialToken = request.cookies.get(
      STORE_CONVERSATION_GUEST_COOKIE,
    )?.value
    const input = storeConversationAccountDeviceRevokeInputSchema.parse(
      await request.json(),
    )
    const currentDeviceId = credentialToken
      ? (
          await listStoreConversationAccountDevices(prisma, {
            accountUserId: account.user.id,
            currentGuest: { credentialToken, purpose: "WEB_DEVICE" },
          })
        ).find((device) => device.current)?.deviceId
      : undefined
    const result = await revokeStoreConversationAccountDevice(prisma, {
      ...input,
      accountUserId: account.user.id,
    })
    const response = NextResponse.json(result)
    if (currentDeviceId === result.deviceId) {
      response.cookies.delete(STORE_CONVERSATION_GUEST_COOKIE)
    }
    return response
  } catch (error) {
    return storeConversationAccountErrorResponse(error)
  }
}
