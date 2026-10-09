import { getDashboardSignupUrl } from "@ewatrade/onboarding/lib/signup-navigation"

export type CreateStoreCta = {
  href: string
  label: string
  kind: "signup" | "contact"
}

/** Dashboard signup URL, optionally preselecting a business profile. */
export function getCreateStoreUrl(profile?: string) {
  const url = new URL(getDashboardSignupUrl())
  if (profile) url.searchParams.set("profile", profile)
  return url.toString()
}

/**
 * "Create your store" while public signup is open; otherwise the visitor
 * talks to us first.
 */
export function getCreateStoreCta(
  signupEnabled: boolean,
  profile?: string,
): CreateStoreCta {
  return signupEnabled
    ? {
        href: getCreateStoreUrl(profile),
        label: "Create your store",
        kind: "signup",
      }
    : { href: "/contact", label: "Talk to us", kind: "contact" }
}
