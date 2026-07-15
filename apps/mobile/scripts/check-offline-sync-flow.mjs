import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  dashboard: join(MOBILE_DIR, "src/app/dashboard.tsx"),
  reports: join(MOBILE_DIR, "src/components/mobile/reports-sheet.tsx"),
  store: join(MOBILE_DIR, "src/store/retailOpsStore.ts"),
  syncBuilder: join(MOBILE_DIR, "src/lib/retail-ops-sync.ts"),
  syncFlow: join(MOBILE_DIR, "src/components/mobile/sync-flow.tsx"),
  syncSheet: join(MOBILE_DIR, "src/components/mobile/sync-status-sheet.tsx"),
}

const CONTRACTS = [
  {
    file: FILES.store,
    markers: [
      "export type RetailOpsSyncEvent",
      "dependencies?: Array",
      "deviceId?: string",
      "retryCount?: number",
      'status: "pending" | "synced" | "failed" | "conflict"',
      'offlineDeviceId: createId("device")',
      "createSyncEvent",
      "getProductSyncDependencies",
      "getNextRetryAt",
      "markSyncEventsResolved",
      "retrySyncEvents",
      "setOfflineMode",
    ],
    reason:
      "local sync state must keep event envelopes, device identity, dependency metadata, retry/conflict states, and offline mode controls",
  },
  {
    file: FILES.syncBuilder,
    markers: [
      "buildRetailOpsSyncEventsInput",
      "getRetailOpsSyncBlockedEvents",
      "isReplayableSyncEvent",
      "belongsToActiveBusiness",
      "eventId: event.id",
      "externalId: event.id",
      "deviceId: input.deviceId",
      ".slice(0, 50)",
      "Waiting for the product/unit to sync first",
      "Waiting for the rep session to sync first",
    ],
    reason:
      "sync replay must preserve idempotency keys, tenant scoping, retry eligibility, dependency blocking, and bounded batches",
  },
  {
    file: FILES.syncBuilder,
    markers: [
      "getRetailOpsProductSyncMappings",
      "getRetailOpsCustomerSyncMappings",
      "getRetailOpsRepSessionSyncMappings",
      "getRetailOpsSaleSyncMappings",
      "getRetailOpsStaffSyncMappings",
      "getRetailOpsShareLinkSyncMappings",
    ],
    reason:
      "sync success must keep production id reconciliation for products, customers, sessions, sales, staff, and share links",
  },
  {
    file: FILES.syncSheet,
    markers: [
      "trpc.retailOps.syncEvents",
      "trpc.retailOps.registerOfflineDevice",
      "trpc.retailOps.offlineDevices",
      "trpc.retailOps.syncHistory",
      "trpc.retailOps.syncConflicts",
      "trpc.retailOps.reviewSyncConflict",
      "buildRetailOpsSyncEventsInput",
      "getRetailOpsSyncBlockedEvents",
      "markSyncEventsResolved",
      "recordSyncSummary",
      "retryFailedEvents",
      "refreshServerSyncState",
    ],
    reason:
      "sync status sheet must keep device registration, event replay, local resolution, retry, history, and conflict review wiring",
  },
  {
    file: FILES.syncSheet,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "SyncReliabilityAction",
      "SyncReliabilityPanel",
      "SyncReliabilityRow",
      "SyncReliabilityStat",
      "SyncReliabilityToggle",
      "StatusBadge",
      "StatusBanner",
      "EmptyState",
      "Offline mode",
      "Device management",
      "Last sync",
      "Server history",
      "Changes stay on this device and will be applied when next you connect.",
      "retail-offline-toggle",
      "retail-offline-device",
      "retail-sync-pending-count",
      "retail-sync-retry-count",
      "retail-sync-review-count",
      "retail-sync-now",
      "retail-sync-queue",
      "SYNC_QUEUE_PREVIEW_LIMIT",
    ],
    reason:
      "sync UI must keep the keyboard-safe sheet, reusable reliability panels/rows/actions/stats/toggle, offline copy, stable QA selectors, queue counts, and bounded queue rows",
  },
  {
    file: FILES.syncFlow,
    markers: [
      "SyncReliabilityPanel",
      "SyncReliabilityRow",
      "SyncReliabilityStat",
      "SyncReliabilityToggle",
      "SyncReliabilityAction",
      "border-t border-border py-4",
      "text-success",
      "text-warn",
      "text-primary-foreground",
      'tone?: "destructive" | "muted" | "primary"',
      "haptic={!disabled && !!onPress}",
      "haptic",
    ],
    reason:
      "offline sync screens must use reusable flat reliability panels, rows, stats, toggles, and haptic actions instead of local card-heavy sync widgets",
  },
  {
    file: FILES.dashboard,
    markers: [
      "isOfflineMode",
      "pendingSyncEvents",
      "failedSyncEvents",
      "conflictSyncEvents",
      "syncBannerText",
      "Offline mode. Changes will be applied when next you connect.",
      "retail-sync-banner",
      "syncModal.present",
    ],
    reason:
      "dashboard must keep the top sync banner and open the detailed sync status surface",
  },
  {
    file: FILES.reports,
    markers: [
      "conflictSyncCount",
      "offlineDeviceId",
      "syncDeviceFilter",
      "retailOps.syncConflicts",
      "Server sync conflicts",
      "Tenant-level unreviewed conflicts",
    ],
    reason:
      "reports must keep tenant-level sync conflict visibility and device filtering for managers",
  },
]
const failures = []

for (const contract of CONTRACTS) {
  const source = readFileSync(contract.file, "utf8")
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: contract.file,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Offline sync flow check failed. Restore the local sync envelope, replay builder, dashboard banner, sync sheet, or reports conflict contract.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Offline sync flow check passed.")
