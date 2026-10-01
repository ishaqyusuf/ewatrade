/** Platform approval is separate from a Store's own pharmacy policy rows. */
export function isPrescriptionProductionLaunchApproved(
  env: Partial<
    Record<
      | "APP_ENV"
      | "DEV_PROFILE"
      | "NODE_ENV"
      | "PRESCRIPTION_COMMERCE_LAUNCH_APPROVED",
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
      env.PRESCRIPTION_COMMERCE_LAUNCH_APPROVED === "true"
    )
  return (
    ["local", "dev"].includes(env.APP_ENV ?? "") ||
    (env.NODE_ENV === "test" && !env.APP_ENV)
  )
}
