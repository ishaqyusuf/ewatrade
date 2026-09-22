import "server-only"

import {
  clearBetterAuthSessionCookieHeaders,
  createBetterAuthSessionCookieHeaders,
  getAuthCookieDomain,
} from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import {
  QaAccessError,
  exchangeQaTesterCredential,
  listQaAccessProfiles,
  revalidateQaClientAuthorization,
  revokeQaClientAuthorization,
  selectQaAccessProfile,
} from "@ewatrade/db/queries"
import {
  QA_ACCELERATOR_CONTRACT_VERSION,
  getQaAcceleratorAvailability,
  isConfiguredQaDomain,
} from "@ewatrade/utils/qa-accelerator"
import { getTrustedQaNetworkSource } from "@ewatrade/utils/qa-network-source"
import { type NextRequest, NextResponse } from "next/server"
import { getQaWebRequestOrigin } from "./qa-request-origin"

export const QA_AUTHORIZATION_COOKIE = "ewatrade.qa_authorization.v1"
export const QA_CLIENT_COOKIE = "ewatrade.qa_client.v1"

export function getQaWebClientId(request: NextRequest) {
  const existing = request.cookies.get(QA_CLIENT_COOKIE)?.value
  return existing && /^web_[A-Za-z0-9_-]{20,160}$/.test(existing)
    ? existing
    : `web_${crypto.randomUUID().replaceAll("-", "")}`
}

export function setQaWebClientCookie(
  response: NextResponse,
  input: { clientId: string; request: NextRequest },
) {
  response.cookies.set(QA_CLIENT_COOKIE, input.clientId, {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: input.request.nextUrl.protocol === "https:",
  })
}

export function qaAccessErrorResponse(error: unknown) {
  if (error instanceof QaAccessError) {
    return NextResponse.json(
      {
        category: error.category,
        message:
          error.category === "locked"
            ? "QA access is temporarily locked. Wait before trying again."
            : error.category === "unavailable"
              ? "QA access is unavailable."
              : "QA access could not be authorized.",
      },
      {
        status:
          error.category === "locked"
            ? 429
            : error.category === "unavailable"
              ? 503
              : 401,
      },
    )
  }
  return NextResponse.json(
    {
      category: "authorization_required",
      message: "QA access could not be authorized.",
    },
    { status: 401 },
  )
}

export function getQaAccessSecret() {
  const secret = process.env.QA_ACCELERATOR_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new QaAccessError("unavailable")
  }
  return secret
}

export function getQaWebAvailability(
  request: NextRequest,
  clientContractVersion?: number,
) {
  return getQaAcceleratorAvailability({
    clientContractVersion,
    env: process.env,
    origin: getQaWebRequestOrigin(request),
    platform: "web",
  })
}

export function getQaWebMutationAvailability(
  request: NextRequest,
  clientContractVersion?: number,
) {
  const deployment = getQaWebAvailability(request, clientContractVersion)
  if (!deployment.available) return deployment

  return getQaAcceleratorAvailability({
    clientContractVersion,
    env: process.env,
    origin: request.headers.get("origin"),
    platform: "web",
  })
}

export function qaAvailabilityResponse(
  availability: ReturnType<typeof getQaWebAvailability>,
) {
  if (
    !availability.available &&
    availability.category === "environment_not_allowed"
  ) {
    return new NextResponse(null, { status: 404 })
  }
  return NextResponse.json(availability, { status: 404 })
}

export function getQaAuthorizationToken(request: NextRequest) {
  return request.cookies.get(QA_AUTHORIZATION_COOKIE)?.value ?? null
}

export function setQaAuthorizationCookie(
  response: NextResponse,
  input: { expiresAt: Date; request: NextRequest; token: string },
) {
  response.cookies.set(QA_AUTHORIZATION_COOKIE, input.token, {
    expires: input.expiresAt,
    httpOnly: true,
    maxAge: Math.max(
      0,
      Math.floor((input.expiresAt.getTime() - Date.now()) / 1000),
    ),
    path: "/",
    sameSite: "lax",
    secure: input.request.nextUrl.protocol === "https:",
  })
}

export function clearQaAuthorizationCookie(
  response: NextResponse,
  request: NextRequest,
) {
  response.cookies.set(QA_AUTHORIZATION_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  })
}

export function clearQaWebClientCookie(
  response: NextResponse,
  request: NextRequest,
) {
  response.cookies.set(QA_CLIENT_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  })
}

export function appendWebSessionCookies(
  response: NextResponse,
  input: {
    expiresAt: Date
    storeId: string
    tenantSlug: string
    token: string
  },
) {
  const domain = getAuthCookieDomain() ?? undefined
  response.cookies.set("ewatrade.active_tenant_slug", input.tenantSlug, {
    domain,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: Boolean(domain),
  })
  response.cookies.set("ewatrade.active_store_id", input.storeId, {
    domain,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: Boolean(domain),
  })
  // NextResponse.cookies.set() rewrites the combined Set-Cookie header. Append
  // the hand-signed Better Auth cookies last so tenant/store cookies cannot
  // accidentally discard the ordinary session token.
  for (const cookie of createBetterAuthSessionCookieHeaders(input)) {
    response.headers.append("set-cookie", cookie)
  }
}

export function appendClearedWebSessionCookies(response: NextResponse) {
  const domain = getAuthCookieDomain() ?? undefined
  for (const name of [
    "ewatrade.active_tenant_slug",
    "ewatrade.active_store_id",
  ]) {
    response.cookies.set(name, "", {
      domain,
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: Boolean(domain),
    })
  }
  for (const cookie of clearBetterAuthSessionCookieHeaders()) {
    response.headers.append("set-cookie", cookie)
  }
}

export async function exchangeQaWebCredential(
  request: NextRequest,
  input: { clientId: string; credential: string; qaDomain: string },
) {
  if (
    !isConfiguredQaDomain(input.qaDomain, {
      EMAIL_QA_DOMAIN_ROUTES: process.env.EMAIL_QA_DOMAIN_ROUTES,
    })
  ) {
    throw new QaAccessError("authorization_required")
  }
  return exchangeQaTesterCredential(prisma, {
    clientId: input.clientId,
    clientPlatform: "web",
    credential: input.credential,
    networkSource: getTrustedQaNetworkSource({
      env: process.env,
      getHeader: (name) => request.headers.get(name),
    }),
    qaDomain: input.qaDomain,
    secret: getQaAccessSecret(),
  })
}

export async function revalidateQaWebAuthorization(request: NextRequest) {
  const token = getQaAuthorizationToken(request)
  if (!token) throw new QaAccessError("authorization_required")
  return revalidateQaClientAuthorization(prisma, {
    secret: getQaAccessSecret(),
    token,
  })
}

export async function listQaWebProfiles(request: NextRequest) {
  const token = getQaAuthorizationToken(request)
  if (!token) throw new QaAccessError("authorization_required")
  return listQaAccessProfiles(prisma, {
    secret: getQaAccessSecret(),
    token,
  })
}

export async function selectQaWebProfile(
  request: NextRequest,
  profileReference: string,
) {
  const token = getQaAuthorizationToken(request)
  if (!token) throw new QaAccessError("authorization_required")
  return selectQaAccessProfile(prisma, {
    profileReference,
    secret: getQaAccessSecret(),
    token,
    userAgent: request.headers.get("user-agent"),
  })
}

export async function revokeQaWebAuthorization(request: NextRequest) {
  const token = getQaAuthorizationToken(request)
  if (!token) return { revoked: false }
  return revokeQaClientAuthorization(prisma, {
    secret: getQaAccessSecret(),
    token,
  })
}

export { QA_ACCELERATOR_CONTRACT_VERSION }
