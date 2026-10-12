// Only Production registers automatic timers. Preview uses the separate free
// Trigger project, and a local `trigger dev` would otherwise tick every
// cadence in the shared project for as long as it runs; set
// TRIGGER_DEV_SCHEDULES=true to opt a local session in. Task definitions stay
// registered everywhere for application/manual triggering.
export function automaticJobCron(
  pattern: string,
  appEnv = process.env.APP_ENV,
  devSchedules = process.env.TRIGGER_DEV_SCHEDULES,
): string | undefined {
  if (appEnv === "production") return pattern
  if (appEnv === "preview") return undefined
  return devSchedules === "true" ? pattern : undefined
}
