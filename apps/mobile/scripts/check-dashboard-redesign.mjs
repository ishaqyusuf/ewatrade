import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")

const requiredMarkers = [
  {
    file: "app/dashboard.tsx",
    markers: [
      "MobileAppShell",
      "StatusBanner",
      "OperationsDashboardSurface",
      "isSalesRepRole",
      "getOfflineProvisionalProjection",
      "hasProduct",
      "hasSellableCatalogItem",
      "featureAvailability.hasActiveSellableItems",
      "packagedBalanceCount",
      'row.kind === "PACKAGED_STOCK"',
      "featureAvailability.hasProductItems",
      "packagedBalanceCount >= 2",
      "BusinessHomeMarketLedgerHero",
      "BusinessHomeMarketLedgerSetup",
      "BusinessHomeMarketLedgerOverview",
      "BusinessHomeMarketLedgerSectionHeader",
      "BusinessHomeMarketLedgerEmptyOrders",
      "DashboardActionRow",
      "DashboardRecentOrderRow",
      'title="Recent orders"',
      'actionLabel={isAttendant ? undefined : "See all"}',
      "statusBarFollowsHero",
      "statusBarColor={marketDay.paprika}",
      "scrolledStatusBarColor={marketDay.canvas}",
      "Add a product",
      "Add a service",
      "Add a sellable item to create orders",
      "getOrderStatusTone",
      "trpc.tenant.featureAvailability",
      "mergeMobileWorkspaceFeatureAvailability",
      "featureVisibility.showGettingStarted",
      'label: "Catalog"',
      'label: "Work"',
      'label: "Reports"',
      "CreateActionSheet",
      "createModal.present",
      'label: "Product"',
      'label: "Service"',
      'label: "Customer"',
      'label: "Order"',
      "Create your first product/service to use order feature",
      "disabled: !hasSellableCatalogItem",
      "disabled={action.disabled}",
      "Stock Entry",
      'label: "Staff"',
      'icon="Plus"',
      "hideHeader",
      "/first-product-setup-modal?kind=product",
      "/first-product-setup-modal?kind=service",
      "/business-switch-modal",
      "/sync-status-modal",
    ],
  },
  {
    file: "components/mobile/dashboard-kit.tsx",
    markers: [
      "DashboardHomeHeader",
      "DashboardOverviewMetric",
      "DashboardRevenueCard",
      "DashboardActionRow",
      "DashboardRecentOrderRow",
      "StatusBadge",
      "border-b border-border/70",
      "text-primary-foreground",
    ],
  },
  {
    file: "components/mobile/business-home-market-ledger.tsx",
    markers: [
      "BusinessHomeMarketLedgerHero",
      "BusinessHomeMarketLedgerSetup",
      "BusinessHomeMarketLedgerOverview",
      "BusinessHomeMarketLedgerSectionHeader",
      "BusinessHomeMarketLedgerEmptyOrders",
      "useMarketDayPalette",
      "marketDay.heroHairline",
      "useLargeTextLayout",
      "Good morning,",
      "TODAY · MARKET LEDGER",
      "Set up your Store",
      "Store snapshot",
      "Recent orders",
      "CLEAR TILL",
      'tone === "attention" ? marketDay.marigold : marketDay.palm',
      "sectionHeaderLargeText",
      "operationalHeadingLargeText",
      "marketDay.onPaprika",
      "getBusinessHomeLedgerStepSemantics",
      "disabled={disabled}",
      "minHeight: 44",
    ],
  },
  {
    file: "components/mobile/business-home-market-ledger-qa-screen.tsx",
    markers: ["BusinessHomeMarketLedgerQaScreen", "statusBarFollowsHero"],
  },
  {
    file: "lib/business-home-market-ledger-qa.ts",
    markers: [
      "BUSINESS_HOME_MARKET_LEDGER_QA_STATES",
      '"catalog-ready"',
      '"attendant"',
      '"loading"',
      '"offline"',
      '"operational-empty"',
      '"operational-populated"',
      '"pending-sync"',
      '"setup"',
      "resolveBusinessHomeMarketLedgerQaPath",
      'url.protocol !== "ewatrade-dev:"',
      'url.hostname !== "business-home-market-ledger"',
    ],
  },
  {
    file: "app/design-system/business-home-market-ledger.tsx",
    markers: [
      "__DEV__",
      "BusinessHomeMarketLedgerQaScreen",
      "BusinessHomeMarketLedgerQaState",
      '<Redirect href="/design-system" />',
    ],
  },
  {
    file: "app/first-product-setup-modal.tsx",
    markers: [
      "useLocalSearchParams",
      'params.kind === "product"',
      'params.kind === "service"',
      "initialKind={initialKind}",
      "Add product",
      "Add service",
    ],
  },
  {
    file: "components/mobile/simple-catalog-item-screen.tsx",
    markers: ["initialKind?: CatalogItemKind", "initialKind ?? null"],
  },
  {
    file: "components/mobile/app-shell.tsx",
    markers: [
      "StatusBar",
      "contentStatusBarStyle",
      "heroStatusBarStyle",
      "hero",
      "statusBarColor",
      "statusBarFollowsHero",
      "effectiveStatusBarSwitchOffset",
      "heroHeight - insets.top",
      "statusBarFollowsHero ? insets.top : 0",
      "scrollY + 0.5 >= effectiveStatusBarSwitchOffset",
      '!hero || statusBarFollowsHero ? "100%" : undefined',
      "mobile-shell-status-bar-background",
      "hasStartedScroll",
      "isBottomTabHidden",
      "onScroll={handleScroll}",
      "hideOnScroll",
    ],
  },
]

const forbiddenMarkers = [
  {
    file: "app/dashboard.tsx",
    markers: [
      "Retail ops",
      "Feed",
      "Bag",
      "featureVisibility.showCatalog",
      "featureVisibility.showReports",
      "featureVisibility.showServiceWork",
      "showSecondaryAdminHomeSections",
      'headerAction={<Logout tone="hero" />}',
      'label: "Add a product or service"',
      "<DashboardHomeHeader",
      "<DashboardOverviewMetric",
      "<DashboardRevenueCard",
    ],
  },
  {
    file: "components/mobile/app-shell.tsx",
    markers: ["hideOnScroll={false}"],
  },
  {
    file: "components/mobile/business-home-market-ledger-qa-screen.tsx",
    markers: ["useTRPC", "fetch(", "apiClient"],
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
      message: `missing marker: ${marker}`,
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
      message: `contains obsolete marker: ${marker}`,
    })
  }
}

if (failures.length > 0) {
  console.error("Mobile generic operations dashboard check failed.")

  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Mobile generic operations dashboard check passed.")
