import { prisma } from "@ewatrade/db"
import { AccountAgeBand } from "@ewatrade/db/enums"
import {
  StoreConversationError,
  declareCustomerAccountAgeBand,
  declareGuestAgeBandForCredential,
  getCustomerAccountAgeStatus,
  getGuestAgeStatusForCredential,
} from "@ewatrade/db/queries"
import { type NextRequest, NextResponse } from "next/server"

import { requireStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"
import {
  STORE_CONVERSATION_GUEST_COOKIE,
  requestIsSameOrigin,
} from "@/lib/store-conversation-cookie"

export const dynamic = "force-dynamic"

type EligibleAgeBand =
  | typeof AccountAgeBand.AGE_13_TO_15
  | typeof AccountAgeBand.AGE_16_TO_17
  | typeof AccountAgeBand.ADULT

function parseAgeChoice(input: unknown): {
  access: "account" | "guest"
  ageBand: EligibleAgeBand
} | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (
    Object.keys(value).length !== 2 ||
    (value.access !== "account" && value.access !== "guest") ||
    (value.ageBand !== AccountAgeBand.AGE_13_TO_15 &&
      value.ageBand !== AccountAgeBand.AGE_16_TO_17 &&
      value.ageBand !== AccountAgeBand.ADULT)
  )
    return null
  return { access: value.access, ageBand: value.ageBand }
}

function guestCredential(request: NextRequest) {
  const token = request.cookies.get(STORE_CONVERSATION_GUEST_COOKIE)?.value
  if (!token) {
    throw new StoreConversationError(
      "GUEST_CREDENTIAL_EXPIRED",
      "Start again from the Store link.",
    )
  }
  return token
}

function failure(error: unknown) {
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
  return NextResponse.json(
    { code: "UNAVAILABLE", message: "Age status is unavailable." },
    { status: 503 },
  )
}

export async function GET(request: NextRequest) {
  try {
    const result =
      request.nextUrl.searchParams.get("access") === "account"
        ? await getCustomerAccountAgeStatus(
            prisma,
            (await requireStorefrontCustomerAccount(request.headers)).user.id,
          )
        : await getGuestAgeStatusForCredential(prisma, {
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
  const choice = parseAgeChoice(await request.json().catch(() => null))
  if (!choice) {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Choose an eligible age range." },
      { status: 400 },
    )
  }
  try {
    const result =
      choice.access === "account"
        ? await declareCustomerAccountAgeBand(
            prisma,
            (await requireStorefrontCustomerAccount(request.headers)).user.id,
            choice.ageBand,
          )
        : await declareGuestAgeBandForCredential(prisma, {
            ageBand: choice.ageBand,
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
