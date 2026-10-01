export function isAccountPrivacyOtpSecretConfigured(value: string | undefined) {
  return (value?.trim().length ?? 0) >= 32
}

export function isAccountPrivacyEmailIntakeConfigured(
  env: Record<string, string | undefined>,
) {
  return (
    env.ACCOUNT_PRIVACY_REQUESTS_ENABLED === "true" &&
    isAccountPrivacyOtpSecretConfigured(env.ACCOUNT_PRIVACY_OTP_SECRET) &&
    Boolean(env.RESEND_API_KEY?.trim()) &&
    Boolean(env.EMAIL_FROM?.trim()) &&
    env.EMAIL_DELIVERY_MODE?.trim().toLowerCase() === "live" &&
    !env.EMAIL_CAPTURE_FILE?.trim()
  )
}
