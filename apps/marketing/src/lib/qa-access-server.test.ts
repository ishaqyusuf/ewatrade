import { beforeAll, describe, expect, mock, test } from "bun:test"
import { NextResponse } from "next/server"

mock.module("server-only", () => ({}))

type QaAccessServer = typeof import("./qa-access-server")

let appendWebSessionCookies: QaAccessServer["appendWebSessionCookies"]
let appendClearedWebSessionCookies: QaAccessServer["appendClearedWebSessionCookies"]

beforeAll(async () => {
  process.env.API_URL = "http://127.0.0.1:3095"
  process.env.BETTER_AUTH_SECRET =
    "qa-session-response-test-secret-with-enough-entropy"
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN = "localhost"
  process.env.PLATFORM_DOMAIN = "localhost"

  const module = await import("./qa-access-server")
  appendWebSessionCookies = module.appendWebSessionCookies
  appendClearedWebSessionCookies = module.appendClearedWebSessionCookies
})

function cookieNames(response: NextResponse) {
  return response.headers
    .getSetCookie()
    .map((header) => header.slice(0, header.indexOf("=")))
}

describe("QA web session response cookies", () => {
  test("keeps the ordinary session cookie beside tenant and store context", () => {
    const response = NextResponse.json({ ok: true })

    appendWebSessionCookies(response, {
      expiresAt: new Date(Date.now() + 60_000),
      storeId: "store_test",
      tenantSlug: "tenant-test",
      token: "ordinary-session-token",
    })

    expect(cookieNames(response)).toEqual([
      "ewatrade.active_tenant_slug",
      "ewatrade.active_store_id",
      "better-auth.session_token",
      "better-auth.session_data",
    ])
  })

  test("clears the ordinary session cookie beside tenant and store context", () => {
    const response = NextResponse.json({ ok: true })

    appendClearedWebSessionCookies(response)

    expect(cookieNames(response)).toEqual([
      "ewatrade.active_tenant_slug",
      "ewatrade.active_store_id",
      "better-auth.session_token",
      "better-auth.session_data",
    ])
    expect(response.headers.getSetCookie()).toSatisfy((headers: string[]) =>
      headers.every((header) => header.includes("Max-Age=0")),
    )
  })
})
