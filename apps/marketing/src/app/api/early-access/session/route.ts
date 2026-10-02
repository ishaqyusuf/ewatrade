import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { prisma } from "@ewatrade/db"

import {
  parseEarlyAccessOnboardingFormData,
  splitLeadFullName,
} from "@/lib/early-access-onboarding"
import { shouldPreviewEarlyAccess } from "@/lib/early-access-preview"

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim()

  if (!token) {
    return NextResponse.json(
      { message: "Missing early access token." },
      { status: 400 },
    )
  }

  const session = await prisma.onboardingSession.findUnique({
    where: { token },
    select: {
      completed: true,
      expiresAt: true,
      formData: true,
      token: true,
    },
  })

  const formData = parseEarlyAccessOnboardingFormData(session?.formData)

  if (!session || !formData) {
    return NextResponse.json(
      { message: "This early access link is invalid." },
      { status: 404 },
    )
  }

  if (session.completed) {
    return NextResponse.json(
      { message: "This early access link has already been used." },
      { status: 410 },
    )
  }

  if (session.expiresAt <= new Date()) {
    return NextResponse.json(
      { message: "This early access link has expired." },
      { status: 410 },
    )
  }

  const { firstName, lastName } = splitLeadFullName(formData.fullName)

  return NextResponse.json(
    {
      qaWorkspace: shouldPreviewEarlyAccess({ email: formData.email }),
      accessToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
      emailVerified: Boolean(formData.emailVerifiedAt),
      lead: {
        businessName: formData.companyName ?? "",
        email: formData.email,
        firstName,
        fullName: formData.fullName,
        lastName,
        phone: formData.phone ?? "",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
