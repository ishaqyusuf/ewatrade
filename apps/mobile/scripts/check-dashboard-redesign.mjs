import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")

const requiredMarkers = [
  {
    file: "app/dashboard.tsx",
    markers: [
      "DashboardCompatibilityRoute",
      "isSalesRepRole",
      '"/sales-rep-home"',
      '"/admin-home"',
    ],
  },
  {
    file: "app/(admin-tabs)/admin-home.tsx",
    markers: ["OperationsDashboardSurface", "embeddedInAdminTabs"],
  },
  {
    file: "app/sales-rep-home.tsx",
    markers: ["OperationsDashboardSurface", "<OperationsDashboardSurface />"],
  },
  {
    file: "components/mobile/dashboard/operations-dashboard-screen.tsx",
    markers: [
      "StatusBanner",
      "OperationsDashboardSurface",
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
      "SalesRepShiftLedgerHero",
      "SalesRepShiftLedgerOverview",
      "SalesRepShiftLedgerSection",
      "SalesRepShiftLedgerEmptySales",
      "getSalesRepShiftLedgerPresentation",
      "DashboardActionRow",
      "DashboardRecentOrderRow",
      'title="Recent orders"',
      'title="Your sales"',
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
    file: "components/mobile/appearances/market-day/dashboard-screen.tsx",
    markers: [
      "MobileAppShell",
      "statusBarFollowsHero",
      "scrolledStatusBarColor={palette.canvas}",
      'props.role === "attendant" ? palette.marigold : palette.paprika',
    ],
  },
  {
    file: "components/mobile/appearances/classic/dashboard-screen.tsx",
    markers: ["MobileAppShell", "<MobileAppShell"],
  },
  {
    file: "components/mobile/appearances/market-day/sales-rep-shift-ledger.tsx",
    markers: [
      "SalesRepShiftLedgerHero",
      "SalesRepShiftLedgerOverview",
      "SalesRepShiftLedgerSection",
      "SalesRepShiftLedgerEmptySales",
      "sales-rep-shift-ledger-hero",
      "sales-rep-shift-ledger-overview",
      "sales-rep-shift-ledger-start-sale",
      "useLargeTextLayout",
      "bg-market-marigold",
      "marketDay.paprika",
      "min-h-[44px]",
      "Sellable catalog",
      "Recent value",
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
    file: "components/mobile/appearances/market-day/business-home-market-ledger.tsx",
    markers: [
      "BusinessHomeMarketLedgerHero",
      "BusinessHomeMarketLedgerSetup",
      "BusinessHomeMarketLedgerOverview",
      "BusinessHomeMarketLedgerSectionHeader",
      "BusinessHomeMarketLedgerEmptyOrders",
      "useMarketDayPalette",
      "bg-market-paprika",
      "useLargeTextLayout",
      "Good morning,",
      "TODAY · MARKET LEDGER",
      "Set up your Store",
      "Store snapshot",
      "Recent orders",
      "CLEAR TILL",
      'tone === "attention" ? "bg-market-marigold" : "bg-market-palm"',
      "sectionHeaderLargeText",
      "operationalHeadingLargeText",
      "marketDay.onPaprika",
      "getBusinessHomeLedgerStepSemantics",
      "disabled={disabled}",
      "min-h-[44px]",
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
    markers: ["SimpleCatalogItemScreen", "catalog-setup/catalog-setup-screen"],
  },
  {
    file: "components/mobile/catalog-setup/catalog-setup-model.ts",
    markers: ["initialKind?: CatalogItemKind"],
  },
  {
    file: "components/mobile/catalog-setup/use-catalog-setup.ts",
    markers: ["initialKind ?? null"],
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
    file: "components/mobile/dashboard/operations-dashboard-screen.tsx",
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
