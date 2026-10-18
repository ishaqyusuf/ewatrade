export function isLocalPhoneAuth(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.DEV_PROFILE === "local" &&
    (!env.APP_ENV || env.APP_ENV === "local") &&
    env.NODE_ENV !== "production"
  )
}
