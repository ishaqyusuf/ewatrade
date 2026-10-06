import Constants from "expo-constants"
import * as SecureStore from "expo-secure-store"
import { getBaseUrl } from "./base-url"

export type PendingOnboarding = {
  kind: "setup" | "verification"
  token: string
  expiresAt: number
  environment: string
}

const KEY = "ewatrade_pending_onboarding"
let storageOperation = Promise.resolve()
function serializedStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageOperation.then(operation, operation)
  storageOperation = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

export function onboardingLinkConfiguration() {
  const value =
    Constants.expoConfig?.extra?.appVariant ??
    process.env.EXPO_PUBLIC_APP_VARIANT
  const variant =
    value === "development" || value === "dev"
      ? "development"
      : value === "preview"
        ? "preview"
        : value === "production"
          ? "production"
          : null
  if (!variant) throw new Error("Onboarding environment is not configured.")
  return {
    variant,
    dashboardUrl:
      Constants.expoConfig?.extra?.onboardingDashboardUrl ??
      process.env.EXPO_PUBLIC_DASHBOARD_URL,
  }
}

function environmentIdentity() {
  return `${onboardingLinkConfiguration().variant}:${getBaseUrl()}`
}

export async function savePendingOnboarding(
  value: {
    kind: "setup" | "verification"
    token: string
    expiresAt?: number
  },
  expectedToken?: string,
) {
  const pending: PendingOnboarding = {
    ...value,
    // Server expiry replaces this bound after lookup; never persist indefinitely.
    expiresAt: value.expiresAt ?? Date.now() + 7 * 24 * 60 * 60 * 1000,
    environment: environmentIdentity(),
  }
  return serializedStorage(async () => {
    if (expectedToken) {
      const raw = await SecureStore.getItemAsync(KEY)
      if (!raw || JSON.parse(raw).token !== expectedToken)
        throw new Error(
          "A different setup link is now open. Continue from the latest email.",
        )
    }
    await SecureStore.setItemAsync(KEY, JSON.stringify(pending))
    return pending
  })
}

export async function readPendingOnboarding(): Promise<PendingOnboarding | null> {
  return serializedStorage(async () => {
    const raw = await SecureStore.getItemAsync(KEY)
    if (!raw) return null
    try {
      const value = JSON.parse(raw)
      if (
        (value.kind !== "setup" && value.kind !== "verification") ||
        typeof value.token !== "string" ||
        !(
          value.kind === "setup"
            ? /^ea_[A-Za-z0-9_-]{43}$/
            : /^ear_[A-Za-z0-9_-]{43}$/
        ).test(value.token) ||
        !Number.isFinite(value.expiresAt) ||
        value.expiresAt <= Date.now() ||
        value.environment !== environmentIdentity()
      ) {
        await SecureStore.deleteItemAsync(KEY)
        return null
      }
      return value
    } catch {
      await SecureStore.deleteItemAsync(KEY)
      return null
    }
  })
}

export function clearPendingOnboarding(expectedToken?: string) {
  return serializedStorage(async () => {
    if (expectedToken) {
      const raw = await SecureStore.getItemAsync(KEY)
      if (!raw || JSON.parse(raw).token !== expectedToken) return
    }
    await SecureStore.deleteItemAsync(KEY)
  })
}
