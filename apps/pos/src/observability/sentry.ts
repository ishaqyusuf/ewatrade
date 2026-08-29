import {
  createSafeDiagnosticError,
  sentryRuntimeOptions,
} from "@ewatrade/observability"
import * as Sentry from "@sentry/nextjs"

export function initPosObservability(client = false) {
  Sentry.init(
    sentryRuntimeOptions("pos", {
      deploymentEnvironment: client
        ? process.env.NEXT_PUBLIC_APP_ENV
        : process.env.APP_ENV,
      dsn: client ? process.env.NEXT_PUBLIC_SENTRY_DSN : process.env.SENTRY_DSN,
      nodeEnvironment: process.env.NODE_ENV,
      release:
        process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.SENTRY_RELEASE,
    }) as Parameters<typeof Sentry.init>[0],
  )
}

export function capturePosError(error: unknown, operation: string) {
  const safeError = createSafeDiagnosticError(error, {
    operation,
    runtime: "pos",
  })
  if (safeError) Sentry.captureException(safeError)
}
