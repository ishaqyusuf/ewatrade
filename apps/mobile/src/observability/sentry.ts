import {
  createSafeDiagnosticError,
  sentryRuntimeOptions,
} from "@ewatrade/observability"
import * as Sentry from "@sentry/react-native"
import Constants from "expo-constants"

function mobileRelease() {
  const applicationId =
    Constants.expoConfig?.ios?.bundleIdentifier ??
    Constants.expoConfig?.android?.package
  const version = Constants.nativeAppVersion ?? Constants.expoConfig?.version
  const build = Constants.nativeBuildVersion
  if (!applicationId || !version) return undefined
  return `${applicationId}@${version}${build ? `+${build}` : ""}`
}

export function initMobileObservability() {
  Sentry.init(
    sentryRuntimeOptions("mobile", {
      deploymentEnvironment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
      dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
      nodeEnvironment: __DEV__ ? "development" : "production",
      release: process.env.EXPO_PUBLIC_SENTRY_RELEASE ?? mobileRelease(),
    }) as Parameters<typeof Sentry.init>[0],
  )
}

export function captureMobileError(error: unknown, operation: string) {
  const safeError = createSafeDiagnosticError(error, {
    operation,
    runtime: "mobile",
  })
  if (safeError) Sentry.captureException(safeError)
}
