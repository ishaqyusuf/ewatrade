import { NextResponse } from "next/server"

import { toLeadCapturePayload, waitlistSchema } from "@/lib/lead-capture"
import { blockMarketingIntakeInPreview } from "@/lib/preview-intake-guard"

export async function POST(request: Request) {
  const previewBlock = blockMarketingIntakeInPreview()
  if (previewBlock) return previewBlock

  const body = await request.json().catch(() => null)
  const result = waitlistSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { message: "Please provide your name and a valid email address." },
      { status: 400 },
    )
  }

  const [{ LeadCaptureType, prisma }, { enqueueMarketingLeadNotification }] =
    await Promise.all([import("@ewatrade/db"), import("@ewatrade/jobs")])

  const lead = await prisma.leadCapture.create({
    data: toLeadCapturePayload(LeadCaptureType.WAITLIST, result.data),
  })

  await enqueueMarketingLeadNotification({
    companyName: lead.companyName,
    email: lead.email,
    fullName: lead.fullName,
    id: lead.id,
    message: lead.message,
    phone: lead.phone,
    roleTitle: lead.roleTitle,
    type: lead.type,
  })

  return NextResponse.json({
    message: "You have been added to the waitlist.",
  })
}
