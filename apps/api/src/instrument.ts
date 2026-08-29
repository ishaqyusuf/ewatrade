import { sentryRuntimeOptions } from "@ewatrade/observability"
import * as Sentry from "@sentry/bun"

Sentry.init(
  sentryRuntimeOptions("api", {
    deploymentEnvironment: process.env.APP_ENV,
    dsn: process.env.SENTRY_DSN,
    nodeEnvironment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
  }) as Parameters<typeof Sentry.init>[0],
)
