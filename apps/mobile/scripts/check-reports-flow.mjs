import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  reportsSheet: join(MOBILE_DIR, "src/components/mobile/reports-sheet.tsx"),
  retailOpsQueries: join(REPO_ROOT, "packages/db/src/queries/retail-ops.ts"),
  router: join(REPO_ROOT, "apps/api/src/trpc/routers/retail-ops.ts"),
  salesRouter: join(REPO_ROOT, "apps/api/src/trpc/routers/retail-ops-sales.ts"),
  salesQueries: join(REPO_ROOT, "packages/db/src/queries/retail-ops-sales.ts"),
  sessionsRouter: join(
    REPO_ROOT,
    "apps/api/src/trpc/routers/retail-ops-sessions.ts",
  ),
  sessionQueries: join(
    REPO_ROOT,
    "packages/db/src/queries/retail-ops-sessions.ts",
  ),
  stockQueries: join(REPO_ROOT, "packages/db/src/queries/retail-ops-stock.ts"),
  stockRouter: join(REPO_ROOT, "apps/api/src/trpc/routers/retail-ops-stock.ts"),
  syncQueries: join(REPO_ROOT, "packages/db/src/queries/retail-ops-sync.ts"),
}

const CONTRACTS = [
  {
    file: FILES.reportsSheet,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "ReportSection",
      "visibleRows",
      "visibleLimit = 8",
      "ReportMetricCard",
      "Retail reports",
      "Today, stock, payment, variance, and movement snapshots for",
      "buildRetailOpsReportCsv",
      "Share.share",
      "retail-reports-export-csv",
      "Export CSV",
      "CSV export includes the visible report rows",
    ],
    reason:
      "reports sheet must remain keyboard-safe, bounded, compact, and export visible report rows as CSV",
  },
  {
    file: FILES.reportsSheet,
    markers: [
      "trpc.retailOps.summary.queryOptions",
      "trpc.retailOps.inventory.queryOptions",
      "trpc.retailOps.salesByRep.queryOptions",
      "trpc.retailOps.salesByProduct.queryOptions",
      "trpc.retailOps.creditSales.queryOptions",
      "trpc.retailOps.paymentReconciliation.queryOptions",
      "enabled: canReadProductionReports",
      "retry: false",
      "Report source",
      "Production report data is current for this session.",
      "Local reports are shown while this device is offline.",
    ],
    reason:
      "reports sheet must keep production report reads, local fallback source messaging, and no retry loops while offline/unavailable",
  },
  {
    file: FILES.reportsSheet,
    markers: [
      "getPaymentTotals",
      "getSalesByRepRows",
      "getProductionSalesByRepRows",
      "getSalesByProductRows",
      "getProductionSalesByProductRows",
      "summary?.sales.totalMinor ?? todayTotals.gross",
      "summary?.sales.orderCount ?? todaySales.length",
      "summary?.payments.cashMinor",
      "summary?.payments.transferMinor ?? todayTotals.transfer",
      "Sales by attendant",
      "Sales by product and unit",
    ],
    reason:
      "sales reports must preserve cash/transfer totals plus local and production sales-by-attendant/product summaries",
  },
  {
    file: FILES.reportsSheet,
    markers: [
      "getProductStockRows",
      "getProductionStockRows",
      "getMovementRows",
      "stockMovementLabel",
      "conversion_in",
      "conversion_out",
      "stock_adjustment",
      "stock_intake",
      "Stock balances and price snapshot",
      "Stock movement history",
    ],
    reason:
      "inventory reports must preserve local/production stock balances, price snapshots, and auditable movement history",
  },
  {
    file: FILES.reportsSheet,
    markers: [
      "getVarianceRows",
      "getProductionVarianceRows",
      "getVarianceTone",
      "Cash variance",
      "Transfer variance",
      "Card variance",
      "Credit variance",
      "latestProductionCloseout?.review?.status",
      "latestCloseout?.approvalStatus",
      "Cash and stock variance",
    ],
    reason:
      "variance reports must keep local closeout variance and production payment reconciliation rows",
  },
  {
    file: FILES.reportsSheet,
    markers: [
      "getProductionCreditSaleRows",
      "creditSalesQuery.data",
      'sale.aging.bucket === "overdue"',
      "sale.balanceMinor",
      "Credit sales",
      "No outstanding credit sales are visible for this range.",
    ],
    reason:
      "credit sales reporting must keep production credit rows, aging tone, and balance display",
  },
  {
    file: FILES.reportsSheet,
    markers: [
      "trpc.retailOps.syncConflicts.queryOptions",
      "tenantSyncConflictsCountQuery",
      "syncDeviceFilter",
      "SyncDeviceFilterControl",
      "currentDeviceId={offlineDeviceId}",
      "getSyncOperationRows",
      "getSyncConflictBusinessImpact",
      "getSyncConflictRows",
      "Server sync conflicts",
      "Tenant-level unreviewed conflicts",
      "Conflict review",
      "Sync operations",
    ],
    reason:
      "reports must keep tenant-level and current-device sync conflict visibility plus business-impact explanations",
  },
  {
    file: FILES.router,
    markers: [
      "summary: protectedProcedure",
      "getRetailOpsDashboardSummary(ctx.db",
      "inventory: protectedProcedure",
      "getRetailOpsInventorySnapshot(ctx.db",
      "salesByProduct: protectedProcedure",
      "getRetailOpsSalesByProduct(ctx.db",
      "salesByRep: protectedProcedure",
      "listRetailOpsSalesByRep(ctx.db",
      "syncConflicts: protectedProcedure",
      "listRetailOpsSyncConflicts(ctx.db",
      "assertRetailOpsReportHistoryAllowed",
      "getRetailOpsActorReadScope",
    ],
    reason:
      "API must keep protected, role-aware report reads for summary, inventory, sales, reconciliation, and sync conflicts",
  },
  {
    file: FILES.sessionsRouter,
    markers: [
      "paymentReconciliation: protectedProcedure",
      "listRetailOpsPaymentReconciliation(ctx.db",
      "sessions: protectedProcedure",
      "listRetailOpsSessions(ctx.db",
      "getRetailOpsActorReadScope",
      "assertRetailOpsReportHistoryAllowed",
    ],
    reason:
      "focused sessions router must keep role-aware session and payment reconciliation reads used by reports and dashboard surfaces",
  },
  {
    file: FILES.salesRouter,
    markers: [
      "creditSales: protectedProcedure",
      "listRetailOpsCreditSales(ctx.db",
      "recentSales: protectedProcedure",
      "listRetailOpsRecentSales(ctx.db",
      "getRetailOpsActorReadScope",
      "assertRetailOpsReportHistoryAllowed",
    ],
    reason:
      "focused sales router must keep role-aware credit and recent sale reads used by reports and dashboard surfaces",
  },
  {
    file: FILES.stockRouter,
    markers: [
      "stockMovements: protectedProcedure",
      "listRetailOpsStockMovements(ctx.db",
      "assertRetailOpsReportHistoryAllowed",
      ".input(retailOpsStockMovementsSchema)",
    ],
    reason:
      "focused stock router must keep bounded stock movement reads used by reports surfaces",
  },
  {
    file: FILES.retailOpsQueries,
    markers: [
      "getRetailOpsInventorySnapshot",
      "getRetailOpsSalesByProduct",
      "getRetailOpsDashboardSummary",
      "sales",
      "inventory",
      "payments",
      "sessions",
    ],
    reason:
      "core DB report queries must keep dashboard, inventory, sales by product, payment, and session summary foundations",
  },
  {
    file: FILES.salesQueries,
    markers: [
      "listRetailOpsCreditSales",
      "listRetailOpsSalesByRep",
      "cashMinor",
      "transferMinor",
      "creditMinor",
      "orderCount",
      "balanceMinor",
      "aging",
    ],
    reason:
      "sales DB queries must keep sales-by-rep payment buckets and credit aging report rows",
  },
  {
    file: FILES.sessionQueries,
    markers: [
      "listRetailOpsPaymentReconciliation",
      "expectedCashMinor",
      "cashMinor",
      "transferMinor",
      "creditMinor",
      "variance",
      "review",
    ],
    reason:
      "session DB queries must keep payment reconciliation and closeout variance report rows",
  },
  {
    file: FILES.stockQueries,
    markers: [
      "listRetailOpsStockMovements",
      "movementType",
      "quantity",
      "product",
      "unit",
    ],
    reason:
      "stock DB queries must keep stock movement and inventory snapshot report data",
  },
  {
    file: FILES.syncQueries,
    markers: [
      "listRetailOpsSyncConflicts",
      "deviceId",
      "resolutionAction",
      "resolutionDetail",
      "errorMessage",
      "reviewedAt",
    ],
    reason:
      "sync DB queries must keep tenant/device conflict report rows with recommended resolution details",
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
    "Reports flow check failed. Restore reports sheet, production/local report reads, API report endpoints, or DB report query contracts.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Reports flow check passed.")
