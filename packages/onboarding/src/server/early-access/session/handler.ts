import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { blockMarketingIntakeInPreview } from "../../../lib/preview-intake-guard"

import { prisma } from "@ewatrade/db"

import {
  onboardingDraftSchema,
  saveApprovedOnboardingDraft,
} from "@ewatrade/db/onboarding-continuation"
import { z } from "zod"
import {
  parseEarlyAccessOnboardingFormData,
  splitLeadFullName,
} from "../../../lib/early-access-onboarding"
import { shouldPreviewEarlyAccess } from "../../../lib/early-access-preview"
import {
  earlyAccessFailure,
  earlyAccessHeaders,
} from "../../../lib/early-access-response"

export async function GET(request: NextRequest) {
  const previewBlock = blockMarketingIntakeInPreview()
  if (previewBlock) return previewBlock
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
      draft: formData.draft ?? {},
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

export async function POST(request: NextRequest) {
  const previewBlock = blockMarketingIntakeInPreview()
  if (previewBlock) return previewBlock
  const parsed = z
    .object({
      token: z.string().regex(/^ea_[A-Za-z0-9_-]{43}$/),
      draft: onboardingDraftSchema,
    })
    .strict()
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json(
      { message: "Setup draft is invalid." },
      { status: 400, headers: earlyAccessHeaders },
    )
  try {
    await saveApprovedOnboardingDraft(prisma, parsed.data)
    return NextResponse.json({ saved: true }, { headers: earlyAccessHeaders })
  } catch (error) {
    const failure = earlyAccessFailure(error)
    return NextResponse.json(
      { message: failure.message },
      { status: failure.status, headers: earlyAccessHeaders },
    )
  }
}
