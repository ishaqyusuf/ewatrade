import { afterEach, describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import {
  clearBetterAuthSessionCookieHeaders,
  createBetterAuthSessionCookieHeaders,
} from "./index"

const original = {
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  NEXT_PUBLIC_PLATFORM_DOMAIN: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN,
  PLATFORM_DOMAIN: process.env.PLATFORM_DOMAIN,
}

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("QA-derived Better Auth session cookies", () => {
  test("uses Better Call's signed-cookie wire format", () => {
    process.env.BETTER_AUTH_SECRET =
      "test-secret-long-enough-for-cookie-signing"
    process.env.BETTER_AUTH_URL = "http://localhost:3095"
    process.env.PLATFORM_DOMAIN = "localhost:3092"
    process.env.NEXT_PUBLIC_PLATFORM_DOMAIN = "localhost:3092"

    const [sessionCookie, cacheCookie] = createBetterAuthSessionCookieHeaders({
      expiresAt: new Date(Date.now() + 60_000),
      token: "ordinary-session-token",
    })
    const encodedValue = sessionCookie
      ?.split(";", 1)[0]
      ?.split("=")
      .slice(1)
      .join("=")
    const signedValue = decodeURIComponent(encodedValue ?? "")
    const expectedSignature = createHmac(
      "sha256",
      process.env.BETTER_AUTH_SECRET,
    )
      .update("ordinary-session-token")
      .digest("base64")

    expect(sessionCookie).toContain("better-auth.session_token=")
    expect(signedValue).toBe(`ordinary-session-token.${expectedSignature}`)
    expect(sessionCookie).toContain("HttpOnly")
    expect(sessionCookie).toContain("SameSite=Lax")
    expect(cacheCookie).toContain("better-auth.session_data=")
    expect(cacheCookie).toContain("Max-Age=0")
  })

  test("clears both session token and cookie cache", () => {
    process.env.BETTER_AUTH_URL = "https://api.preview.ewatrade.test"
    process.env.PLATFORM_DOMAIN = "preview.ewatrade.test"
    process.env.NEXT_PUBLIC_PLATFORM_DOMAIN = "preview.ewatrade.test"

    const headers = clearBetterAuthSessionCookieHeaders()

    expect(headers).toHaveLength(2)
    expect(headers.every((header) => header.includes("Max-Age=0"))).toBe(true)
    expect(headers.every((header) => header.includes("Secure"))).toBe(true)
    expect(
      headers.every((header) =>
        header.includes("Domain=.preview.ewatrade.test"),
      ),
    ).toBe(true)
  })
})
