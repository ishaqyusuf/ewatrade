import {
  currentEffectiveLegalPublication,
  isLegalTestingEnvironment,
  isSignupAvailableForLegalPublication,
} from "@ewatrade/utils/legal-approval"
import { NextResponse } from "next/server"

export function GET() {
  const publication = currentEffectiveLegalPublication()
  const approved = Boolean(publication)
  return NextResponse.json(
    {
      acceptanceRequired: !isLegalTestingEnvironment(),
      approved,
      signupAvailable: isSignupAvailableForLegalPublication(approved),
      version: publication?.version ?? null,
      effectiveDate: publication?.effectiveDate ?? null,
      documentHash: publication?.documentHash ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
