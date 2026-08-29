import { providerError } from "@ewatrade/errors"
import {
  createSafeDiagnosticError,
  sentryRuntimeOptions,
} from "@ewatrade/observability"
import * as Sentry from "@sentry/node"

Sentry.init(
  sentryRuntimeOptions("jobs", {
    deploymentEnvironment: process.env.APP_ENV,
    dsn: process.env.SENTRY_DSN,
    nodeEnvironment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
  }) as Parameters<typeof Sentry.init>[0],
)

export async function captureTerminalJobError(error: unknown, task: string) {
  const safeError = createSafeDiagnosticError(terminalJobError(error, task), {
    operation: `jobs.${task}`,
    runtime: "jobs",
  })
  if (!safeError) return
  Sentry.captureException(safeError)
  await Sentry.flush(2_000)
}

export function terminalJobError(error: unknown, task: string) {
  if (task.startsWith("domains."))
    return providerError("registrar", error, `jobs.${task}`)
  if (
    task === "communications.whatsapp-connection-test" ||
    task === "prescriptions.communication-dispatch" ||
    task === "prescriptions.whatsapp-inbound" ||
    task === "services.notification.dispatch" ||
    task === "service-commerce.booking-notification-dispatch" ||
    task === "service-commerce.customer-notification-dispatch" ||
    task === "service-commerce.whatsapp-inbound"
  )
    return providerError("messaging", error, `jobs.${task}`)
  if (task === "service-commerce.media-ingest")
    return providerError("storage", error, `jobs.${task}`)
  return error
}
