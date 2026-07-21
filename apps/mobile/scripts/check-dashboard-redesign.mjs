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
      "!isAttendant && packagedBalanceCount >= 2",
      "Quick actions",
      "Recent orders",
      "Set up your business",
      "Add your first item",
      "Create a Product or Service",
      "trpc.tenant.featureAvailability",
      "mergeMobileWorkspaceFeatureAvailability",
      "featureVisibility.showOrderHistory",
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
