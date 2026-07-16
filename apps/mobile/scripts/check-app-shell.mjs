import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")

const requiredMarkers = [
  {
    file: "components/mobile/app-shell.tsx",
    markers: [
      "MobileAppShell",
      "MobileAppShellNavItem",
      'MobileAppShellRole = "attendant" | "owner"',
      "mobile-shell-floating-nav",
      "mobile-shell-central-action",
      "MOBILE_DESIGN_FOUNDATION.layout.floatingControlRadiusClass",
      'role === "owner" || !item.ownerOnly',
      "useSafeAreaInsets",
      "StatusBar",
      "statusBarColor",
      "mobile-shell-status-bar-background",
      "hasStartedScroll",
      "isBottomTabHidden",
      "onScroll={handleScroll}",
      "hideOnScroll",
      "paddingBottom: Math.max(insets.bottom + 116, 152)",
      'pointerEvents="box-none"',
    ],
  },
  {
    file: "components/mobile/index.ts",
    markers: ["MobileAppShell", "MobileAppShellNavItem", "MobileAppShellRole"],
  },
  {
    file: "app/dashboard.tsx",
    markers: [
      "MobileAppShell",
      "shellNavItems",
      "shellCentralAction",
      'role={isAttendantDashboard ? "attendant" : "owner"}',
      "businessName={",
      "syncBanner={syncBanner}",
      "ownerOnly: true",
      "visibleQuickActions",
    ],
  },
]

const forbiddenMarkers = [
  {
    file: "components/mobile/app-shell.tsx",
    markers: ["hideOnScroll={false}"],
  },
]

const failures = []

for (const check of requiredMarkers) {
  const filePath = join(SOURCE_DIR, check.file)
  const contents = readFileSync(filePath, "utf8")

  for (const marker of check.markers) {
    if (contents.includes(marker)) continue

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      marker,
    })
  }
}

for (const check of forbiddenMarkers) {
  const filePath = join(SOURCE_DIR, check.file)
  const contents = readFileSync(filePath, "utf8")

  for (const marker of check.markers) {
    if (!contents.includes(marker)) continue

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      marker: `forbidden marker present: ${marker}`,
    })
  }
}

if (failures.length > 0) {
  console.error("Mobile app shell check failed.")

  for (const failure of failures) {
    console.error(`- ${failure.file} is missing marker: ${failure.marker}`)
  }

  process.exit(1)
}

console.log("Mobile app shell check passed.")
