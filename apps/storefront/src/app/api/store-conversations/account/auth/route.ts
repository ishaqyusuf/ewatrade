import { auth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import { storeConversationCustomerAccountAuthInputSchema } from "@ewatrade/service-commerce"
import {
  assertLegalVersionHash,
  resolveLegalSignupChoice,
} from "@ewatrade/utils/legal-approval"
import { type NextRequest, NextResponse } from "next/server"

import { requestIsSameOrigin } from "@/lib/store-conversation-cookie"

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "This request is unavailable." },
      { status: 403 },
    )
  }
  const parsed = storeConversationCustomerAccountAuthInputSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_INPUT", message: "Review your account details." },
      { status: 400 },
    )
  }
  const {
    acceptedTerms,
    acknowledgedPrivacyNotice,
    email,
    legalVersion,
    mode,
    name,
    password,
  } = parsed.data
  let legalAcceptance: ReturnType<typeof resolveLegalSignupChoice> = null
  if (mode === "sign_up") {
    try {
      legalAcceptance = resolveLegalSignupChoice({
        acceptedTerms,
        acknowledgedPrivacyNotice,
        legalVersion,
      })
      if (legalAcceptance) {
        const existing = await prisma.legalAcceptance.findFirst({
          where: { version: legalAcceptance.version },
          select: { documentHash: true },
        })
        assertLegalVersionHash(
          existing?.documentHash,
          legalAcceptance.documentHash,
        )
      }
    } catch {
      return NextResponse.json(
        {
          code: "LEGAL_PUBLICATION_UNAVAILABLE",
          message:
            "Account creation needs the current Terms and Privacy Notice. Reload and try again.",
        },
        { status: 412 },
      )
    }
    const existingAccount = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    })
    if (existingAccount) {
      return NextResponse.json(
        {
          code: "ACCOUNT_ALREADY_EXISTS",
          message:
            "An account with this email already exists. Sign in instead.",
        },
        { status: 409 },
      )
    }
  }
  const result = await (mode === "sign_up"
    ? auth.api.signUpEmail({
        body: { email, name: name ?? email, password },
        headers: request.headers,
      })
    : auth.api.signInEmail({
        body: { email, password },
        headers: request.headers,
      })
  ).catch(() => null)
  if (!result?.user?.id) {
    return NextResponse.json(
      {
        code: "ACCOUNT_AUTH_FAILED",
        message:
          mode === "sign_in"
            ? "Email or password is incorrect."
            : "Your account could not be created. Try again.",
      },
      { status: mode === "sign_in" ? 401 : 400 },
    )
  }
  if (mode === "sign_up" && legalAcceptance) {
    const acceptance = legalAcceptance
    const userId = result.user.id
    try {
      await prisma.$transaction(
        async (tx) => {
          const existing = await tx.legalAcceptance.findFirst({
            where: { version: acceptance.version },
            select: { documentHash: true },
          })
          assertLegalVersionHash(
            existing?.documentHash,
            acceptance.documentHash,
          )
          await tx.legalAcceptance.create({
            data: {
              documentHash: acceptance.documentHash,
              surface: "storefront",
              userId,
              version: acceptance.version,
            },
          })
        },
        { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
      )
    } catch {
      await prisma.user.delete({ where: { id: userId } }).catch(() => null)
      return NextResponse.json(
        {
          code: "ACCOUNT_AUTH_FAILED",
          message: "Your account could not be created. Try again.",
        },
        { status: 503 },
      )
    }
  }
  if (mode === "sign_up") {
    const signedIn = await auth.api
      .signInEmail({ body: { email, password }, headers: request.headers })
      .catch(() => null)
    if (signedIn?.user?.id !== result.user.id) {
      return NextResponse.json(
        {
          code: "ACCOUNT_CREATED_SIGN_IN_REQUIRED",
          message: "Your account was created. Sign in to continue.",
        },
        { status: 409 },
      )
    }
  }
  return NextResponse.json({
    account: {
      user: {
        email: result.user.email,
        id: result.user.id,
        name: result.user.name || result.user.email,
      },
    },
  })
}
