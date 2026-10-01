import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose"
import { z } from "zod"

const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"))
const profileSchema = z.object({
  sub: z.string().min(1),
  aud: z.string().min(1),
  nonce: z.string().min(1),
  email: z.email().optional(),
  email_verified: z.union([z.boolean(), z.literal("true"), z.literal("false")]).optional(),
})

export async function verifyAppleIdToken(input: {
  idToken: string
  nonce: string
  audiences?: string[]
  keySet?: JWTVerifyGetKey
}) {
  const audiences = input.audiences ?? (process.env.APPLE_CLIENT_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean)
  if (!audiences.length) throw new Error("Apple sign-in is not configured.")
  const { payload } = await jwtVerify(input.idToken, input.keySet ?? appleKeys, {
    algorithms: ["RS256"], issuer: "https://appleid.apple.com", audience: audiences,
    requiredClaims: ["exp", "iat", "sub", "nonce"], maxTokenAge: "5m",
  })
  const profile = profileSchema.parse(payload)
  if (profile.nonce !== input.nonce) throw new Error("Apple sign-in challenge does not match.")
  if (profile.email && profile.email_verified !== true && profile.email_verified !== "true") {
    throw new Error("Apple email is not verified.")
  }
  return profile
}
