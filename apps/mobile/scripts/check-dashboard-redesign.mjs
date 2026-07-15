import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")

const requiredMarkers = [
  {
    file: "app/dashboard.tsx",
    markers: [
      "MobileAppShell",
      "EmptyState",
      "StatusBadge",
      "MetricCard",
      "QuickAction",
      "DashboardPanel",
      "DashboardRecordRow",
      "DashboardStatTile",
      "DashboardInlineStatus",
      "visibleQuickActions",
      "isAttendantDashboard ? null",
      "canManageInventory",
      "No low-stock items",
      "No attendants yet",
      "No stock movement yet",
      "No saved customers yet",
      "No sales yet",
      "Pending sync",
      "Invite pending",
      "Product links",
      "PlanStatusCard",
      "RepSessionStatusCard",
    ],
  },
  {
    file: "components/mobile/empty-state.tsx",
    markers: ["EmptyState", "ActionButton", "text-center"],
  },
  {
    file: "components/mobile/status-badge.tsx",
    markers: ["StatusBadge", "MobileDesignStatusTone", "min-h-8"],
  },
  {
    file: "components/mobile/dashboard-kit.tsx",
    markers: [
      "DashboardMetricCard",
      "DashboardQuickAction",
      "DashboardPanel",
      "DashboardRecordRow",
      "DashboardStatTile",
      "DashboardInlineStatus",
      "DashboardMetricTone",
      "border-t border-border",
      "bg-success/10",
      "bg-warn/10",
    ],
  },
]

const forbiddenDashboardMarkers = [
  "No sales yet\n              </Text>",
  "No saved customers yet\n            </Text>",
]

const failures = []

for (const check of requiredMarkers) {
  const filePath = join(SOURCE_DIR, check.file)
  const contents = readFileSync(filePath, "utf8")

  for (const marker of check.markers) {
    if (contents.includes(marker)) continue

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      message: `missing marker: ${marker}`,
    })
  }
}

const dashboardSource = readFileSync(
  join(SOURCE_DIR, "app/dashboard.tsx"),
  "utf8",
)

for (const marker of forbiddenDashboardMarkers) {
  if (!dashboardSource.includes(marker)) continue

  failures.push({
    file: "src/app/dashboard.tsx",
    message: `contains old inline empty-state marker: ${marker}`,
  })
}

if (failures.length > 0) {
  console.error("Mobile dashboard redesign check failed.")

  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Mobile dashboard redesign check passed.")
