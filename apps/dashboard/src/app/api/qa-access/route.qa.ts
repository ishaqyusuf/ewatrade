import { getLoginDestination } from "@/lib/login-navigation"
import {
  createBetterAuthSessionCookieHeaders,
  getAuthCookieDomain,
} from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import {
  QaAccessError,
  authorizeQaDomain,
  listQaAccessProfiles,
  revalidateQaClientAuthorization,
  selectQaAccessProfile,
} from "@ewatrade/db/qa-access"
import {
  QA_ACCELERATOR_CONTRACT_VERSION,
  getQaAcceleratorAvailability,
  isConfiguredQaDomain,
} from "@ewatrade/utils/qa-accelerator"
import { getTrustedQaNetworkSource } from "@ewatrade/utils/qa-network-source"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"

const authorizationCookie = "ewatrade.qa_authorization.v1"
const clientCookie = "ewatrade.qa_client.v1"
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("authorize"),
      qaDomain: z.string().trim().min(3).max(253),
    })
    .strict(),
  z
    .object({
      action: z.literal("select"),
      profileReference: z.string().trim().min(32).max(160),
      next: z.string().max(2048).optional(),
    })
    .strict(),
])

function availability(request: NextRequest, mutation = false) {
  const host =
    request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim() ||
    request.headers.get("host")
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim() ||
    request.nextUrl.protocol.replace(/:$/, "")
  const origin = mutation
    ? request.headers.get("origin")
    : host
      ? `${protocol}://${host}`
      : request.nextUrl.origin
  return getQaAcceleratorAvailability({
    clientContractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
    env: process.env,
    origin,
    platform: "web",
  })
}

function unavailable(result: ReturnType<typeof availability>) {
  return !result.available && result.category === "environment_not_allowed"
    ? new NextResponse(null, { status: 404 })
    : NextResponse.json(
        {
          available: false,
          message: "QA access is unavailable in this environment.",
        },
        { status: 404 },
      )
}

function secret() {
  const value = process.env.QA_ACCELERATOR_SECRET?.trim()
  if (!value || value.length < 32) throw new QaAccessError("unavailable")
  return value
}

function errorResponse(error: unknown) {
  const category =
    error instanceof QaAccessError ? error.category : "authorization_required"
  return NextResponse.json(
    {
      message:
        category === "locked"
          ? "QA access is temporarily locked. Try again later."
          : "QA access could not be authorized. Reload the domain and try again.",
    },
    {
      status:
        category === "locked" ? 429 : category === "unavailable" ? 503 : 401,
    },
  )
}

async function access(token: string) {
  const authorization = await revalidateQaClientAuthorization(prisma, {
    secret: secret(),
    token,
  })
  const profiles = await listQaAccessProfiles(prisma, {
    secret: secret(),
    token,
  })
  return {
    qaDomain: authorization.qaDomain,
    expiresAt: authorization.expiresAt,
    profiles,
  }
}

async function getRequest(request: NextRequest) {
  const result = availability(request)
  if (!result.available) return unavailable(result)
  const token = request.cookies.get(authorizationCookie)?.value
  if (!token) return NextResponse.json({ available: true, access: null })
  try {
    return NextResponse.json({ available: true, access: await access(token) })
  } catch {
    return NextResponse.json({ available: true, access: null })
  }
}

async function postRequest(request: NextRequest) {
  const deployment = availability(request)
  if (!deployment.available) return unavailable(deployment)
  const result = availability(request, true)
  if (!result.available) return unavailable(result)
  const parsed = inputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json(
      { message: "Enter a QA domain or select an available account." },
      { status: 400 },
    )
  try {
    if (parsed.data.action === "authorize") {
      if (
        !isConfiguredQaDomain(parsed.data.qaDomain, {
          EMAIL_QA_DOMAIN_ROUTES: process.env.EMAIL_QA_DOMAIN_ROUTES,
        })
      )
        throw new QaAccessError("authorization_required")
      const existingClient = request.cookies.get(clientCookie)?.value
      const clientId =
        existingClient && /^web_[A-Za-z0-9_-]{20,160}$/.test(existingClient)
          ? existingClient
          : `web_${crypto.randomUUID().replaceAll("-", "")}`
      const authorization = await authorizeQaDomain(prisma, {
        clientId,
        clientPlatform: "web",
        qaDomain: parsed.data.qaDomain,
        networkSource: getTrustedQaNetworkSource({
          env: process.env,
          getHeader: (name) => request.headers.get(name),
        }),
      })
      const response = NextResponse.json({
        access: await access(authorization.token),
      })
      const options = {
        httpOnly: true,
        path: "/",
        sameSite: "lax" as const,
        secure: request.nextUrl.protocol === "https:",
      }
      response.cookies.set(authorizationCookie, authorization.token, {
        ...options,
        expires: authorization.authorization.expiresAt,
      })
      response.cookies.set(clientCookie, clientId, {
        ...options,
        maxAge: 30 * 24 * 60 * 60,
      })
      return response
    }
    const token = request.cookies.get(authorizationCookie)?.value
    if (!token) throw new QaAccessError("authorization_required")
    const selected = await selectQaAccessProfile(prisma, {
      profileReference: parsed.data.profileReference,
      secret: secret(),
      token,
      userAgent: request.headers.get("user-agent"),
    })
    const response = NextResponse.json({
      redirectTo: getLoginDestination(parsed.data.next),
    })
    const domain = getAuthCookieDomain() ?? undefined
    const options = {
      domain,
      httpOnly: true,
      path: "/",
      sameSite: "lax" as const,
      secure: Boolean(domain),
    }
    response.cookies.set(
      "ewatrade.active_tenant_slug",
      selected.profile.businessSlug,
      options,
    )
    response.cookies.set(
      "ewatrade.active_store_id",
      selected.profile.storeId,
      options,
    )
    for (const cookie of createBetterAuthSessionCookieHeaders({
      expiresAt: selected.expiresAt,
      token: selected.token,
    }))
      response.headers.append("Set-Cookie", cookie)
    return response
  } catch (error) {
    return errorResponse(error)
  }
}

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export async function GET(request: NextRequest) {
  return privateResponse(await getRequest(request))
}

export async function POST(request: NextRequest) {
  return privateResponse(await postRequest(request))
}
