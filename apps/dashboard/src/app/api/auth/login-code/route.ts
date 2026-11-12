import { isPaymentLoginDestination } from "@/lib/login-navigation"
import { createOwnerAuthApi, isSameOriginJsonPost } from "@/lib/owner-auth-api"
import { createBetterAuthSessionCookieHeaders } from "@ewatrade/auth"
import { TRPCClientError } from "@trpc/client"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"

const noStore = { "Cache-Control": "no-store" }
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), email: z.email() }).strict(),
  z
    .object({
      action: z.literal("verify"),
      email: z.email(),
      code: z.string().regex(/^\d{6}$/),
      next: z.string().max(4200).optional(),
    })
    .strict(),
])

function failure(error: unknown) {
  if (!(error instanceof TRPCClientError))
    return NextResponse.json(
      { error: "Sign in could not connect. Please try again." },
      { status: 502, headers: noStore },
    )
  const status = error.data?.httpStatus ?? 502
  return NextResponse.json(
    {
      error:
        status < 500 && error.message
          ? error.message
          : "Sign in failed. Please try again.",
    },
    { status, headers: noStore },
  )
}

// Email-code sign-in for owners who never set a password. It reuses the mobile
// owner code (10-minute expiry, 5 attempts, single use, per-email and per-network
// budgets). Requesting a code never looks up the account, so known and unknown
// addresses in the same policy domain get the same response.
export async function POST(request: NextRequest) {
  if (!isSameOriginJsonPost(request))
    return NextResponse.json(
      { error: "Reload this page and try again." },
      { status: 403, headers: noStore },
    )
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json(
      { error: "Enter your email address and the 6-digit code." },
      { status: 400, headers: noStore },
    )
  const client = createOwnerAuthApi(request, "web-login-code")
  const value = parsed.data
  const email = value.email.toLowerCase()
  try {
    if (value.action === "request") {
      const result = await client.auth.requestMobileOwnerOtp.mutate({
        email,
        mode: "login",
      })
      return NextResponse.json(
        {
          sent: true,
          ...(process.env.APP_ENV === "preview" &&
          process.env.VERCEL_ENV !== "production" &&
          result.previewQaCode
            ? { previewQaCode: result.previewQaCode }
            : {}),
          ...(process.env.NODE_ENV !== "production"
            ? { devCode: result.devCode }
            : {}),
        },
        { headers: noStore },
      )
    }
    const result = await client.auth.verifyMobileOwnerOtp.mutate({
      email,
      code: value.code,
      mode: "login",
    })
    if (!result.tenant && !isPaymentLoginDestination(value.next))
      return NextResponse.json(
        {
          error:
            "Your account does not have an active workspace. Contact your workspace owner or create your own store.",
        },
        { status: 403, headers: noStore },
      )
    const response = NextResponse.json(
      { success: true, dashboardUrl: "/" },
      { headers: noStore },
    )
    // A Store chosen by a previous user on this browser must not carry over.
    response.cookies.delete("ewatrade.active_store_id")
    response.cookies.delete("ewatrade.inventory_scope")
    if (result.tenant?.slug)
      response.cookies.set("ewatrade.active_tenant_slug", result.tenant.slug, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 365 * 86400,
      })
    // cookies.set()/delete() rewrite the combined Set-Cookie header, so the
    // hand-signed session cookies go last or the new sign-in is dropped.
    for (const cookie of createBetterAuthSessionCookieHeaders({
      token: result.token,
      expiresAt: new Date(result.expiresAt),
    }))
      response.headers.append("Set-Cookie", cookie)
    return response
  } catch (error) {
    return failure(error)
  }
}
