export type AppLockQuietSealMode =
  | "confirm"
  | "create"
  | "manage"
  | "unlock"
  | "verify-change"
  | "verify-disable"

export type AppLockQuietSealPresentation = {
  eyebrow: string
  subtitle: string
  title: string
}

export function resolveAppLockQuietSealPresentation(
  mode: AppLockQuietSealMode,
  businessName?: string,
): AppLockQuietSealPresentation {
  if (mode === "confirm") {
    return {
      eyebrow: "Confirm seal · 6 digits",
      subtitle: "Enter the same PIN again to finish protecting this phone.",
      title: "Seal it once more.",
    }
  }

  if (mode === "verify-change") {
    return {
      eyebrow: "Verify seal · 6 digits",
      subtitle: "Confirm the current PIN before changing it.",
      title: "Confirm it is you.",
    }
  }

  if (mode === "verify-disable") {
    return {
      eyebrow: "Verify seal · 6 digits",
      subtitle: "Confirm the current PIN before turning app lock off.",
      title: "Confirm it is you.",
    }
  }

  if (mode === "unlock") {
    return {
      eyebrow: "ẸwáTrade · local lock",
      subtitle: `Enter your six digit PIN to continue into ${businessName ?? "your business"}.`,
      title: "Open your market.",
    }
  }

  if (mode === "manage") {
    return {
      eyebrow: "ẸwáTrade · device seal",
      subtitle: `App lock protects ${businessName ?? "your business"} on this phone after login.`,
      title: "Your device seal.",
    }
  }

  return {
    eyebrow: "Device seal · 6 digits",
    subtitle: "A six digit PIN keeps your business private after you sign in.",
    title: "Seal this device.",
  }
}
