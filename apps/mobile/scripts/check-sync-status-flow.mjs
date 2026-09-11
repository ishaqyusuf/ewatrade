import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const contracts = [
  {
    file: "apps/mobile/src/components/mobile/sync-status-sheet.tsx",
    markers: [
      "Allow staff to work offline",
      "Require staff record approval",
      "offline-policy-enabled-toggle",
      "offline-policy-approval-toggle",
      "staleTime: 30_000",
      "canChangeOfflinePolicy",
      "canReplayOfflineCommands",
      "SYNC_STATUS_COPY.syncError",
      "SYNC_STATUS_COPY.policySaveError",
      "SYNC_STATUS_COPY.reviewError",
      "review.isPending",
      "updateSettings.isPending",
      "disabled={operationPending}",
      "SYNC_STATUS_COPY.localConflict",
      "SYNC_STATUS_COPY.serverConflict",
      "Server data is authoritative.",
    ],
    reason:
      "the sync screen must separate policy, device mode, and replay while guarding live operations",
  },
  {
    file: "apps/mobile/src/components/mobile/sync-flow.tsx",
    markers: [
      'accessibilityRole="switch"',
      "accessibilityState={{ checked: active, disabled }}",
      '"h-7 w-12',
      "disabled={disabled}",
    ],
    reason:
      "offline policy toggles must expose semantic state and a visible 48-by-28 track",
  },
  {
    file: "apps/mobile/src/components/mobile/floating-theme-toggle.tsx",
    markers: ['pathname.startsWith("/sync-status-modal")'],
    reason: "the development theme control must not overlap live sync actions",
  },
  {
    file: "apps/mobile/src/components/mobile/admin-tabs/admin-more-screen.tsx",
    markers: ["staleTime: 30_000"],
    reason:
      "opening More and then Sync & offline must not immediately repeat identical reads",
  },
]

const failures = []
for (const contract of contracts) {
  const filePath = join(REPO_ROOT, contract.file)
  const source = readFileSync(filePath, "utf8")
  const missing = contract.markers.filter((marker) => !source.includes(marker))
  if (missing.length > 0) {
    failures.push({
      file: filePath,
      message: `missing ${missing.join(", ")} (${contract.reason})`,
    })
  }
}

const syncSource = readFileSync(
  join(REPO_ROOT, "apps/mobile/src/components/mobile/sync-status-sheet.tsx"),
  "utf8",
)
if (syncSource.includes("?.message ??")) {
  failures.push({
    file: join(
      REPO_ROOT,
      "apps/mobile/src/components/mobile/sync-status-sheet.tsx",
    ),
    message: "raw mutation errors must not be rendered to operators",
  })
}
if (
  syncSource.includes("state.retryCommand(") ||
  syncSource.includes("state.discardCommand(")
) {
  failures.push({
    file: join(
      REPO_ROOT,
      "apps/mobile/src/components/mobile/sync-status-sheet.tsx",
    ),
    message:
      "review actions must wait for the authoritative mutation result before changing local command state",
  })
}

if (failures.length > 0) {
  console.error("Sync status flow check failed.")
  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }
  process.exit(1)
}

console.log("Sync status flow check passed.")
