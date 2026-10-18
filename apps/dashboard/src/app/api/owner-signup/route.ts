import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { createBetterAuthSessionCookieHeaders } from "@ewatrade/auth"
import {
  getTrustedPrivacyNetworkSource,
  getTrustedQaNetworkSource,
} from "@ewatrade/utils/qa-network-source"
import { TRPCClientError, createTRPCClient, httpBatchLink } from "@trpc/client"
import { type NextRequest, NextResponse } from "next/server"
import superjson from "superjson"
import { z } from "zod"

const account = z.object({
  businessName: z.string().trim().min(1).max(120),
  requestedSlug: z.string().min(2).max(40),
  name: z.string().trim().min(1).max(120),
  ageBand: z.enum(["AGE_13_TO_15", "AGE_16_TO_17", "ADULT"]),
})
const legal = {
  legalVersion: z.string().min(1).max(64).optional(),
  acceptedTerms: z.literal(true),
  acknowledgedPrivacyNotice: z.literal(true),
}
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/)
const emailAccount = account.extend({
  email: z.email(),
  phone: phone.optional(),
})
const googleAccount = account.extend({
  name: account.shape.name.optional(),
  phone: phone.optional(),
})
const code = z.string().regex(/^\d{6}$/)
const requestSchema = z.discriminatedUnion("action", [
  emailAccount
    .extend({ action: z.literal("request_email"), ...legal })
    .strict(),
  emailAccount.extend({ action: z.literal("verify_email"), code }).strict(),
  account
    .extend({
      action: z.literal("request_phone"),
      phone,
      contactEmail: z.email().optional(),
      ...legal,
    })
    .strict(),
  z.object({ action: z.literal("verify_phone"), phone, code }).strict(),
  googleAccount
    .extend({
      action: z.literal("google"),
      idToken: z.string().min(20).max(16000),
      ...legal,
    })
    .strict(),
])

function api(request: NextRequest) {
  const origin = (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:3095"
  ).replace(/\/$/, "")
  const internalKey = process.env.INTERNAL_API_KEY?.trim()
  const source = {
    env: process.env,
    getHeader: (name: string) => request.headers.get(name),
  }
  const clientAddress =
    getTrustedPrivacyNetworkSource(source) ?? getTrustedQaNetworkSource(source)
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${origin}/api/trpc`,
        transformer: superjson,
        headers: () => ({
          "x-trpc-source": "web-owner-signup",
          ...(internalKey && clientAddress
            ? {
                "x-ewatrade-client-ip": clientAddress,
                "x-internal-key": internalKey,
              }
            : {}),
        }),
      }),
    ],
  })
}

function failure(error: unknown) {
  const status =
    error instanceof TRPCClientError ? (error.data?.httpStatus ?? 502) : 502
  return NextResponse.json(
    {
      message:
        error instanceof TRPCClientError
          ? error.message
          : "Signup could not connect. Please try again.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  )
}

export async function GET(request: NextRequest) {
  const client = api(request)
  try {
    if (request.nextUrl.searchParams.has("slug")) {
      const slug = request.nextUrl.searchParams.get("slug") ?? ""
      const emailDomain =
        request.nextUrl.searchParams.get("emailDomain") ?? undefined
      const result = await client.auth.storeLinkAvailability.query({
        slug,
        emailDomain,
      })
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      })
    }
    const [publication, phone] = await Promise.all([
      client.auth.legalPublication.query(),
      client.auth.phoneOtpAvailability.query(),
    ])
    return NextResponse.json(
      {
        publication,
        phoneEnabled: phone.enabled,
        googleClientId:
          process.env.GOOGLE_WEB_CLIENT_ID?.split(",")[0]?.trim() ??
          process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
          null,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  let sameOrigin = false
  try {
    sameOrigin = Boolean(origin && new URL(origin).host === host)
  } catch {
    /* Malformed origins fail closed. */
  }
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    !sameOrigin
  ) {
    return NextResponse.json(
      { message: "Reload this signup page and try again." },
      { status: 403 },
    )
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json(
      {
        message:
          parsed.error.issues[0]?.message ?? "Check your account details.",
      },
      { status: 400 },
    )
  const input = parsed.data
  const client = api(request)
  try {
    // Keep the original discriminant for TypeScript's input narrowing.
    const value = parsed.data
    if (value.action === "request_email") {
      const { action: _, ...fields } = value
      const result = await client.auth.requestMobileOwnerOtp.mutate({
        ...fields,
        mode: "sign_up",
      })
      return NextResponse.json(
        {
          sent: true,
          ...(process.env.NODE_ENV !== "production"
            ? { devCode: result.devCode }
            : {}),
        },
        { headers: { "Cache-Control": "no-store" } },
      )
    }
    if (value.action === "request_phone") {
      const { action: _, ...fields } = value
      const result = await client.auth.requestPhoneOtp.mutate({
        ...fields,
        mode: "sign_up",
      })
      return NextResponse.json(
        {
          sent: true,
          ...(process.env.NODE_ENV !== "production"
            ? { devCode: result.devCode }
            : {}),
        },
        { headers: { "Cache-Control": "no-store" } },
      )
    }
    const result =
      value.action === "verify_email"
        ? await client.auth.verifyMobileOwnerOtp.mutate({
            ...emailAccount.parse(input),
            code: value.code,
            mode: "sign_up",
          })
        : value.action === "verify_phone"
          ? await client.auth.verifyPhoneOtp.mutate({
              phone: value.phone,
              code: value.code,
              mode: "sign_up",
            })
          : await client.auth.verifyMobileGoogle.mutate({
              ...googleAccount.parse(value),
              idToken: value.idToken,
              legalVersion: value.legalVersion,
              acceptedTerms: true,
              acknowledgedPrivacyNotice: true,
              mode: "sign_up",
            })
    const response = NextResponse.json(
      { success: true, redirect: "/setup" },
      { headers: { "Cache-Control": "no-store" } },
    )
    for (const cookie of createBetterAuthSessionCookieHeaders({
      token: result.token,
      expiresAt: new Date(result.expiresAt),
    }))
      response.headers.append("Set-Cookie", cookie)
    if (result.tenant?.slug) {
      response.cookies.set("ewatrade.active_tenant_slug", result.tenant.slug, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 365 * 86400,
      })
      response.cookies.delete("ewatrade.active_store_id")
      response.cookies.delete("ewatrade.inventory_scope")
    }
    return response
  } catch (error) {
    return failure(error)
  }
}
