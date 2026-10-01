export type MobileAuthMode = "login" | "sign_up"

export function buildMobileOtpIdentifier(input: {
  email: string
  mode: MobileAuthMode
}) {
  return `mobile-auth:${input.mode}:${input.email.trim().toLowerCase()}`
}

export function mobileOtpIdentifiersForEmail(email: string) {
  return (["login", "sign_up"] as const).map((mode) =>
    buildMobileOtpIdentifier({ email, mode }),
  )
}
