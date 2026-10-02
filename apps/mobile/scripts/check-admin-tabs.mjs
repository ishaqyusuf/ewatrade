import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const REPO_DIR = resolve(MOBILE_DIR, "../..")

const contracts = [
  {
    file: "src/app/(admin-tabs)/_layout.tsx",
    markers: [
      "AdminTabsProvider",
      "AdminCreateActionSheet",
      "AdminTabBar",
      'initialRouteName="admin-home"',
      '<Tabs.Screen name="orders"',
      '<Tabs.Screen name="catalog"',
      '<Tabs.Screen name="more"',
      'command.payload.kind === "commercial_order"',
    ],
  },
  {
    file: "src/components/mobile/admin-tabs/admin-tab-bar.tsx",
    markers: [
      "MobileBottomTabs",
      'label: "+"',
      'kind: "action"',
      "hideOnScroll",
      "isHidden={isHidden}",
      'testID="admin-root-tab-dock"',
      "StyleSheet.absoluteFillObject",
      'pointerEvents="box-none"',
    ],
  },
  {
    file: "src/components/mobile/bottom-tab-item.tsx",
    markers: [
      "DISPLAY_TEXT_FONT_SCALE_CAP",
      "useLargeTextLayout",
      "adjustsFontSizeToFit={!largeTextLayout}",
      "numberOfLines={largeTextLayout ? 2 : 1}",
      "isOperationalNavigation",
      'textAlign: "center"',
      'width: "100%"',
      'isOperationalNavigation && "w-full"',
    ],
  },
  {
    file: "src/components/mobile/admin-tabs/admin-orders-screen.tsx",
    markers: ["OrdersScreen as AdminOrdersScreen"],
  },
  {
    file: "src/components/mobile/orders/orders-screen.tsx",
    markers: [
      "FlatList",
      "CommercePendingOrderRow",
      "useAdminDockScroll",
      "Orders pending sync",
      "Search order, customer, or item",
      "No matching orders",
      "orders.refetch",
    ],
  },
  {
    file: "src/components/mobile/catalog-items-sheet.tsx",
    markers: ["CatalogItemsContent"],
  },
  {
    file: "src/components/mobile/catalog/catalog-presentation.ts",
    markers: ['presentation?: "modal" | "tab"'],
  },
  {
    file: "src/components/mobile/catalog/catalog-screen.tsx",
    markers: ['presentation === "tab"'],
  },
  {
    file: "src/components/mobile/admin-tabs/admin-create-action-sheet.tsx",
    markers: [
      "Quick create",
      "What are you adding?",
      "buildAdminCreateActions",
      'largeTextLayout ? ["92%"] : [actions.length > 5 ? "64%" : "56%"]',
      "BottomSheetScrollView",
      '"-mx-2 min-h-16 flex-row gap-3 border-t border-border px-3 py-3"',
      'largeTextLayout ? "items-start" : "items-center"',
      "StatusBadge",
    ],
  },
  {
    file: "src/lib/admin-create-actions.ts",
    markers: [
      'label: "Product"',
      'label: "Service"',
      "statusLabel: availability.hasActiveSellableItems",
      "statusLabel: availability.hasProductItems",
    ],
  },
  {
    file: "src/components/mobile/admin-tabs/admin-more-screen.tsx",
    markers: ["MoreScreen as AdminMoreScreen"],
  },
  {
    file: "src/components/mobile/more/more-screen.tsx",
    markers: [
      "Current business",
      "buildAdminMoreSections",
      "buildAppThemeOptions",
      "syncAlertCount",
      "commitAppThemeSelection",
      "persist: setThemeOverride",
      "themeSavePending",
      "useResetAdminDock",
      "MoreThemeSheet",
      "MoreSignOutSheet",
    ],
  },
  {
    file: "src/components/mobile/more/more-sheets.tsx",
    markers: [
      'accessibilityLabel="App theme"',
      'accessibilityRole="radio"',
      "unsynced",
    ],
  },
  {
    file: "src/components/mobile/appearances/classic/more-screen.tsx",
    markers: ["Manage your store and account.", "StatusBadge"],
  },
  {
    file: "src/components/mobile/app-theme-presentation.ts",
    markers: [
      "buildAppThemeOptions",
      'label: "System"',
      'label: "Light"',
      'label: "Dark"',
      "Follow device setting · currently",
    ],
  },
  {
    file: "src/components/mobile/app-theme-selection.ts",
    markers: [
      "commitAppThemeSelection",
      'return "unchanged"',
      "await persist(next)",
      "apply(current)",
      'return "failed"',
    ],
  },
  {
    file: "src/lib/admin-navigation.ts",
    markers: [
      'AdminTabKey = "home" | "orders" | "catalog" | "more"',
      'AdminCatalogTabLabel = "Products" | "Services" | "Catalog"',
      'normalizedRole === "MANAGER"',
      'routeName: "catalog"',
      'label: "App theme"',
    ],
  },
  {
    file: "src/app/_layout.tsx",
    markers: ['name="(admin-tabs)"', "canAccessAdminTabs"],
  },
  {
    file: "assets/images/design-system/reference-admin-more.png",
    markers: [],
  },
  {
    file: "src/components/mobile/design-system/designs/design-01/design-01.data.ts",
    markers: [
      "DESIGN_01_ADMIN_MORE_REFERENCE",
      "reference-admin-more.png",
      "DESIGN_01_ROUTES.moreImage",
    ],
  },
]

const failures = []

for (const contract of contracts) {
  const path = join(MOBILE_DIR, contract.file)
  if (!existsSync(path)) {
    failures.push(`${contract.file} is missing`)
    continue
  }
  if (contract.markers.length === 0) continue
  const source = readFileSync(path, "utf8")
  for (const marker of contract.markers) {
    if (!source.includes(marker)) {
      failures.push(`${contract.file} is missing marker: ${marker}`)
    }
  }
}

const gitignore = readFileSync(join(REPO_DIR, ".gitignore"), "utf8")
if (!gitignore.split("\n").includes("/.designs/")) {
  failures.push(".gitignore must ignore the root /.designs/ archive")
}

if (failures.length > 0) {
  console.error("Admin tabs contract check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Admin tabs contract check passed.")
