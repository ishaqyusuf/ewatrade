import { applyEwatradeSharedEnv } from "@ewatrade/utils/shared-env"
import * as Sentry from "@sentry/nextjs"

export async function register() {
  // Plain names are filled from EwaTrade's Vercel shared variables before any
  // server module reads them.
  applyEwatradeSharedEnv()
  if (process.env.NEXT_RUNTIME === "nodejs")
    await import("../sentry.server.config")
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config")
}

export const onRequestError = Sentry.captureRequestError
