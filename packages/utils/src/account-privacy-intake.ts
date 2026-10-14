export function isAccountPrivacyOtpSecretConfigured(value: string | undefined) {
  return (value?.trim().length ?? 0) >= 32
}

export function isAccountPrivacyEmailIntakeConfigured(
  env: Record<string, string | undefined>,
) {
  return accountPrivacyEmailIntakeFailures(env).length === 0
}

/** Operator diagnostics only; never returns secret values or changes gates. */
export function accountPrivacyEmailIntakeFailures(
  env: Record<string, string | undefined>,
) {
  const failures: string[] = []
  if (env.ACCOUNT_PRIVACY_REQUESTS_ENABLED !== "true")
    failures.push("ACCOUNT_PRIVACY_REQUESTS_ENABLED must be true.")
  if (!isAccountPrivacyOtpSecretConfigured(env.ACCOUNT_PRIVACY_OTP_SECRET))
    failures.push(
      "ACCOUNT_PRIVACY_OTP_SECRET must contain at least 32 characters after trimming.",
    )
  if (!env.RESEND_API_KEY?.trim()) failures.push("RESEND_API_KEY is required.")
  if (!env.EMAIL_FROM?.trim()) failures.push("EMAIL_FROM is required.")
  if (env.EMAIL_DELIVERY_MODE?.trim().toLowerCase() !== "live")
    failures.push(
      "EMAIL_DELIVERY_MODE must explicitly be live for verified intake.",
    )
  if (env.EMAIL_CAPTURE_FILE?.trim())
    failures.push("EMAIL_CAPTURE_FILE must be unset for verified intake.")
  return failures
}
