import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const SRC_DIR = join(MOBILE_DIR, "src")
const SCRATCH_DIR = join(
  REPO_ROOT,
  ".scratch/mobile-navigation-home-system-implementation",
)

const FILES = {
  adminHome: join(SRC_DIR, "app/admin-home.tsx"),
  appShell: join(SRC_DIR, "components/mobile/app-shell.tsx"),
  businessSwitch: join(SRC_DIR, "components/mobile/business-switch-sheet.tsx"),
  businessSwitchModal: join(SRC_DIR, "app/business-switch-modal.tsx"),
  closeout: join(SRC_DIR, "components/mobile/closeout-sheet.tsx"),
  closeoutModal: join(SRC_DIR, "app/closeout-modal.tsx"),
  createSale: join(SRC_DIR, "components/mobile/create-sale-sheet.tsx"),
  createSaleModal: join(SRC_DIR, "app/create-sale-modal.tsx"),
  customerBook: join(SRC_DIR, "components/mobile/customer-book-sheet.tsx"),
  customerBookModal: join(SRC_DIR, "app/customer-book-modal.tsx"),
  dashboard: join(SRC_DIR, "app/dashboard.tsx"),
  firstProductSetup: join(
    SRC_DIR,
    "components/mobile/first-product-setup-sheet.tsx",
  ),
  firstProductSetupModal: join(SRC_DIR, "app/first-product-setup-modal.tsx"),
  homePlan: join(SCRATCH_DIR, "home-screen-plan.md"),
  layout: join(SRC_DIR, "app/_layout.tsx"),
  mobileRoles: join(SRC_DIR, "lib/mobile-roles.ts"),
  productShare: join(SRC_DIR, "components/mobile/product-share-sheet.tsx"),
  productShareModal: join(SRC_DIR, "app/product-share-modal.tsx"),
  salesRepHome: join(SRC_DIR, "app/sales-rep-home.tsx"),
  repClockIn: join(SRC_DIR, "components/mobile/rep-clock-in-sheet.tsx"),
  repClockInModal: join(SRC_DIR, "app/rep-clock-in-modal.tsx"),
  reports: join(SRC_DIR, "components/mobile/reports-sheet.tsx"),
  reportsModal: join(SRC_DIR, "app/reports-modal.tsx"),
  staffInviteModal: join(SRC_DIR, "app/staff-invite-modal.tsx"),
  staffInviteSheet: join(SRC_DIR, "components/mobile/staff-invite-sheet.tsx"),
  stockIntake: join(SRC_DIR, "components/mobile/stock-intake-sheet.tsx"),
  stockIntakeModal: join(SRC_DIR, "app/stock-intake-modal.tsx"),
  subscription: join(SRC_DIR, "components/mobile/subscription-plan-sheet.tsx"),
  subscriptionModal: join(SRC_DIR, "app/subscription-modal.tsx"),
  syncStatus: join(SRC_DIR, "components/mobile/sync-status-sheet.tsx"),
  syncStatusModal: join(SRC_DIR, "app/sync-status-modal.tsx"),
  unitConversion: join(SRC_DIR, "components/mobile/unit-conversion-sheet.tsx"),
  unitConversionModal: join(SRC_DIR, "app/unit-conversion-modal.tsx"),
  verifyEmail: join(SRC_DIR, "app/verify-email.tsx"),
  workflowModalScreen: join(
    SRC_DIR,
    "components/mobile/workflow-modal-screen.tsx",
  ),
}

const checks = [
  {
    file: FILES.mobileRoles,
    markers: [
      "isSalesRepRole",
      "isInvitedStaffProfile",
      "normalizeMobileRole",
    ],
    reason: "role helpers must be centralized for route guards and screens",
  },
  {
    file: FILES.layout,
    markers: [
      "Stack.Protected",
      "admin-home",
      "business-switch-modal",
      "closeout-modal",
      "create-sale-modal",
      "customer-book-modal",
      "first-product-setup-modal",
      "product-share-modal",
      "rep-clock-in-modal",
      "reports-modal",
      "sales-rep-home",
      "staff-invite-modal",
      "stock-intake-modal",
      "subscription-modal",
      "sync-status-modal",
      "unit-conversion-modal",
      "shouldShowFloatingThemeToggle()",
      "isSalesRepRole(profile?.role)",
    ],
    reason:
      "root layout must protect admin, sales-rep, and modal routes and keep the floating theme FAB dev-only",
  },
  {
    file: FILES.adminHome,
    markers: ['<RetailOpsDashboardSurface surface="admin" />'],
    reason: "admin home must be a real route surface",
  },
  {
    file: FILES.salesRepHome,
    markers: ['<RetailOpsDashboardSurface surface="sales-rep" />'],
    reason: "sales-rep home must be a real route surface",
  },
  {
    file: FILES.verifyEmail,
    markers: [
      "role?: string",
      "status?: string",
      "localProfileOverrides",
      "...localProfileOverrides",
    ],
    reason:
      "local fallback auth must support clean owner/sales-rep QA sessions without changing production OTP verification",
  },
  {
    file: FILES.appShell,
    markers: [
      "MobileBottomTabs",
      "hero?: ReactNode",
      "showHeader?: boolean",
      'variant="reference"',
      "render: ({ active })",
      "top: -20",
      "activeLabel=\"Home\"",
    ],
    reason:
      "dashboard shell must use the shared Design 01-style bottom-tab primitive with raised center action",
  },
  {
    file: FILES.dashboard,
    markers: [
      "RetailOpsHomeHero",
      "AdminHomeOverview",
      "SalesRepHomeOverview",
      "DashboardActionPickerSheet",
      "DashboardMoreSheet",
      "DashboardSettingsSheet",
      "DashboardThemeSheet",
      "openBusinessSwitch",
      "openCloseout",
      "openCreateSale",
      "openCustomerBook",
      "openProductShare",
      "openRepClockIn",
      "openReports",
      "openStockIntake",
      "openSubscription",
      "openSyncStatus",
      "settingsNavigationItems",
      "handleThemeSelection",
      "showSecondaryAdminHomeSections = false",
      'label: "Home"',
      'label: "Sales"',
      'label: "Stocks"',
      'label: isAttendantDashboard ? "Customers" : "More"',
      'label: "Sales Reps"',
      'label: "Customers"',
      'label: "Settings"',
      'label: "Theme"',
      'href={isSalesRepRole(profile?.role) ? "/sales-rep-home" : "/admin-home"}',
      '<Redirect href="/sales-rep-home" />',
      '<Redirect href="/admin-home" />',
      "Assigned stock",
    ],
    reason:
      "dashboard must split admin and sales-rep home composition, provide Design 01-style hero, Create/More/Settings/Theme surfaces, and redirect by role",
  },
  {
    file: FILES.homePlan,
    markers: [
      "Admin Home",
      "Sales-Rep Home",
      "Bottom sheets are only for short action choosers",
      "`Home`, `Sales`, `+`, `Stocks`, `More`",
      "Full-screen form routes",
    ],
    reason:
      "the requested first-step home-screen plan must exist and capture navigation, CTA, and modal rules",
  },
  {
    file: FILES.workflowModalScreen,
    markers: [
      "WorkflowModalScreen",
      "Full-screen workflow",
      "allowSalesRep",
      "isInvitedStaffProfile(profile)",
      "MobileScreen",
    ],
    reason:
      "long workflow routes must share one protected full-screen stack modal shell",
  },
  {
    file: FILES.staffInviteModal,
    markers: [
      'ctaPlacement="sticky"',
      "isInvitedStaffProfile(profile) || isSalesRepRole(profile?.role)",
      "router.replace(\"/dashboard\")",
      "scroll={false}",
    ],
    reason:
      "Sales Reps workflow must be a protected full-screen modal route with sticky CTA mode",
  },
  {
    file: FILES.createSaleModal,
    markers: [
      "WorkflowModalScreen",
      "CreateSaleContent",
      'presentation="screen"',
      "allowSalesRep",
    ],
    reason: "create sale must use the full-screen stack modal route",
  },
  {
    file: FILES.createSale,
    markers: [
      "CreateSaleContent",
      'presentation?: "screen" | "sheet"',
      "SectionList",
      "BottomSheetSectionList",
      "CreateSaleSheet",
    ],
    reason:
      "create sale must share one sale body between stack route and compatibility sheet",
  },
  {
    file: FILES.repClockInModal,
    markers: [
      "WorkflowModalScreen",
      "RepClockInContent",
      'presentation="screen"',
      "allowSalesRep",
    ],
    reason: "rep clock-in must use the full-screen stack modal route",
  },
  {
    file: FILES.repClockIn,
    markers: [
      "RepClockInContent",
      'presentation?: "screen" | "sheet"',
      "KeyboardAwareScrollView",
      "BottomSheetKeyboardAwareScrollView",
      "RepClockInSheet",
    ],
    reason:
      "rep clock-in must share one form body between stack route and compatibility sheet",
  },
  {
    file: FILES.closeoutModal,
    markers: [
      "WorkflowModalScreen",
      "CloseoutContent",
      'presentation="screen"',
      "allowSalesRep",
    ],
    reason: "closeout must use the full-screen stack modal route",
  },
  {
    file: FILES.closeout,
    markers: [
      "CloseoutContent",
      'presentation?: "screen" | "sheet"',
      "KeyboardAwareScrollView",
      "BottomSheetKeyboardAwareScrollView",
      "CloseoutSheet",
    ],
    reason:
      "closeout must share one form body between stack route and compatibility sheet",
  },
  {
    file: FILES.firstProductSetupModal,
    markers: [
      "FirstProductSetupContent",
      'presentation="screen"',
      "isInvitedStaffProfile(profile) || isSalesRepRole(profile?.role)",
      "router.replace(\"/dashboard\")",
      "scroll={false}",
    ],
    reason:
      "first product setup must be available as a protected full-screen modal route",
  },
  {
    file: FILES.firstProductSetup,
    markers: [
      "FirstProductSetupContent",
      'presentation?: "screen" | "sheet"',
      "KeyboardAwareScrollView",
      "BottomSheetKeyboardAwareScrollView",
      "FirstProductSetupSheet",
    ],
    reason:
      "first product setup must share one form body between the stack modal route and legacy sheet compatibility wrapper",
  },
  {
    file: FILES.stockIntakeModal,
    markers: [
      "StockIntakeContent",
      'presentation="screen"',
      "isInvitedStaffProfile(profile) || isSalesRepRole(profile?.role)",
      "router.replace(\"/dashboard\")",
      "scroll={false}",
    ],
    reason:
      "stock intake must be available as a protected full-screen modal route",
  },
  {
    file: FILES.stockIntake,
    markers: [
      "StockIntakeContent",
      'presentation?: "screen" | "sheet"',
      "KeyboardAwareScrollView",
      "BottomSheetKeyboardAwareScrollView",
      "StockIntakeSheet",
    ],
    reason:
      "stock intake must share one form body between the stack modal route and legacy sheet compatibility wrapper",
  },
  {
    file: FILES.businessSwitchModal,
    markers: [
      "WorkflowModalScreen",
      "BusinessSwitchContent",
      'presentation="screen"',
    ],
    reason: "business switching must use a full-screen stack modal route",
  },
  {
    file: FILES.businessSwitch,
    markers: [
      "BusinessSwitchContent",
      'presentation?: "screen" | "sheet"',
      "KeyboardAwareScrollView",
      "BottomSheetKeyboardAwareScrollView",
      "BusinessSwitchSheet",
    ],
    reason:
      "business switching must share one form body between stack route and compatibility sheet",
  },
  {
    file: FILES.customerBookModal,
    markers: [
      "WorkflowModalScreen",
      "CustomerBookContent",
      'presentation="screen"',
      "allowSalesRep",
    ],
    reason: "customer book must use a full-screen stack modal route",
  },
  {
    file: FILES.customerBook,
    markers: [
      "CustomerBookContent",
      'presentation?: "screen" | "sheet"',
      "FlatList",
      "BottomSheetFlatList",
      "CustomerBookSheet",
    ],
    reason:
      "customer book must share one list body between stack route and compatibility sheet",
  },
  {
    file: FILES.productShareModal,
    markers: [
      "WorkflowModalScreen",
      "ProductShareContent",
      'presentation="screen"',
    ],
    reason: "product share management must use a full-screen stack modal route",
  },
  {
    file: FILES.productShare,
    markers: [
      "ProductShareContent",
      'presentation?: "screen" | "sheet"',
      "KeyboardAwareScrollView",
      "BottomSheetKeyboardAwareScrollView",
      "ProductShareSheet",
    ],
    reason:
      "product share management must share one body between stack route and compatibility sheet",
  },
  {
    file: FILES.reportsModal,
    markers: [
      "WorkflowModalScreen",
      "ReportsContent",
      'presentation="screen"',
    ],
    reason: "reports must use a full-screen stack modal route",
  },
  {
    file: FILES.reports,
    markers: [
      "ReportsContent",
      'presentation?: "screen" | "sheet"',
      "KeyboardAwareScrollView",
      "BottomSheetKeyboardAwareScrollView",
      "ReportsSheet",
    ],
    reason:
      "reports must share one analytics body between stack route and compatibility sheet",
  },
  {
    file: FILES.subscriptionModal,
    markers: [
      "WorkflowModalScreen",
      "SubscriptionPlanContent",
      'presentation="screen"',
    ],
    reason: "subscription must use a full-screen stack modal route",
  },
  {
    file: FILES.subscription,
    markers: [
      "SubscriptionPlanContent",
      'presentation?: "screen" | "sheet"',
      "KeyboardAwareScrollView",
      "BottomSheetKeyboardAwareScrollView",
      "SubscriptionPlanSheet",
    ],
    reason:
      "subscription must share one settings body between stack route and compatibility sheet",
  },
  {
    file: FILES.syncStatusModal,
    markers: [
      "WorkflowModalScreen",
      "SyncStatusContent",
      'presentation="screen"',
      "allowSalesRep",
    ],
    reason: "sync status must use a full-screen stack modal route",
  },
  {
    file: FILES.syncStatus,
    markers: [
      "SyncStatusContent",
      'presentation?: "screen" | "sheet"',
      "KeyboardAwareScrollView",
      "BottomSheetKeyboardAwareScrollView",
      "SyncStatusSheet",
    ],
    reason:
      "sync status must share one reliability body between stack route and compatibility sheet",
  },
  {
    file: FILES.unitConversionModal,
    markers: [
      "WorkflowModalScreen",
      "UnitConversionContent",
      'presentation="screen"',
    ],
    reason: "unit conversion must use a full-screen stack modal route",
  },
  {
    file: FILES.unitConversion,
    markers: [
      "UnitConversionContent",
      'presentation?: "screen" | "sheet"',
      "KeyboardAwareScrollView",
      "BottomSheetKeyboardAwareScrollView",
      "UnitConversionSheet",
    ],
    reason:
      "unit conversion must share one form body between stack route and compatibility sheet",
  },
  {
    file: FILES.staffInviteSheet,
    markers: [
      "StaffInviteContent",
      "ctaPlacement",
      "KeyboardAwareScrollView",
      "absolute bottom-0 left-0 right-0",
      "FormField",
      "BottomSheetKeyboardAwareScrollView",
    ],
    reason:
      "staff invite form must support both full-screen sticky CTA and short bottom-sheet reuse while sharing FormField inputs",
  },
]

const forbidden = [
  {
    file: FILES.dashboard,
    markers: [
      "staffModal.present",
      "StaffInviteSheet",
      "FirstProductSetupSheet",
      "setupModal.present",
      "StockIntakeSheet",
      "stockModal.present",
      "BusinessSwitchSheet",
      "businessModal.present",
      "CloseoutSheet",
      "closeoutModal.present",
      "CreateSaleSheet",
      "saleModal.present",
      "CustomerBookSheet",
      "customerModal.present",
      "ProductShareSheet",
      "shareModal.present",
      "RepClockInSheet",
      "sessionModal.present",
      "ReportsSheet",
      "reportsModal.present",
      "SubscriptionPlanSheet",
      "subscriptionModal.present",
      "SyncStatusSheet",
      "syncModal.present",
      "UnitConversionSheet",
      "conversionModal.present",
    ],
    reason:
      "dashboard must not open migrated long workflows as oversized bottom sheets",
  },
]

const failures = []

for (const check of checks) {
  const source = readFileSync(check.file, "utf8")
  const missingMarkers = check.markers.filter(
    (marker) => !source.includes(marker),
  )

  if (missingMarkers.length === 0) continue

  failures.push({
    file: check.file,
    message: `missing ${missingMarkers.join(", ")} (${check.reason})`,
  })
}

for (const check of forbidden) {
  const source = readFileSync(check.file, "utf8")
  const presentMarkers = check.markers.filter((marker) =>
    source.includes(marker),
  )

  if (presentMarkers.length === 0) continue

  failures.push({
    file: check.file,
    message: `forbidden ${presentMarkers.join(", ")} (${check.reason})`,
  })
}

if (failures.length > 0) {
  console.error("Navigation home system check failed.")

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Navigation home system check passed.")
