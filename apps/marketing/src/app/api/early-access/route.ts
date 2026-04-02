import { NextResponse } from "next/server"

import { LeadCaptureType, prisma } from "@ewatrade/db"
import { enqueueMarketingLeadNotification } from "@ewatrade/jobs"

import { earlyAccessSchema, toLeadCapturePayload } from "@/lib/lead-capture"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const result = earlyAccessSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { message: "Please complete the form with valid details." },
      { status: 400 }
    )
  }

  const lead = await prisma.leadCapture.create({
    data: toLeadCapturePayload(LeadCaptureType.EARLY_ACCESS, result.data)
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
    message: "Your early access request has been received."
  })
}
