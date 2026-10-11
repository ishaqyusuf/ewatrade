/**
 * Website & domain (custom domains, purchases, DNS) is not ready for launch
 * (owner, 11 Oct 2026). Local and dev keep it on for building; preview and
 * production stay off until WEBSITE_DOMAINS_LAUNCH_APPROVED=true.
 */
export function isWebsiteDomainsLaunchApproved(
  env: Partial<
    Record<
      | "APP_ENV"
      | "DEV_PROFILE"
      | "NODE_ENV"
      | "WEBSITE_DOMAINS_LAUNCH_APPROVED",
      string
    >
  > = process.env,
) {
  const production =
    env.APP_ENV === "production" || env.NODE_ENV === "production"
  if (production)
    return (
      env.APP_ENV === "production" &&
      env.DEV_PROFILE === "prod" &&
      env.NODE_ENV === "production" &&
      env.WEBSITE_DOMAINS_LAUNCH_APPROVED === "true"
    )
  return (
    ["local", "dev"].includes(env.APP_ENV ?? "") ||
    (env.NODE_ENV === "test" && !env.APP_ENV)
  )
}
