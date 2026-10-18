/** Fixed verification codes are allowed only in explicitly named development profiles. */
export function shouldUseFixedMobileOwnerOtp(env: {
  APP_ENV?: string
  NODE_ENV?: string
}) {
  return (
    env.NODE_ENV !== "production" &&
    ["local", "development", "test"].includes(env.APP_ENV ?? "")
  )
}
