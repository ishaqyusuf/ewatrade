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
      "useSafeAreaInsets",
      "StatusBar",
      "hideOnScroll",
      "paddingBottom: Math.max(insets.bottom + 116, 152)",
    ],
    reason:
      "the shared shell must preserve role-aware navigation, safe areas, and its central action",
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
      'label: "New order"',
      "navItems={navItems}",
      'role={isAttendant ? "attendant" : "owner"}',
      "businessName={profile?.businessName",
      "ownerOnly: true",
      "getOfflineProvisionalProjection",
      "trpc.catalog.listItems",
      "trpc.orders.list",
      "trpc.inventory.balanceReport",
      "trpc.services.queue",
      "Product and Service Offerings will appear in one order flow.",
    ],
    reason:
      "the generic dashboard must keep catalog, order, inventory, service, role, and provisional-state entry points",
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
