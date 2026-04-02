import { NextResponse } from "next/server"

import { LeadCaptureType, prisma } from "@ewatrade/db"

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

  await prisma.leadCapture.create({
    data: toLeadCapturePayload(LeadCaptureType.WAITLIST, result.data)
  })

  return NextResponse.json({
    message: "You have been added to the waitlist."
  })
}
