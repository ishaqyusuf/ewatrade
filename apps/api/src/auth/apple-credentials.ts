import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { SignJWT, importPKCS8 } from "jose"
import { z } from "zod"

function setting(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error("Apple credential exchange is not configured.")
  return value
}
function encryptionKey() {
  const encoded = setting("APPLE_TOKEN_ENCRYPTION_KEY")
  const key = Buffer.from(encoded, "base64")
  if (key.length !== 32 || key.toString("base64") !== encoded)
    throw new Error(
      "Apple credential encryption key must be canonical base64 for 32 bytes.",
    )
  return key
}
async function signingKey() {
  return importPKCS8(
    setting("APPLE_SIGN_IN_PRIVATE_KEY").replaceAll("\\n", "\n"),
    "ES256",
  )
}
export async function appleCredentialExchangeConfigured() {
  try {
    setting("APPLE_SIGN_IN_TEAM_ID")
    setting("APPLE_SIGN_IN_KEY_ID")
    await signingKey()
    encryptionKey()
    return true
  } catch {
    return false
  }
}
export function encryptAppleRefreshToken(token: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  cipher.setAAD(Buffer.from("ewatrade:apple-refresh:v1"))
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ])
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".")
}
function decryptAppleRefreshToken(value: string) {
  const [version, iv, tag, ciphertext] = value.split(".")
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new Error("Invalid Apple credential envelope.")
  const cipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  )
  cipher.setAAD(Buffer.from("ewatrade:apple-refresh:v1"))
  cipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    cipher.update(Buffer.from(ciphertext, "base64url")),
    cipher.final(),
  ]).toString("utf8")
}
async function appleClientSecret(clientId: string) {
  const key = await signingKey()
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: setting("APPLE_SIGN_IN_KEY_ID") })
    .setIssuer(setting("APPLE_SIGN_IN_TEAM_ID"))
    .setSubject(clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key)
}
export async function exchangeAppleAuthorizationCode(
  code: string,
  clientId: string,
) {
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: await appleClientSecret(clientId),
      grant_type: "authorization_code",
      code,
    }),
  })
  if (!response.ok) throw new Error("Apple authorization code exchange failed.")
  const tokens = z
    .object({ refresh_token: z.string().min(1), id_token: z.string().min(1) })
    .parse(await response.json())
  return {
    encryptedRefreshToken: encryptAppleRefreshToken(tokens.refresh_token),
    idToken: tokens.id_token,
  }
}
export async function revokeAppleAuthorization(
  encryptedRefreshToken: string,
  clientId: string,
) {
  return revokeAppleToken(
    decryptAppleRefreshToken(encryptedRefreshToken),
    clientId,
    "refresh_token",
  )
}

export async function revokeAppleAccessToken(
  accessToken: string,
  clientId: string,
) {
  return revokeAppleToken(accessToken, clientId, "access_token")
}

async function revokeAppleToken(
  token: string,
  clientId: string,
  tokenTypeHint: "refresh_token" | "access_token",
) {
  const response = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: await appleClientSecret(clientId),
      token,
      token_type_hint: tokenTypeHint,
    }),
  })
  if (response.status !== 200)
    throw new Error("Apple authorization revocation is not confirmed.")
}
