import { afterEach, expect, test } from "bun:test"
import { revokeGoogleAuthorization } from "./google-credentials"

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test("posts the token to Google's revocation endpoint", async () => {
  let request: { url: string; init: RequestInit } | undefined
  globalThis.fetch = (async (url, init) => {
    request = { url: String(url), init: init ?? {} }
    return new Response(null, { status: 200 })
  }) as typeof fetch
  await revokeGoogleAuthorization("secret-token")
  expect(request?.url).toBe("https://oauth2.googleapis.com/revoke")
  expect(request?.init.method).toBe("POST")
  expect(new URLSearchParams(String(request?.init.body)).get("token")).toBe(
    "secret-token",
  )
})

test("does not treat an unconfirmed provider response as success or leak its body", async () => {
  globalThis.fetch = (async () =>
    new Response("secret-token", { status: 400 })) as unknown as typeof fetch
  await expect(revokeGoogleAuthorization("secret-token")).rejects.toThrow(
    "Google authorization revocation is not confirmed.",
  )
})
