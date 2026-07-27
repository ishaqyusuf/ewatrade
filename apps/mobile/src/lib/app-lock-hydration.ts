import type { AppLockConfig } from "./app-lock-store"

export type AppLockHydrationResult =
  | { config: AppLockConfig | null; status: "ready" }
  | { config: null; status: "error" }

const DEFAULT_APP_LOCK_HYDRATION_TIMEOUT_MS = 5_000

export async function loadAppLockConfig(
  readConfig: () => Promise<AppLockConfig | null>,
  timeoutMs = DEFAULT_APP_LOCK_HYDRATION_TIMEOUT_MS,
): Promise<AppLockHydrationResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    const result = await Promise.race([
      readConfig().then(
        (config) => ({ config, status: "ready" }) as const,
        () => ({ config: null, status: "error" }) as const,
      ),
      new Promise<AppLockHydrationResult>((resolve) => {
        timeout = setTimeout(
          () => resolve({ config: null, status: "error" }),
          timeoutMs,
        )
      }),
    ])

    return result
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
