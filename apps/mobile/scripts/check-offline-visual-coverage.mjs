import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const contracts = [
  {
    // Admin and sales rep Home both render this surface; dashboard.tsx only redirects.
    file: "apps/mobile/src/components/mobile/dashboard/operations-dashboard-screen.tsx",
    markers: [
      "useOperationalModeStore",
      "useOfflineCommandStore",
      "getOfflineProvisionalProjection",
      "Offline work is provisional",
      "commands waiting",
      "commercialOrders",
      "inventoryOperations",
      "serviceOperations",
      'router.push("/sync-status-modal" as never)',
    ],
    reason:
      "the dashboard must visibly distinguish provisional offline projections",
  },
  {
    file: "apps/mobile/src/components/mobile/sync-status-sheet.tsx",
    markers: [
      "trpc.offline.conflicts",
      "useOfflineReplay",
      "sync.reviewCommand",
      "Retry",
      "Discard",
      "dependentCommands",
      'title="On this phone"',
      'title="Needs review"',
      "Server data is authoritative.",
    ],
    reason:
      "sync UI must expose queue, replay, idempotent device registration, conflict dependencies, and explicit review decisions",
  },
  {
    // Shared by the root reconciler and the Sync status sheet.
    file: "apps/mobile/src/hooks/use-offline-replay.ts",
    markers: [
      "trpc.offline.replay",
      "trpc.offline.registerDevice",
      "trpc.offline.review",
    ],
    reason:
      "replay, idempotent device registration and review decisions must stay on the shared replay path",
  },
  {
    file: "apps/mobile/src/store/offlineCommandStore.ts",
    markers: [
      "eventVersion",
      "dependencyClientIds",
      "clientCommandId",
      '"pending"',
      '"review"',
      '"discarded"',
      "persist",
      "merge",
      "incompatible schema are never read",
      "pendingOfflineCommands",
      "applyReplayResults",
    ],
    reason:
      "the persisted command boundary must retain dependencies, local states, and clean incompatible-state discard",
  },
  {
    file: "apps/api/src/trpc/routers/offline.ts",
    markers: [
      "registerDevice: protectedProcedure",
      "replay: protectedProcedure",
      "conflicts: protectedProcedure",
      "review: protectedProcedure",
      "replayOfflineCommands",
      "listOfflineConflictReviews",
      "reviewOfflineConflict",
    ],
    reason:
      "offline replay and conflict review must remain protected server operations",
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

if (failures.length > 0) {
  console.error("Generic offline visual and replay coverage check failed.")
  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }
  process.exit(1)
}

console.log("Generic offline visual and replay coverage check passed.")
