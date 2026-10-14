import { createHmac } from "node:crypto"
import type { MobileAuthMode } from "./mobile-otp-identifier"

export function phoneAuthDigest(value: string) {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET
  if (!secret) throw new Error("Authentication is temporarily unavailable.")
  return createHmac("sha256", secret).update(value).digest("hex")
}

export function buildPhoneOtpIdentifier(phone: string, mode: MobileAuthMode) {
  return `phone-auth:${mode}:${phoneAuthDigest(phone.trim())}`
}

export function phoneOtpIdentifiersForPhone(phone: string) {
  return (["login", "sign_up"] as const).map((mode) =>
    buildPhoneOtpIdentifier(phone, mode),
  )
}
