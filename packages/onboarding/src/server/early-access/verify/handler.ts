import { type NextRequest, NextResponse } from "next/server"
import {
  earlyAccessFailure,
  earlyAccessHeaders,
  earlyAccessHtml,
} from "../../../lib/early-access-response"
import { verifyEarlyAccessEmail } from "../../../lib/early-access-service"
import { blockMarketingIntakeInPreview } from "../../../lib/preview-intake-guard"

export async function GET(request: NextRequest) {
  const previewBlock = blockMarketingIntakeInPreview()
  if (previewBlock) return previewBlock
  const token = request.nextUrl.searchParams.get("token")?.trim()
  if (!token)
    return earlyAccessHtml({
      title: "Verification link missing",
      message: "Open the complete link from your verification email.",
      status: 400,
    })
  try {
    const response = NextResponse.redirect(
      await verifyEarlyAccessEmail(token),
      303,
    )
    for (const [key, value] of Object.entries(earlyAccessHeaders))
      response.headers.set(key, value)
    return response
  } catch (error) {
    return earlyAccessHtml({
      title: "Email verification could not be completed",
      ...earlyAccessFailure(error),
    })
  }
}

export function HEAD() {
  return new NextResponse(null, { status: 405, headers: earlyAccessHeaders })
}
