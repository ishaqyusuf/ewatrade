import { NextResponse } from "next/server"

import { LeadCaptureType, prisma } from "@ewatrade/db"
import { enqueueMarketingLeadNotification } from "@ewatrade/jobs"

import { toLeadCapturePayload, waitlistSchema } from "@/lib/lead-capture"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const result = waitlistSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { message: "Please provide your name and a valid email address." },
      { status: 400 }
    )
  }

  const lead = await prisma.leadCapture.create({
    data: toLeadCapturePayload(LeadCaptureType.WAITLIST, result.data)
  })

  await enqueueMarketingLeadNotification({
    companyName: lead.companyName,
    email: lead.email,
    fullName: lead.fullName,
    id: lead.id,
    message: lead.message,
    phone: lead.phone,
    roleTitle: lead.roleTitle,
    type: lead.type
  })

  return NextResponse.json({
    message: "You have been added to the waitlist."
  })
}
