import type { AnalyticsConfig } from "@ishaqyusuf/logly-core"

// Supply an adapter even during SSR/disabled tracking: the SDK otherwise reads
// window.localStorage while constructing the root provider.
export function createBrowserStorage(
  getStorage: () => NonNullable<AnalyticsConfig["storage"]> | undefined = () =>
    typeof window === "undefined" ? undefined : window.localStorage,
): NonNullable<AnalyticsConfig["storage"]> {
  const memory = new Map<string, string>()
  const tombstones = new Set<string>()
  const authoritative = new Set<string>()
  return {
    getItem(key) {
      if (tombstones.has(key)) return null
      if (authoritative.has(key)) return memory.get(key) ?? null
      try {
        const value = getStorage()?.getItem(key)
        if (value !== null && value !== undefined) {
          memory.set(key, value)
          return value
        }
      } catch {
        /* Fall back to the in-memory value. */
      }
      return memory.get(key) ?? null
    },
    setItem(key, value) {
      memory.set(key, value)
      tombstones.delete(key)
      authoritative.add(key)
      try {
        getStorage()?.setItem(key, value)
      } catch {
        /* The in-memory value keeps this session stable. */
      }
    },
    removeItem(key) {
      memory.delete(key)
      tombstones.add(key)
      authoritative.add(key)
      try {
        getStorage()?.removeItem(key)
      } catch {
        /* The tombstone prevents a stale persisted value from resurfacing. */
      }
    },
  }
}
