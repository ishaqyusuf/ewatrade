// Only Production registers automatic timers. Preview uses the separate free
// Trigger project, and a local `trigger dev` would otherwise tick every
// cadence in the shared project for as long as it runs; set
// TRIGGER_DEV_SCHEDULES=true to opt a local session in. Task definitions stay
// registered everywhere for application/manual triggering.
export function automaticJobCron(
  pattern: string,
  appEnv = process.env.APP_ENV,
  devSchedules = process.env.TRIGGER_DEV_SCHEDULES,
  scheduleMode = process.env.JOB_SCHEDULE_MODE,
): string | undefined {
  if (appEnv === "preview") return undefined
  if (appEnv !== "production" && devSchedules !== "true") return undefined
  if (scheduleMode && !["standard", "prelaunch"].includes(scheduleMode))
    throw new Error("JOB_SCHEDULE_MODE must be standard or prelaunch.")
  // The five-minute parent owns both recovery groups in prelaunch mode.
  // Registering a second half-hourly parent only adds another billed run.
  // Hourly/daily retention remains registered at its existing cadence.
  if (scheduleMode === "prelaunch") {
    if (pattern === "*/5 * * * *") return "*/30 * * * *"
    if (pattern === "*/15 * * * *") return undefined
  }
  return pattern
}
