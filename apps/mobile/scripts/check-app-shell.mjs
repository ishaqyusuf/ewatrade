import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")
const contracts = [
  {
    file: "components/mobile/app-shell.tsx",
    markers: [
      "MobileAppShell",
      "MobileAppShellNavItem",
      'MobileAppShellRole = "attendant" | "owner"',
      "mobile-shell-floating-nav",
      "mobile-shell-central-action",
      'role === "owner" || !item.ownerOnly',
      "Math.ceil(visibleNavItems.length / 2)",
      'kind: "action"',
      'kind: "navigation"',
      '"Open create options"',
      '"Create order"',
      "useSafeAreaInsets",
      "StatusBar",
      "hideOnScroll",
      'labelStack="vertical"',
      'variant="operational-detail"',
      "paddingBottom: Math.max(insets.bottom + 116, 152)",
    ],
    reason:
      "the shared shell must preserve role-aware navigation, safe areas, and its central action",
  },
  {
    file: "components/mobile/bottom-tabs.types.ts",
    markers: [
      'kind?: "action" | "navigation"',
      "accessibilityLabel?: string",
      "isActive?: boolean",
      '"operational-detail"',
    ],
    reason:
      "the operational dock contract must distinguish navigation from its center action",
  },
  {
    file: "components/mobile/bottom-tabs.tsx",
    markers: [
      "MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS",
      'variant === "operational-detail"',
      "useReducedMotion",
      "Math.max(safeBottom - 4, 12)",
      "height: isOperationalDetail ? 72 : 56",
      "left: isOperationalDetail ? 24 : 20",
      "isOperationalDetail || tabCount !== 3",
    ],
    reason:
      "the production dock must preserve its approved geometry, motion, and equal-lane alignment",
  },
  {
    file: "components/mobile/bottom-tab-item.tsx",
    markers: [
      "accessibilityRole={accessibilityRole}",
      "selected: isAction ? undefined : isActive",
      "operational-bottom-tab-action",
      "fontSize: 10",
      "gap: 4",
      "height: 52",
      "borderWidth: 2",
      "top: -4",
    ],
    reason:
      "navigation selection and the central create button must remain visually and semantically distinct",
  },
  {
    file: "lib/design-foundation.ts",
    markers: [
      "MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS",
      'surface: "#1E1E1C"',
      'activeForeground: "#FFFFFF"',
      'inactiveForeground: "#9B9B97"',
      'centerAccent: "#F2A51A"',
    ],
    reason:
      "operational dock colors must stay centralized as semantic design tokens",
  },
  {
    file: "components/mobile/index.ts",
    markers: ["MobileAppShell", "MobileAppShellNavItem", "MobileAppShellRole"],
    reason: "the shared shell contract must remain exported",
  },
  {
    file: "app/dashboard.tsx",
    markers: [
      "OperationsDashboardSurface",
      "MobileAppShell",
      "centralAction={{",
      "getMobileDashboardNavigation",
      "navItems={navItems}",
      'role={isAttendant ? "attendant" : "owner"}',
      "businessName={profile?.businessName",
      "ownerOnly: true",
      "getOfflineProvisionalProjection",
      "trpc.orders.list",
      "trpc.inventory.balanceReport",
      "trpc.services.queue",
      "trpc.tenant.featureAvailability",
      "mergeMobileWorkspaceFeatureAvailability",
      "featureVisibility.showGettingStarted",
      "featureVisibility.showOrderHistory",
      'label: "Catalog"',
      'label: "Work"',
      'label: "Reports"',
    ],
    reason:
      "the generic dashboard must preserve stable role-aware tabs plus record-derived and provisional content",
  },
]

const failures = []
for (const contract of contracts) {
  const filePath = join(SOURCE_DIR, contract.file)
  const source = readFileSync(filePath, "utf8")
  const missing = contract.markers.filter((marker) => !source.includes(marker))
  if (missing.length > 0) {
    failures.push({
      file: relative(MOBILE_DIR, filePath),
      message: `missing ${missing.join(", ")} (${contract.reason})`,
    })
  }
}

if (failures.length > 0) {
  console.error("Mobile generic app shell check failed.")
  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.message}`)
  }
  process.exit(1)
}

console.log("Mobile generic app shell check passed.")
