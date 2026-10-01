import { prisma } from "@ewatrade/db"
import {
  getAccountLegalStatus,
  recordLegalAcceptance,
} from "@ewatrade/db/queries"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import { type NextRequest, NextResponse } from "next/server"

import { requireStorefrontCustomerAccount } from "@/lib/store-conversation-account-session"
import { requestIsSameOrigin } from "@/lib/store-conversation-cookie"

function isAcceptanceInput(value: unknown): value is {
  version: string
  acceptedTerms: true
  acknowledgedPrivacyNotice: true
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  return (
    Object.keys(input).length === 3 &&
    typeof input.version === "string" &&
    input.version.length > 0 &&
    input.version.length <= 80 &&
    input.acceptedTerms === true &&
    input.acknowledgedPrivacyNotice === true
  )
}

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const account = await requireStorefrontCustomerAccount(request.headers)
    const status = await getAccountLegalStatus(prisma, account.user.id)
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Sign in to view Terms status." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
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
  const input: unknown = await request.json().catch(() => null)
  if (!isAcceptanceInput(input)) {
    return NextResponse.json(
      {
        code: "INVALID_INPUT",
        message: "Review the current Terms and Privacy Notice.",
      },
      { status: 400 },
    )
  }
  try {
    const account = await requireStorefrontCustomerAccount(request.headers)
    const publication = currentEffectiveLegalPublication()
    if (!publication || input.version !== publication.version) {
      return NextResponse.json(
        {
          code: "LEGAL_PUBLICATION_UNAVAILABLE",
          message: "The current Terms are not effective. Reload this page.",
        },
        { status: 412 },
      )
    }
    const acceptance = await recordLegalAcceptance(prisma, {
      userId: account.user.id,
      version: publication.version,
      surface: "web",
    })
    return NextResponse.json(
      { accepted: true, version: acceptance.version },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return NextResponse.json(
      {
        code: "UNAVAILABLE",
        message: "Terms acceptance could not be recorded.",
      },
      { status: 503 },
    )
  }
}
