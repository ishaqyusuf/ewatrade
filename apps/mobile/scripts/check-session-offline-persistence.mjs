import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const SESSION_STORE_FILE = join(
  REPO_ROOT,
  "apps/mobile/src/lib/session-store.ts",
)
const AUTH_HOOK_FILE = join(REPO_ROOT, "apps/mobile/src/hooks/use-auth.tsx")
const TRPC_CLIENT_FILE = join(REPO_ROOT, "apps/mobile/src/trpc/client.tsx")
const TRPC_CONTEXT_FILE = join(REPO_ROOT, "apps/api/src/trpc/init.ts")
const ZUSTAND_STORAGE_FILE = join(REPO_ROOT, "apps/mobile/src/store/mmkv.ts")
const RETAIL_OPS_STORE_FILE = join(
  REPO_ROOT,
  "apps/mobile/src/store/retailOpsStore.ts",
)
const RETAIL_OPS_SYNC_FILE = join(
  REPO_ROOT,
  "apps/mobile/src/lib/retail-ops-sync.ts",
)

const failures = []

function readSource(file) {
  return readFileSync(file, "utf8")
}

function requireMarkers(file, source, markers, reason) {
  const missingMarkers = markers.filter((marker) => !source.includes(marker))

  if (missingMarkers.length > 0) {
    failures.push({
      file,
      message: `missing ${missingMarkers.join(", ")} (${reason})`,
    })
  }
}

function rejectMarkers(file, source, markers, reason) {
  const presentMarkers = markers.filter((marker) => source.includes(marker))

  if (presentMarkers.length > 0) {
    failures.push({
      file,
      message: `unexpected ${presentMarkers.join(", ")} (${reason})`,
    })
  }
}

const sessionStoreSource = readSource(SESSION_STORE_FILE)
const authHookSource = readSource(AUTH_HOOK_FILE)
const trpcClientSource = readSource(TRPC_CLIENT_FILE)
const trpcContextSource = readSource(TRPC_CONTEXT_FILE)
const zustandStorageSource = readSource(ZUSTAND_STORAGE_FILE)
const retailOpsStoreSource = readSource(RETAIL_OPS_STORE_FILE)
const retailOpsSyncSource = readSource(RETAIL_OPS_SYNC_FILE)

requireMarkers(
  SESSION_STORE_FILE,
  sessionStoreSource,
  [
    'import * as SecureStore from "expo-secure-store"',
    'SESSION_KEY = "ewatrade_mobile_session"',
    "export type MobileSession",
    "token: string",
    "profile: MobileProfile",
    "SecureStore.getItem(SESSION_KEY)",
    "SecureStore.setItem(SESSION_KEY, JSON.stringify(session))",
    "SecureStore.deleteItemAsync(SESSION_KEY)",
    "export const getToken",
  ],
  "mobile sessions must keep token and profile in SecureStore",
)
rejectMarkers(
  SESSION_STORE_FILE,
  sessionStoreSource,
  ["AsyncStorage", "zustandStorage", "createJSONStorage"],
  "session tokens must not be stored in general-purpose app storage",
)

requireMarkers(
  AUTH_HOOK_FILE,
  authHookSource,
  [
    "getSession()",
    "applyAuthenticatedSession(nextSession: MobileSession)",
    "setSession(nextSession)",
    'router.replace("/dashboard")',
    "deleteSession()",
    'router.replace("/login")',
  ],
  "auth context must hydrate saved sessions and clear them on logout",
)

requireMarkers(
  TRPC_CLIENT_FILE,
  trpcClientSource,
  [
    'import { getToken } from "@/lib/session-store"',
    "const token = getToken()",
    'headers.set("x-app-authorization", `Bearer ${token}`)',
    'headers.set("x-trpc-source", "mobile")',
  ],
  "mobile API calls must forward the stored app bearer token",
)

requireMarkers(
  TRPC_CONTEXT_FILE,
  trpcContextSource,
  [
    'c.req.header("authorization") ?? c.req.header("x-app-authorization")',
    "getSessionFromBearer(bearerToken)",
    "cookieSession ??",
  ],
  "API context must accept the mobile app bearer header",
)

requireMarkers(
  ZUSTAND_STORAGE_FILE,
  zustandStorageSource,
  [
    'import AsyncStorage from "@react-native-async-storage/async-storage"',
    'const STORAGE_PREFIX = "onboarding-storage:"',
    "export const zustandStorage",
    "AsyncStorage.setItem",
    "AsyncStorage.getItem",
    "AsyncStorage.removeItem",
  ],
  "offline app state must have durable local persistence",
)

requireMarkers(
  RETAIL_OPS_STORE_FILE,
  retailOpsStoreSource,
  [
    "persist(",
    "storage: createJSONStorage(() => zustandStorage)",
    'name: "ewatrade-mobile-retail-ops"',
    "partialize: (state) =>",
    "offlineDeviceId: state.offlineDeviceId",
    "isOfflineMode: state.isOfflineMode",
    "lastSyncSummary: state.lastSyncSummary",
    "products: state.products",
    "customers: state.customers",
    "sales: state.sales",
    "shareLinks: state.shareLinks",
    "syncEvents: state.syncEvents",
    "onRehydrateStorage",
  ],
  "retail ops state must persist the offline business state and sync queue",
)

requireMarkers(
  RETAIL_OPS_STORE_FILE,
  retailOpsStoreSource,
  [
    "export type RetailOpsSyncEvent",
    "dependencies?: Array",
    "deviceId?: string",
    "entityId: string",
    "retryCount?: number",
    "nextRetryAt?: string",
    'status: "pending" | "synced" | "failed" | "conflict"',
    'offlineDeviceId: createId("device")',
    "getNextRetryAt",
    "retrySyncEvents",
    "setOfflineMode",
    "isSyncConflictCode",
  ],
  "offline sync events must retain device, dependency, retry, and conflict metadata",
)

requireMarkers(
  RETAIL_OPS_SYNC_FILE,
  retailOpsSyncSource,
  [
    'RouterInputs["retailOps"]["syncEvents"]',
    "buildRetailOpsSyncEventsInput",
    "isReplayableSyncEvent(event)",
    "belongsToActiveBusiness(event, input.activeBusinessId)",
    ".slice(0, 50)",
    "deviceId: input.deviceId",
    "externalId: event.id",
    "getRetailOpsSyncBlockedEvents",
    "getRetailOpsSyncBlockedReason",
    "getRetailOpsSyncEventInput",
  ],
  "sync replay must be typed, tenant-scoped, idempotent, bounded, and able to explain blocked events",
)

if (failures.length > 0) {
  console.error(
    "Session/offline persistence check failed. Keep mobile sessions in SecureStore and offline Retail Ops state in durable local storage with replayable sync events.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Session/offline persistence check passed.")
