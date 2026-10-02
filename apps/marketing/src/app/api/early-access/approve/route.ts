import {
  deliverEarlyAccessEmails,
  earlyAccessApprovedEmail,
} from "@/lib/early-access-email"
import { parseEarlyAccessOnboardingFormData } from "@/lib/early-access-onboarding"
import { shouldPreviewEarlyAccess } from "@/lib/early-access-preview"
import {
  earlyAccessFailure,
  earlyAccessHeaders,
  earlyAccessHtml,
} from "@/lib/early-access-response"
import { approveEarlyAccess } from "@/lib/early-access-service"
import { blockMarketingIntakeInPreview } from "@/lib/preview-intake-guard"
import { getQaWebRequestOrigin } from "@/lib/qa-request-origin"
import { renderMarketingEarlyAccessConfirmationTemplate } from "@ewatrade/email"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const previewBlock = blockMarketingIntakeInPreview()
  if (previewBlock) return previewBlock
  const token = request.nextUrl.searchParams.get("token")?.trim()
  if (!token)
    return earlyAccessHtml({
      title: "Approval link missing",
      message: "Open the complete approval link from the request email.",
      status: 400,
    })
  try {
    const { lead, session } = await approveEarlyAccess(
      token,
      getQaWebRequestOrigin(request),
    )
    const data = parseEarlyAccessOnboardingFormData(session.formData)
    if (!data) throw new Error("Approved session is invalid")
    const input = {
      ...lead,
      accessUrl: data.accessUrl,
      accessExpiresAt: session.expiresAt.toISOString(),
    }
    await deliverEarlyAccessEmails(
      lead.id,
      [earlyAccessApprovedEmail(input)],
      "approval",
    )
    if (shouldPreviewEarlyAccess({ email: lead.email }))
      return earlyAccessHtml({
        title: "QA early access approved",
        message:
          "The approved setup email was sent to your tester inbox. Continue here or preview the email.",
        actionUrl: data.accessUrl,
        emailHtml: renderMarketingEarlyAccessConfirmationTemplate(input).html,
      })
    return earlyAccessHtml({
      title: "Early access approved",
      message: `The private setup link has been emailed to ${lead.email}.`,
    })
  } catch (error) {
    return earlyAccessHtml({
      title: "Approval could not be completed",
      ...earlyAccessFailure(error),
    })
  }
}

export function HEAD() {
  return new NextResponse(null, { status: 405, headers: earlyAccessHeaders })
}
