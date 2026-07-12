import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  dashboard: join(MOBILE_DIR, "src/app/dashboard.tsx"),
  reports: join(MOBILE_DIR, "src/components/mobile/reports-sheet.tsx"),
  syncSheet: join(MOBILE_DIR, "src/components/mobile/sync-status-sheet.tsx"),
}

const CONTRACTS = [
  {
    file: FILES.dashboard,
    markers: [
      "syncBannerClassName",
      "syncBannerIconClassName",
      "syncBannerIconName",
      "syncBannerText",
      "Offline mode. Changes will be applied when next you connect.",
      "need review.",
      "need retry.",
      "pending sync.",
      'testID="retail-sync-banner"',
      "flex-row items-start gap-2",
      "shrink-0",
      "min-w-0 flex-1 shrink",
      "text-sm font-medium leading-5",
      "isOfflineMode ? null",
      "syncModal.present()",
    ],
    reason:
      "dashboard must keep a top-aligned, wrapping, non-blocking sync banner for offline, conflict, failed, pending, and synced states",
  },
  {
    file: FILES.syncSheet,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "Offline mode",
      "Online mode",
      "Changes stay on this device and will be applied when next you connect.",
      "Keep selling during poor network. Sync resumes when online.",
      'testID="retail-offline-toggle"',
      'testID="retail-offline-device"',
      "numberOfLines={1}",
      "Device management",
      "Server history",
      "Server conflicts",
      "This device",
      "Business",
    ],
    reason:
      "sync sheet must keep compact offline/online mode copy, device identity, history, and server conflict summaries",
  },
  {
    file: FILES.syncSheet,
    markers: [
      'testID="retail-sync-pending-count"',
      'testID="retail-sync-retry-count"',
      'testID="retail-sync-review-count"',
      'testID="retail-sync-conflicts-reviewed"',
      'testID="retail-sync-failed-retry"',
      'testID="retail-sync-now"',
      'testID="retail-sync-queue"',
      'testID="retail-sync-conflict-summary"',
      'testID="retail-sync-event-row"',
      "testID={",
      "retail-sync-event-conflict-detail",
      "retail-sync-event-failed-detail",
      "visibleTenantSyncConflicts",
      "visibleBlockedEvents",
      "visibleSyncEvents",
      "Showing first",
    ],
    reason:
      "sync sheet must keep stable QA selectors and bounded rows for compact and larger phone visual checks",
  },
  {
    file: FILES.syncSheet,
    markers: [
      "getSyncConflictBusinessImpact",
      "Impact:",
      "Action:",
      "This event needs review before it can sync.",
      "Conflict",
      "Reviewed",
      "Move reviewed conflicts to pending",
      "Conflicts usually mean stock, session, staff, or customer state",
      "resolutionAction",
      "resolutionDetail",
      "reviewServerConflict",
      "reviewSyncConflictMutation",
      "No unreviewed server conflicts for this business.",
      "Sales or stock may be missing from production",
      "This local change is not fully reflected in production",
    ],
    reason:
      "server conflict rows must explain business impact, recommended resolution, review action, and empty state",
  },
  {
    file: FILES.reports,
    markers: [
      "Server conflicts",
      "Filtered conflicts",
      "Server sync conflicts",
      "Tenant-level unreviewed conflicts, with a current-device",
      "SyncDeviceFilterControl",
      "currentDeviceId={offlineDeviceId}",
      "No unreviewed server conflicts for this filter.",
      "getSyncConflictBusinessImpact",
      "Recommended:",
      "retail-reports-export-csv",
      "syncDeviceFilter",
    ],
    reason:
      "reports must keep tenant conflict counts, device filtering, impact copy, and CSV export for offline/sync review",
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
    "Mobile offline visual coverage check failed. Restore the dashboard sync banner, sync status visual states, conflict messaging, reports conflict filter, or stable QA selectors.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Mobile offline visual coverage check passed.")
