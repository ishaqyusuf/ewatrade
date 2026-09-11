import { prisma } from "@ewatrade/db"
import { listGuestStoreConversationAccountCandidates } from "@ewatrade/db/queries"
import { storeConversationAccountCandidateListInputSchema } from "@ewatrade/service-commerce"
import { type NextRequest, NextResponse } from "next/server"

import {
  requireStorefrontCustomerAccount,
  storeConversationAccountErrorResponse,
} from "@/lib/store-conversation-account-session"
import { STORE_CONVERSATION_GUEST_COOKIE } from "@/lib/store-conversation-cookie"

export async function GET(request: NextRequest) {
  try {
    const account = await requireStorefrontCustomerAccount(request.headers)
    const credentialToken = request.cookies.get(
      STORE_CONVERSATION_GUEST_COOKIE,
    )?.value
    if (!credentialToken) {
      return NextResponse.json(
        {
          code: "GUEST_CREDENTIAL_EXPIRED",
          message: "Open the Store conversation on this browser to continue.",
        },
        { status: 401 },
      )
    }
    const input = storeConversationAccountCandidateListInputSchema.parse({
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize")
        ? Number(request.nextUrl.searchParams.get("pageSize"))
        : undefined,
    })
    return NextResponse.json(
      await listGuestStoreConversationAccountCandidates(prisma, {
        ...input,
        accountUserId: account.user.id,
        credentialToken,
      }),
    )
  } catch (error) {
    return storeConversationAccountErrorResponse(error)
  }
}
