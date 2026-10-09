import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  earlyAccessFailure,
  earlyAccessHeaders,
} from "../../../lib/early-access-response"
import { requireApprovedSession } from "../../../lib/early-access-service"
import { issueOnboardingVerification } from "../../../lib/onboarding-verification"
import { blockMarketingIntakeInPreview } from "../../../lib/preview-intake-guard"

export async function POST(request: NextRequest) {
  const previewBlock = blockMarketingIntakeInPreview()
  if (previewBlock) return previewBlock
  const body = z
    .object({ accessToken: z.string().min(1).max(200) })
    .safeParse(await request.json().catch(() => null))
  if (!body.success)
    return NextResponse.json(
      { message: "A setup link is required." },
      { status: 400, headers: earlyAccessHeaders },
    )
  try {
    const { session, data } = await requireApprovedSession(
      body.data.accessToken,
    )
    if (data.emailVerifiedAt)
      return NextResponse.json(
        { message: "Your email is already verified." },
        { headers: earlyAccessHeaders },
      )
    return NextResponse.json(await issueOnboardingVerification(session, data), {
      headers: earlyAccessHeaders,
    })
  } catch (error) {
    const failure = earlyAccessFailure(error)
    return NextResponse.json(
      { message: failure.message },
      { status: failure.status, headers: earlyAccessHeaders },
    )
  }
}
