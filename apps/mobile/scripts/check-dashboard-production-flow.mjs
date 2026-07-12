import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  businessStore: join(MOBILE_DIR, "src/store/businessStore.ts"),
  dashboard: join(MOBILE_DIR, "src/app/dashboard.tsx"),
  mobileAuthQueries: join(REPO_ROOT, "packages/db/src/queries/mobile-auth.ts"),
  sessionStore: join(MOBILE_DIR, "src/lib/session-store.ts"),
}

const CONTRACTS = [
  {
    file: FILES.dashboard,
    markers: [
      "const canReadProductionDashboard = isAuthenticated && !isOfflineMode",
      "trpc.retailOps.summary.queryOptions",
      "trpc.retailOps.recentSales.queryOptions",
      "trpc.retailOps.subscription.queryOptions",
      "trpc.retailOps.staff.queryOptions",
      "trpc.retailOps.customerBook.queryOptions",
      "enabled: canReadProductionDashboard",
      "retry: false",
      "productionDashboardReady",
      "dashboardSummaryQuery.isError",
    ],
    reason:
      "dashboard must keep production summary, sales, subscription, staff, and customer snapshot reads gated by auth/online state with local fallback",
  },
  {
    file: FILES.dashboard,
    markers: [
      "productionSummary.sales.totalMinor",
      "productionSummary.sales.orderCount",
      "productionSummary.sales.pendingOrderCount",
      "productionSummary.inventory.lowStockCount",
      "productionSummary.sessions.openCount",
      "productionSummary.inventory.stockUnitCount",
      "todayPaymentTotals.gross",
      "localPendingOrderCount",
      "lowStockAlerts.length",
      "openRepSessions.length",
      "localStockUnitCount",
    ],
    reason:
      "dashboard metrics must prefer production summary values online and fall back to local sales, product links, inventory, and rep sessions",
  },
  {
    file: FILES.dashboard,
    markers: [
      "productionRecentSaleItems",
      "productionRecentIds",
      "productionRecentExternalIds",
      "localRecentSaleItems",
      "recentSalePreviewRows",
      "visibleRecentSales",
      "DASHBOARD_RECENT_SALE_PREVIEW_LIMIT",
    ],
    reason:
      "recent sales must merge production rows with unsynced local rows while avoiding duplicate synced local sales",
  },
  {
    file: FILES.dashboard,
    markers: [
      "productionStaffPreview",
      "localStaffPreview",
      "staffPreviewRows",
      "visibleStaffPreview",
      "productionCustomerPreview",
      "localCustomerPreview",
      "customerPreviewRows",
      "visibleCustomerPreview",
      "getStaffPreviewKey",
      "getCustomerPreviewKey",
    ],
    reason:
      "staff and customer dashboard previews must merge production rows with pending local rows and keep bounded visible previews",
  },
  {
    file: FILES.dashboard,
    markers: [
      "isAttendantDashboard",
      "const canManageInventory = !isAttendantDashboard",
      "visibleQuickActions",
      'action.label === "New sale"',
      "if (isAttendantDashboard) return",
      "isAttendant={isAttendantDashboard}",
      "{isAttendantDashboard ? null : (",
      "isInvitedStaffProfile(profile)",
      '<Redirect href="/staff-onboarding" />',
    ],
    reason:
      "dashboard must keep role-appropriate attendant gating, invited-staff redirect, and owner-only management hiding",
  },
  {
    file: FILES.dashboard,
    markers: [
      "shouldPromptFirstProduct",
      "productionInventoryKnown",
      "productionSummary?.inventory.stockUnitCount",
      "!canReadProductionDashboard",
      "dashboardSummaryQuery.isError",
      "isAttendantDashboard",
      "setupModal.present()",
      "setupPromptedBusinessRef",
    ],
    reason:
      "first-product prompt must use production inventory knowledge when online, local fallback when offline/error, and avoid auto-opening for attendants",
  },
  {
    file: FILES.dashboard,
    markers: [
      "syncBannerText",
      "Offline mode. Changes will be applied when next you connect.",
      "pendingSyncEvents",
      "failedSyncEvents",
      "conflictSyncEvents",
      'testID="retail-sync-banner"',
      "syncModal.present()",
    ],
    reason:
      "dashboard must keep offline/sync state visible without blocking selling flow",
  },
  {
    file: FILES.dashboard,
    markers: [
      "FirstProductSetupSheet",
      "CreateSaleSheet",
      "CustomerBookSheet",
      "ProductShareSheet",
      "ReportsSheet",
      "StaffInviteSheet",
      "StockIntakeSheet",
      "SubscriptionPlanSheet",
      "UnitConversionSheet",
      "SyncStatusSheet",
    ],
    reason:
      "dashboard must keep reusable sheet entry points instead of collapsing MVP workflows into one bulky component",
  },
  {
    file: FILES.businessStore,
    markers: [
      "id?: string",
      "id: input.id?.trim() || createId()",
      "ensureBusiness",
      "setActiveBusiness",
      "activeBusinessId",
      "ewatrade-mobile-businesses",
    ],
    reason:
      "business store must preserve production tenant id seeding and active-business persistence for offline dashboard records",
  },
  {
    file: FILES.sessionStore,
    markers: [
      "businessId?: string",
      "businessName?: string",
      "role?: string",
      "status?: string",
      "MobileSession",
      "SecureStore",
    ],
    reason:
      "mobile session profile must preserve production business, membership role, and invited/active status for dashboard gating",
  },
  {
    file: FILES.mobileAuthQueries,
    markers: [
      "businessId: tenant.id",
      "businessName: tenant.name",
      "role: tenant.role",
      "status: tenant.status",
      "verifyMobileOwnerOtp",
      "verifyMobileGoogleIdentity",
    ],
    reason:
      "mobile auth must return production tenant id, business name, role, and membership status for dashboard setup and staff gating",
  },
]
const failures = []

for (const contract of CONTRACTS) {
  const source = readFileSync(contract.file, "utf8")
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

if (failures.length > 0) {
  console.error(
    "Dashboard production flow check failed. Restore production snapshot reads, local fallback, role gating, sync visibility, or reusable sheet boundaries.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Dashboard production flow check passed.")
