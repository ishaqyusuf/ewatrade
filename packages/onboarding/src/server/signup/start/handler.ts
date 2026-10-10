import {
  isApprovedLegalPublication,
  isSignupAvailableForLegalPublication,
} from "@ewatrade/utils/legal-approval"
import { type NextRequest, NextResponse } from "next/server"
import {
  getSignupClientAddress,
  hashSignupClient,
  startDirectSignup,
} from "../../../lib/direct-signup"
import { directSignupSchema } from "../../../lib/direct-signup-schema"
import {
  earlyAccessFailure,
  earlyAccessHeaders,
} from "../../../lib/early-access-response"
import { phoneCountry } from "../../../lib/international-phone"
import { issueOnboardingVerification } from "../../../lib/onboarding-verification"
import { blockMarketingIntakeInPreview } from "../../../lib/preview-intake-guard"

// Hosting-derived suggestion only, never an identity or authorization signal.
export function GET(request: NextRequest) {
  const country =
    process.env.VERCEL === "1"
      ? (phoneCountry(request.headers.get("x-vercel-ip-country")) ?? null)
      : null
  return NextResponse.json(
    { country },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}

// Web and native signup start here: create the setup session, then email the
// verification link. The returned token only lets this browser/device continue
// the form; account creation still requires the verified email.
export async function POST(request: NextRequest) {
  const previewBlock = blockMarketingIntakeInPreview()
  if (previewBlock) return previewBlock
  if (process.env.NEXT_PUBLIC_SIGNUP_ENABLED !== "true")
    return NextResponse.json(
      { message: "Signup is not currently available." },
      { status: 403, headers: earlyAccessHeaders },
    )
  if (!isSignupAvailableForLegalPublication(isApprovedLegalPublication()))
    return NextResponse.json(
      {
        message:
          "Signup is unavailable until the Terms and Privacy Notice are effective.",
      },
      { status: 412, headers: earlyAccessHeaders },
    )
  const parsed = directSignupSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success)
    return NextResponse.json(
      {
        message:
          parsed.error.issues[0]?.message ?? "Check your signup details.",
      },
      { status: 400, headers: earlyAccessHeaders },
    )
  try {
    const { session, data } = await startDirectSignup(parsed.data, {
      clientHash: hashSignupClient(getSignupClientAddress(request.headers)),
    })
    const verification = await issueOnboardingVerification(session, data)
    return NextResponse.json(
      {
        accessToken: session.token,
        expiresAt: session.expiresAt.toISOString(),
        ...verification,
      },
      { headers: earlyAccessHeaders },
    )
  } catch (error) {
    const failure = earlyAccessFailure(error)
    if (failure.status >= 500) console.error("[signup-start] failed", error)
    return NextResponse.json(
      { message: failure.message },
      { status: failure.status, headers: earlyAccessHeaders },
    )
  }
}
