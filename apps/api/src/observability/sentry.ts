import { createSafeDiagnosticError } from "@ewatrade/observability"
import * as Sentry from "@sentry/bun"

export function captureApiError(
  error: unknown,
  context: { operation: string; requestId?: string },
) {
  const safeError = createSafeDiagnosticError(error, {
    ...context,
    runtime: "api",
  })
  if (safeError) Sentry.captureException(safeError)
}
