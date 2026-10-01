import { afterEach, beforeEach, expect, test } from "bun:test"
import { generateKeyPairSync, randomBytes } from "node:crypto"
import { decodeJwt, decodeProtectedHeader } from "jose"
import {
  appleCredentialExchangeConfigured,
  exchangeAppleAuthorizationCode,
  revokeAppleAccessToken,
  revokeAppleAuthorization,
} from "./apple-credentials"

const originalFetch = globalThis.fetch
const originalSettings = {
  teamId: process.env.APPLE_SIGN_IN_TEAM_ID,
  keyId: process.env.APPLE_SIGN_IN_KEY_ID,
  privateKey: process.env.APPLE_SIGN_IN_PRIVATE_KEY,
  encryptionKey: process.env.APPLE_TOKEN_ENCRYPTION_KEY,
}

beforeEach(() => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
  process.env.APPLE_SIGN_IN_TEAM_ID = "TESTTEAM"
  process.env.APPLE_SIGN_IN_KEY_ID = "TESTKEY"
  process.env.APPLE_SIGN_IN_PRIVATE_KEY = privateKey
    .export({
      type: "pkcs8",
      format: "pem",
    })
    .toString()
  process.env.APPLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64")
})

afterEach(() => {
  globalThis.fetch = originalFetch
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) Reflect.deleteProperty(process.env, name)
    else process.env[name] = value
  }
  restore("APPLE_SIGN_IN_TEAM_ID", originalSettings.teamId)
  restore("APPLE_SIGN_IN_KEY_ID", originalSettings.keyId)
  restore("APPLE_SIGN_IN_PRIVATE_KEY", originalSettings.privateKey)
  restore("APPLE_TOKEN_ENCRYPTION_KEY", originalSettings.encryptionKey)
})

test("Apple code exchange binds the app client and stores only an encrypted revocable refresh token", async () => {
  const requests: Array<{ url: string; body: URLSearchParams }> = []
  globalThis.fetch = (async (url, init) => {
    requests.push({
      url: String(url),
      body: new URLSearchParams(String(init?.body)),
    })
    return String(url).endsWith("/auth/token")
      ? Response.json({
          id_token: "signed-id-token",
          refresh_token: "private-refresh-token",
        })
      : new Response(null, { status: 200 })
  }) as typeof fetch

  expect(await appleCredentialExchangeConfigured()).toBe(true)
  const exchanged = await exchangeAppleAuthorizationCode(
    "one-time-code",
    "com.ewatrade.app",
  )
  expect(exchanged.idToken).toBe("signed-id-token")
  expect(exchanged.encryptedRefreshToken).not.toContain("private-refresh-token")
  expect(exchanged.encryptedRefreshToken.split(".")).toHaveLength(4)
  await revokeAppleAuthorization(
    exchanged.encryptedRefreshToken,
    "com.ewatrade.app",
  )

  expect(requests.map((request) => request.url)).toEqual([
    "https://appleid.apple.com/auth/token",
    "https://appleid.apple.com/auth/revoke",
  ])
  const exchange = requests[0]?.body
  expect(exchange?.get("grant_type")).toBe("authorization_code")
  expect(exchange?.get("client_id")).toBe("com.ewatrade.app")
  expect(exchange?.get("code")).toBe("one-time-code")
  const clientSecret = exchange?.get("client_secret") ?? ""
  expect(decodeProtectedHeader(clientSecret)).toMatchObject({
    alg: "ES256",
    kid: "TESTKEY",
  })
  expect(decodeJwt(clientSecret)).toMatchObject({
    aud: "https://appleid.apple.com",
    iss: "TESTTEAM",
    sub: "com.ewatrade.app",
  })
  expect(requests[1]?.body.get("token_type_hint")).toBe("refresh_token")
  expect(requests[1]?.body.get("token")).toBe("private-refresh-token")
})

test("Apple challenge prerequisites include a parseable signing key and encryption key", async () => {
  expect(await appleCredentialExchangeConfigured()).toBe(true)
  const configuredPrivateKey = process.env.APPLE_SIGN_IN_PRIVATE_KEY
  Reflect.deleteProperty(process.env, "APPLE_SIGN_IN_PRIVATE_KEY")
  expect(await appleCredentialExchangeConfigured()).toBe(false)
  process.env.APPLE_SIGN_IN_PRIVATE_KEY = "not-a-pem-key"
  expect(await appleCredentialExchangeConfigured()).toBe(false)
  process.env.APPLE_SIGN_IN_PRIVATE_KEY = configuredPrivateKey ?? ""
  process.env.APPLE_TOKEN_ENCRYPTION_KEY = "not-a-32-byte-key"
  expect(await appleCredentialExchangeConfigured()).toBe(false)
  process.env.APPLE_TOKEN_ENCRYPTION_KEY = `${randomBytes(32).toString("base64")}!`
  expect(await appleCredentialExchangeConfigured()).toBe(false)
})

test("Apple token exchange refuses provider failure and incomplete token pairs", async () => {
  globalThis.fetch = (async () =>
    new Response("provider-private-error", {
      status: 400,
    })) as unknown as typeof fetch
  await expect(
    exchangeAppleAuthorizationCode("invalid", "com.ewatrade.app"),
  ).rejects.toThrow("Apple authorization code exchange failed.")
  globalThis.fetch = (async () =>
    Response.json({ id_token: "signed-id-token" })) as unknown as typeof fetch
  await expect(
    exchangeAppleAuthorizationCode("one-time-code", "com.ewatrade.app"),
  ).rejects.toThrow()
})

test("revoke Apple access token posts its type hint and client identity", async () => {
  let request: { url: string; body: URLSearchParams } | undefined
  globalThis.fetch = (async (url, init) => {
    request = {
      url: String(url),
      body: new URLSearchParams(String(init?.body)),
    }
    return new Response(null, { status: 200 })
  }) as typeof fetch
  await revokeAppleAccessToken("secret-access-token", "com.ewatrade.app")
  expect(request?.url).toBe("https://appleid.apple.com/auth/revoke")
  expect(request?.body.get("client_id")).toBe("com.ewatrade.app")
  expect(request?.body.get("token_type_hint")).toBe("access_token")
  expect(request?.body.get("token")).toBe("secret-access-token")
  expect(request?.body.get("client_secret")?.split(".")).toHaveLength(3)
})

test("Apple response other than 200 remains unconfirmed", async () => {
  globalThis.fetch = (async () =>
    new Response("secret-provider-response", {
      status: 400,
    })) as unknown as typeof fetch
  await expect(
    revokeAppleAccessToken("secret-access-token", "com.ewatrade.app"),
  ).rejects.toThrow("Apple authorization revocation is not confirmed.")
})
