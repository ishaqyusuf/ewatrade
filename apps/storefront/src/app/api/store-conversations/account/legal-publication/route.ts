import {
  currentEffectiveLegalPublication,
  isSignupAvailableForLegalPublication,
} from "@ewatrade/utils/legal-approval"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export function GET() {
  const publication = currentEffectiveLegalPublication()
  return NextResponse.json(
    {
      effective: Boolean(publication),
      signupAvailable: isSignupAvailableForLegalPublication(
        Boolean(publication),
      ),
      version: publication?.version ?? null,
      effectiveDate: publication?.effectiveDate ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
