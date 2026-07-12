import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  businessSwitch: join(
    MOBILE_DIR,
    "src/components/mobile/business-switch-sheet.tsx",
  ),
  closeout: join(MOBILE_DIR, "src/components/mobile/closeout-sheet.tsx"),
  createSale: join(MOBILE_DIR, "src/components/mobile/create-sale-sheet.tsx"),
  customerBook: join(
    MOBILE_DIR,
    "src/components/mobile/customer-book-sheet.tsx",
  ),
  dashboard: join(MOBILE_DIR, "src/app/dashboard.tsx"),
  productShare: join(
    MOBILE_DIR,
    "src/components/mobile/product-share-sheet.tsx",
  ),
  reports: join(MOBILE_DIR, "src/components/mobile/reports-sheet.tsx"),
  repClockIn: join(MOBILE_DIR, "src/components/mobile/rep-clock-in-sheet.tsx"),
  staffInvite: join(MOBILE_DIR, "src/components/mobile/staff-invite-sheet.tsx"),
  stockIntake: join(MOBILE_DIR, "src/components/mobile/stock-intake-sheet.tsx"),
  syncStatus: join(MOBILE_DIR, "src/components/mobile/sync-status-sheet.tsx"),
  unitConversion: join(
    MOBILE_DIR,
    "src/components/mobile/unit-conversion-sheet.tsx",
  ),
}

const CONTRACTS = [
  {
    file: FILES.createSale,
    markers: [
      "BottomSheetSectionList",
      "products.map((product) => ({",
      "data: getSellableItems(product).map",
      "visibleCustomerOptions",
      "slice(0, 8)",
    ],
    reason:
      "create sale must keep product rows virtualized and bound customer suggestions",
  },
  {
    file: FILES.customerBook,
    markers: [
      "BottomSheetFlatList",
      "visibleCustomers",
      "mergedRows.push(localRow)",
      "keyExtractor",
      "data={visibleCustomers}",
    ],
    reason:
      "customer book must keep merged production/local customer rows virtualized",
  },
  {
    file: FILES.productShare,
    markers: [
      "visibleProducts",
      "filteredProducts.slice(0, 12)",
      "visibleShareLinks",
      "shareLinks.slice(0, 8)",
      "visibleProductionLinks",
      "productionLinks.slice(0, 8)",
      "visibleOrderRequests",
      "orderRequests.slice(0, 6)",
      "visibleDeliveryRequests",
      "deliveryRequests.slice(0, 6)",
      "Showing first",
    ],
    reason:
      "product share management must bound product, link, order, and delivery previews",
  },
  {
    file: FILES.stockIntake,
    markers: [
      "visibleProducts",
      "filteredProducts.slice(0, 12)",
      "STOCK_UNIT_PREVIEW_LIMIT",
      "filteredUnitOptions.slice(0, STOCK_UNIT_PREVIEW_LIMIT)",
      "STOCK_MOVEMENT_PREVIEW_LIMIT",
      "stockMovements.slice(0, STOCK_MOVEMENT_PREVIEW_LIMIT)",
      "Showing first",
    ],
    reason:
      "stock intake must bound product, unit, and movement rows with count copy",
  },
  {
    file: FILES.unitConversion,
    markers: [
      "visibleConvertibleProducts",
      "filteredConvertibleProducts.slice(0, 12)",
      "CONVERSION_VARIANT_PREVIEW_LIMIT",
      "filteredSelectedVariants.slice(0, CONVERSION_VARIANT_PREVIEW_LIMIT)",
      "Showing first",
    ],
    reason:
      "unit conversion must bound product and variant pickers with count copy",
  },
  {
    file: FILES.repClockIn,
    markers: [
      "filteredOpeningInventoryLines",
      "visibleOpeningInventoryLines",
      "filteredOpeningInventoryLines.slice(0, 12)",
      "Showing first",
      "stock lines",
    ],
    reason:
      "rep clock-in must bound opening inventory declarations while submitting the full line set",
  },
  {
    file: FILES.closeout,
    markers: [
      "filteredInventoryLines",
      "visibleInventoryLines",
      "filteredInventoryLines.slice(0, 12)",
      "Showing first",
      "stock lines",
    ],
    reason:
      "closeout must bound closing inventory declarations while submitting the full line set",
  },
  {
    file: FILES.reports,
    markers: [
      "visibleLimit = 8",
      "const visibleRows = rows.slice(0, visibleLimit)",
      "Showing first",
      "rows.length",
    ],
    reason: "reports sections must bound visible rows with count copy",
  },
  {
    file: FILES.syncStatus,
    markers: [
      "OFFLINE_DEVICE_PREVIEW_LIMIT",
      "SERVER_SYNC_HISTORY_PREVIEW_LIMIT",
      "SERVER_SYNC_CONFLICT_PREVIEW_LIMIT",
      "BLOCKED_EVENT_PREVIEW_LIMIT",
      "SYNC_QUEUE_PREVIEW_LIMIT",
      "visibleActiveOfflineDevices",
      "visibleServerSyncHistory",
      "visibleTenantSyncConflicts",
      "visibleBlockedEvents",
      "visibleSyncEvents",
      "Showing first",
    ],
    reason:
      "sync status must bound device, history, conflict, blocked-event, and queue rows",
  },
  {
    file: FILES.dashboard,
    markers: [
      "DASHBOARD_VARIANT_PREVIEW_LIMIT",
      "DASHBOARD_REP_SESSION_PREVIEW_LIMIT",
      "DASHBOARD_LOW_STOCK_PREVIEW_LIMIT",
      "DASHBOARD_STAFF_PREVIEW_LIMIT",
      "DASHBOARD_CUSTOMER_PREVIEW_LIMIT",
      "DASHBOARD_RECENT_SALE_PREVIEW_LIMIT",
      "visibleVariants",
      "visibleStaffPreview",
      "visibleCustomerPreview",
      "visibleRecentSales",
      "Showing first",
    ],
    reason:
      "dashboard previews must stay bounded for variant, session, stock, staff, customer, and sale rows",
  },
  {
    file: FILES.staffInvite,
    markers: [
      "STAFF_PREVIEW_LIMIT",
      "visibleStaffRows",
      "staffRows.slice(0, STAFF_PREVIEW_LIMIT)",
      "Showing first",
    ],
    reason: "staff invite must bound staff preview rows",
  },
  {
    file: FILES.businessSwitch,
    markers: [
      "BUSINESS_PREVIEW_LIMIT",
      "visibleBusinesses",
      "filteredBusinesses.slice(0, BUSINESS_PREVIEW_LIMIT)",
      "Showing first",
    ],
    reason: "business switch must bound searchable business rows",
  },
]
const DIRECT_RENDER_FORBIDDEN = [
  {
    file: FILES.createSale,
    patterns: [
      {
        pattern: /saleSections\.map\(/,
        reason:
          "create-sale product and checkout rows must stay on BottomSheetSectionList for large catalogs",
      },
      {
        pattern: /sellableSections\.map\(/,
        reason:
          "create-sale product sections must not be direct-rendered for large catalogs",
      },
    ],
  },
  {
    file: FILES.customerBook,
    patterns: [
      {
        pattern: /visibleCustomers\.map\(/,
        reason:
          "customer book rows must stay on BottomSheetFlatList for large customer books",
      },
    ],
  },
]
const STRESS_TOTALS = {
  businesses: 75,
  checkoutCustomerOptions: 160,
  closingStockLines: 180,
  dashboardCustomers: 90,
  dashboardLowStockAlerts: 80,
  dashboardOpenSessions: 60,
  dashboardRecentSales: 200,
  dashboardStaff: 80,
  dashboardStockMovements: 180,
  dashboardVariants: 48,
  deliveryRequests: 80,
  offlineDevices: 50,
  openingStockLines: 180,
  orderRequests: 80,
  productShareProducts: 250,
  productionLinks: 80,
  reportRows: 250,
  shareLinks: 80,
  staffRows: 80,
  stockIntakeProducts: 250,
  stockMovementRows: 180,
  stockUnits: 48,
  syncBlockedEvents: 60,
  syncEvents: 250,
  syncHistory: 80,
  syncServerConflicts: 80,
  unitConversionProducts: 250,
  unitConversionVariants: 80,
}
const failures = []
const sourceCache = new Map()

for (const contract of CONTRACTS) {
  const source = readSource(contract.file)
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: contract.file,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

for (const contract of DIRECT_RENDER_FORBIDDEN) {
  const source = readSource(contract.file)

  for (const forbidden of contract.patterns) {
    if (!forbidden.pattern.test(source)) continue

    failures.push({
      file: contract.file,
      message: `contains forbidden ${forbidden.pattern} (${forbidden.reason})`,
    })
  }
}

runStressChecks()

if (failures.length > 0) {
  console.error(
    "Mobile long-list coverage check failed. Restore virtualized lists, bounded visible windows, stress-count protection, and count copy for MVP list-heavy surfaces.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Mobile long-list coverage check passed.")

function readSource(file) {
  if (!sourceCache.has(file)) {
    sourceCache.set(file, readFileSync(file, "utf8"))
  }

  return sourceCache.get(file)
}

function getConstantLimit(file, name) {
  const source = readSource(file)
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`)
  const match = source.match(pattern)

  if (!match) {
    failures.push({
      file,
      message: `missing numeric ${name} limit for long-list stress checks`,
    })
    return null
  }

  return Number(match[1])
}

function expectStressWindow({ file, label, limit, total }) {
  if (!Number.isFinite(limit) || limit <= 0) {
    failures.push({
      file,
      message: `${label} has an invalid preview limit: ${String(limit)}`,
    })
    return
  }

  const rows = Array.from({ length: total }, (_, index) => index)
  const visibleRows = rows.slice(0, limit)

  if (visibleRows.length !== limit) {
    failures.push({
      file,
      message: `${label} stress fixture expected ${limit} visible rows from ${total} records but got ${visibleRows.length}`,
    })
  }

  if (rows.length <= visibleRows.length) {
    failures.push({
      file,
      message: `${label} stress fixture must leave hidden rows so count copy is exercised`,
    })
  }
}

function runStressChecks() {
  expectStressWindow({
    file: FILES.createSale,
    label: "Create Sale customer suggestions",
    limit: 8,
    total: STRESS_TOTALS.checkoutCustomerOptions,
  })
  expectStressWindow({
    file: FILES.productShare,
    label: "Product links product picker",
    limit: 12,
    total: STRESS_TOTALS.productShareProducts,
  })
  expectStressWindow({
    file: FILES.productShare,
    label: "Local generated links",
    limit: 8,
    total: STRESS_TOTALS.shareLinks,
  })
  expectStressWindow({
    file: FILES.productShare,
    label: "Production generated links",
    limit: 8,
    total: STRESS_TOTALS.productionLinks,
  })
  expectStressWindow({
    file: FILES.productShare,
    label: "Shared-link order requests",
    limit: 6,
    total: STRESS_TOTALS.orderRequests,
  })
  expectStressWindow({
    file: FILES.productShare,
    label: "Delivery requests",
    limit: 6,
    total: STRESS_TOTALS.deliveryRequests,
  })
  expectStressWindow({
    file: FILES.stockIntake,
    label: "Stock intake product picker",
    limit: 12,
    total: STRESS_TOTALS.stockIntakeProducts,
  })
  expectStressWindow({
    file: FILES.stockIntake,
    label: "Stock intake unit picker",
    limit: getConstantLimit(FILES.stockIntake, "STOCK_UNIT_PREVIEW_LIMIT"),
    total: STRESS_TOTALS.stockUnits,
  })
  expectStressWindow({
    file: FILES.stockIntake,
    label: "Stock movements",
    limit: getConstantLimit(FILES.stockIntake, "STOCK_MOVEMENT_PREVIEW_LIMIT"),
    total: STRESS_TOTALS.stockMovementRows,
  })
  expectStressWindow({
    file: FILES.unitConversion,
    label: "Unit conversion product picker",
    limit: 12,
    total: STRESS_TOTALS.unitConversionProducts,
  })
  expectStressWindow({
    file: FILES.unitConversion,
    label: "Unit conversion variant picker",
    limit: getConstantLimit(
      FILES.unitConversion,
      "CONVERSION_VARIANT_PREVIEW_LIMIT",
    ),
    total: STRESS_TOTALS.unitConversionVariants,
  })
  expectStressWindow({
    file: FILES.repClockIn,
    label: "Opening stock declaration lines",
    limit: 12,
    total: STRESS_TOTALS.openingStockLines,
  })
  expectStressWindow({
    file: FILES.closeout,
    label: "Closing stock declaration lines",
    limit: 12,
    total: STRESS_TOTALS.closingStockLines,
  })
  expectStressWindow({
    file: FILES.reports,
    label: "Report section rows",
    limit: 8,
    total: STRESS_TOTALS.reportRows,
  })
  expectStressWindow({
    file: FILES.syncStatus,
    label: "Offline devices",
    limit: getConstantLimit(FILES.syncStatus, "OFFLINE_DEVICE_PREVIEW_LIMIT"),
    total: STRESS_TOTALS.offlineDevices,
  })
  expectStressWindow({
    file: FILES.syncStatus,
    label: "Server sync history",
    limit: getConstantLimit(
      FILES.syncStatus,
      "SERVER_SYNC_HISTORY_PREVIEW_LIMIT",
    ),
    total: STRESS_TOTALS.syncHistory,
  })
  expectStressWindow({
    file: FILES.syncStatus,
    label: "Server sync conflicts",
    limit: getConstantLimit(
      FILES.syncStatus,
      "SERVER_SYNC_CONFLICT_PREVIEW_LIMIT",
    ),
    total: STRESS_TOTALS.syncServerConflicts,
  })
  expectStressWindow({
    file: FILES.syncStatus,
    label: "Blocked sync events",
    limit: getConstantLimit(FILES.syncStatus, "BLOCKED_EVENT_PREVIEW_LIMIT"),
    total: STRESS_TOTALS.syncBlockedEvents,
  })
  expectStressWindow({
    file: FILES.syncStatus,
    label: "Local sync queue events",
    limit: getConstantLimit(FILES.syncStatus, "SYNC_QUEUE_PREVIEW_LIMIT"),
    total: STRESS_TOTALS.syncEvents,
  })
  expectStressWindow({
    file: FILES.dashboard,
    label: "Dashboard variant previews",
    limit: getConstantLimit(FILES.dashboard, "DASHBOARD_VARIANT_PREVIEW_LIMIT"),
    total: STRESS_TOTALS.dashboardVariants,
  })
  expectStressWindow({
    file: FILES.dashboard,
    label: "Dashboard session previews",
    limit: getConstantLimit(
      FILES.dashboard,
      "DASHBOARD_REP_SESSION_PREVIEW_LIMIT",
    ),
    total: STRESS_TOTALS.dashboardOpenSessions,
  })
  expectStressWindow({
    file: FILES.dashboard,
    label: "Dashboard low-stock previews",
    limit: getConstantLimit(
      FILES.dashboard,
      "DASHBOARD_LOW_STOCK_PREVIEW_LIMIT",
    ),
    total: STRESS_TOTALS.dashboardLowStockAlerts,
  })
  expectStressWindow({
    file: FILES.dashboard,
    label: "Dashboard staff previews",
    limit: getConstantLimit(FILES.dashboard, "DASHBOARD_STAFF_PREVIEW_LIMIT"),
    total: STRESS_TOTALS.dashboardStaff,
  })
  expectStressWindow({
    file: FILES.dashboard,
    label: "Dashboard customer previews",
    limit: getConstantLimit(
      FILES.dashboard,
      "DASHBOARD_CUSTOMER_PREVIEW_LIMIT",
    ),
    total: STRESS_TOTALS.dashboardCustomers,
  })
  expectStressWindow({
    file: FILES.dashboard,
    label: "Dashboard recent sales",
    limit: getConstantLimit(
      FILES.dashboard,
      "DASHBOARD_RECENT_SALE_PREVIEW_LIMIT",
    ),
    total: STRESS_TOTALS.dashboardRecentSales,
  })
  expectStressWindow({
    file: FILES.staffInvite,
    label: "Staff invite rows",
    limit: getConstantLimit(FILES.staffInvite, "STAFF_PREVIEW_LIMIT"),
    total: STRESS_TOTALS.staffRows,
  })
  expectStressWindow({
    file: FILES.businessSwitch,
    label: "Business switch rows",
    limit: getConstantLimit(FILES.businessSwitch, "BUSINESS_PREVIEW_LIMIT"),
    total: STRESS_TOTALS.businesses,
  })
}
