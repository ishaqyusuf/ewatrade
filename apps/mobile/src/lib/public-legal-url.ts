const legalPaths = new Set([
  "terms",
  "privacy",
  "support",
  "delete-account",
  "billing-policy",
])

export type PublicLegalPath =
  | "terms"
  | "privacy"
  | "support"
  | "delete-account"
  | "billing-policy"

export function publicLegalUrl(
  path: PublicLegalPath,
  configuredOrigin = process.env.EXPO_PUBLIC_LEGAL_ORIGIN,
): string | null {
  if (!legalPaths.has(path) || !configuredOrigin?.trim()) return null

  try {
    const origin = new URL(configuredOrigin.trim())
    const hostname = origin.hostname.toLowerCase()
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.port ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      !hostname.includes(".") ||
      /^\d+(?:\.\d+){3}$/.test(hostname) ||
      hostname.includes(":") ||
      /\.(?:invalid|localhost|local|internal|test)$/.test(hostname)
    ) {
      return null
    }

    return new URL(`/${path}`, origin).toString()
  } catch {
    return null
  }
}
