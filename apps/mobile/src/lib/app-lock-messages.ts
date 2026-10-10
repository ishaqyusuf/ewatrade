// Copy for the App lock gate (Settings 21 / 01 One Gate). Pure so the wording
// can be tested without secure storage.

export function appLockWelcomeTitle(name?: string | null) {
  const firstName = name?.trim().split(/\s+/)[0]
  return firstName ? `Welcome back, ${firstName}` : "Welcome back"
}

export function appLockOpenSubtitle(businessName?: string | null) {
  return `Enter your PIN to open ${businessName?.trim() || "your business"}`
}

export function appLockTriesLeft(
  failedAttemptCount: number | undefined,
  maxAttempts: number,
) {
  return Math.max(0, maxAttempts - (failedAttemptCount ?? 0))
}

export function appLockWrongPinMessage(triesLeft: number) {
  if (triesLeft < 1) return "That PIN didn’t match."
  return `That PIN didn’t match. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.`
}

export function appLockSecondsUntil(
  lockedUntil: string | null | undefined,
  nowMs = Date.now(),
) {
  if (!lockedUntil) return 0
  const remainingMs = new Date(lockedUntil).getTime() - nowMs
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0
  return Math.ceil(remainingMs / 1000)
}

export function appLockLockoutMessage(seconds: number) {
  return seconds > 0
    ? `Too many tries. Try again in ${seconds} s.`
    : "Try again now."
}

/** In-sentence biometric name: "fingerprint", but "Face ID" keeps its case. */
export function appLockBiometricName(label: string) {
  return /^(Face|Touch) ID$/.test(label) ? label : label.toLowerCase()
}
