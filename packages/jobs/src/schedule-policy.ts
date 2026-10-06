// Preview uses the separate free Trigger project without automatic timers.
// Task definitions remain registered for application/manual triggering.
export function automaticJobCron(
  pattern: string,
  appEnv = process.env.APP_ENV,
): string | undefined {
  return appEnv === "preview" ? undefined : pattern
}
