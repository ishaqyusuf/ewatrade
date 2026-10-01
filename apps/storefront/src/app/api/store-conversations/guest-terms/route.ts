import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  acceptGuestStoreConversationTerms,
  getGuestStoreConversationTermsStatus,
} from "@ewatrade/db/queries"
import { type NextRequest, NextResponse } from "next/server"

import {
  STORE_CONVERSATION_GUEST_COOKIE,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"

export const dynamic = "force-dynamic"

function guestCredential(request: NextRequest) {
  const credentialToken = request.cookies.get(
    STORE_CONVERSATION_GUEST_COOKIE,
  )?.value
  if (!credentialToken) {
    throw new StoreConversationError(
      "GUEST_CREDENTIAL_EXPIRED",
      "Start again from the Store link.",
    )
  }
  return credentialToken
}

function failure(error: unknown) {
  if (error instanceof StoreConversationError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.code === "GUEST_CREDENTIAL_EXPIRED" ? 401 : 409 },
    )
  }
  return NextResponse.json(
    { code: "UNAVAILABLE", message: "Terms status is unavailable." },
    { status: 503 },
  )
}

export async function GET(request: NextRequest) {
  try {
    const result = await getGuestStoreConversationTermsStatus(prisma, {
      credentialToken: guestCredential(request),
      purpose: "WEB_DEVICE",
    })
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return failure(error)
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
    const credentialToken = guestCredential(request)
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (
      !body ||
      body.acceptedTerms !== true ||
      typeof body.version !== "string" ||
      body.version.trim().length < 1 ||
      body.version.length > 64 ||
      Object.keys(body).some(
        (key) => key !== "acceptedTerms" && key !== "version",
      )
    ) {
      return NextResponse.json(
        { code: "INVALID_INPUT", message: "Review the current Terms." },
        { status: 400 },
      )
    }
    const result = await acceptGuestStoreConversationTerms(prisma, {
      acceptedTerms: true,
      credentialToken,
      purpose: "WEB_DEVICE",
      version: body.version.trim(),
    })
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return failure(error)
  }
}
