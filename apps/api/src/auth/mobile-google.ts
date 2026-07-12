import { TRPCError } from "@trpc/server"
import { z } from "zod"

const emailSchema = z.email().transform((email) => email.trim().toLowerCase())

const googleTokenInfoSchema = z
  .object({
    aud: z.string().trim().min(1),
    email: emailSchema,
    email_verified: z.union([
      z.boolean(),
      z.literal("true"),
      z.literal("false"),
    ]),
    name: z.string().trim().optional(),
    picture: z.string().trim().optional(),
    sub: z.string().trim().min(1),
  })
  .passthrough()

type GoogleTokenInfoResponse = {
  json: () => Promise<unknown>
  ok: boolean
}

type VerifyGoogleIdTokenInput = {
  env?: NodeJS.ProcessEnv
  fetchTokenInfo?: (url: string) => Promise<GoogleTokenInfoResponse>
  idToken: string
}

function splitEnvList(value: string | undefined) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  )
}

export function getAllowedGoogleAudiences(
  env: NodeJS.ProcessEnv = process.env,
) {
  return [
    ...splitEnvList(env.GOOGLE_CLIENT_ID),
    ...splitEnvList(env.GOOGLE_WEB_CLIENT_ID),
    ...splitEnvList(env.GOOGLE_ANDROID_CLIENT_ID),
    ...splitEnvList(env.GOOGLE_IOS_CLIENT_ID),
    ...splitEnvList(env.EXPO_PUBLIC_GOOGLE_CLIENT_ID),
    ...splitEnvList(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
    ...splitEnvList(env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
    ...splitEnvList(env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  ]
}

function throwGoogleVerificationError(): never {
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "Google could not verify this sign-in. Use email code instead.",
  })
}

export async function verifyGoogleIdToken({
  env = process.env,
  fetchTokenInfo = fetch,
  idToken,
}: VerifyGoogleIdTokenInput) {
  const allowedAudiences = new Set(getAllowedGoogleAudiences(env))

  if (allowedAudiences.size === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Google sign-in is not configured yet. Use email code instead.",
    })
  }

  let response: GoogleTokenInfoResponse

  try {
    response = await fetchTokenInfo(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
        idToken,
      )}`,
    )
  } catch {
    throwGoogleVerificationError()
  }

  if (!response.ok) {
    throwGoogleVerificationError()
  }

  let tokenInfo: unknown

  try {
    tokenInfo = await response.json()
  } catch {
    throwGoogleVerificationError()
  }

  const parsedProfile = googleTokenInfoSchema.safeParse(tokenInfo)

  if (!parsedProfile.success) {
    throwGoogleVerificationError()
  }

  const profile = parsedProfile.data

  if (!allowedAudiences.has(profile.aud)) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "This Google sign-in was created for another app.",
    })
  }

  if (profile.email_verified !== true && profile.email_verified !== "true") {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Use a Google account with a verified email address.",
    })
  }

  return profile
}
