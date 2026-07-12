import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  closeoutSheet: join(MOBILE_DIR, "src/components/mobile/closeout-sheet.tsx"),
  repClockInSheet: join(
    MOBILE_DIR,
    "src/components/mobile/rep-clock-in-sheet.tsx",
  ),
  router: join(REPO_ROOT, "apps/api/src/trpc/routers/retail-ops.ts"),
  schemas: join(REPO_ROOT, "apps/api/src/schemas/retail-ops.ts"),
  sessionsRouter: join(
    REPO_ROOT,
    "apps/api/src/trpc/routers/retail-ops-sessions.ts",
  ),
  sessionQueries: join(
    REPO_ROOT,
    "packages/db/src/queries/retail-ops-sessions.ts",
  ),
  stockIntakeSheet: join(
    MOBILE_DIR,
    "src/components/mobile/stock-intake-sheet.tsx",
  ),
  stockQueries: join(REPO_ROOT, "packages/db/src/queries/retail-ops-stock.ts"),
  stockRouter: join(REPO_ROOT, "apps/api/src/trpc/routers/retail-ops-stock.ts"),
  store: join(MOBILE_DIR, "src/store/retailOpsStore.ts"),
  unitConversionSheet: join(
    MOBILE_DIR,
    "src/components/mobile/unit-conversion-sheet.tsx",
  ),
}

const CONTRACTS = [
  {
    file: FILES.repClockInSheet,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "trpc.retailOps.openSession.mutationOptions",
      "canOpenProductionSession",
      "openingInventoryLines.every((line) => !!line.remoteVariantId)",
      "countedQuantity: parseQuantity",
      "openingFloatMinor: 0",
      "clockInRepSession({",
      'syncStatus: "synced"',
      "Confirm opening stock",
      "visibleOpeningInventoryLines",
      "Opening stock balanced",
    ],
    reason:
      "clock-in must keep keyboard-safe opening stock declarations, production openSession when units are synced, local fallback, variance feedback, and bounded rows",
  },
  {
    file: FILES.closeoutSheet,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "trpc.retailOps.closeSession.mutationOptions",
      "canCloseProductionSession",
      "!!openSession?.remoteId",
      "pendingSyncCount === 0",
      "inventoryLines.every((line) => !!line.remoteVariantId)",
      "declaredCashAmount",
      "declaredTransferAmount",
      "closingFloatMinor: declaredCashAmount",
      "declaredTransferMinor: declaredTransferAmount",
      "createCloseout({",
      'completeLocalCloseout("pending")',
      "Cash variance",
      "Transfer variance",
      "visibleInventoryLines",
    ],
    reason:
      "closeout must keep production closeSession gating, pending-sync protection, cash/transfer declarations, closing inventory, local fallback, variance display, and bounded rows",
  },
  {
    file: FILES.stockIntakeSheet,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "trpc.retailOps.recordStockIntake.mutationOptions",
      "trpc.retailOps.recordStockAdjustment.mutationOptions",
      "canRecordProductionStock",
      "!!selectedUnit?.remoteVariantId",
      "completeLocalIntake",
      "completeLocalAdjustment",
      "normalizeStockAdjustmentDirection",
      "adjustmentDirectionHelper",
      "Damage and loss always decrease stock.",
      "Found stock always increases stock.",
      'sourceName: note.trim() || "Mobile stock intake"',
      'sourceName: "Mobile stock adjustment"',
      'mode === "adjust"',
      "visibleProducts",
      "visibleUnitOptions",
      "visibleStockMovements",
      "Correct counts, record loss, or add found stock",
    ],
    reason:
      "stock sheet must keep production intake/adjustment mutations, synced-unit gating, local fallback, adjustment reasons, bounded product/unit/movement rows, and audit copy",
  },
  {
    file: FILES.unitConversionSheet,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "trpc.retailOps.recordUnitConversion.mutationOptions",
      "canRecordProductionConversion",
      "!!selectedProduct?.remoteVariantId",
      "!!selectedVariant?.remoteId",
      "sourceProductVariantId: selectedProduct.remoteVariantId",
      "targetProductVariantId: selectedVariant.remoteId",
      "sourceQuantity: sourceQuantityValue",
      "targetQuantity: outputQuantityValue",
      'completeLocalConversion("pending")',
      "recordUnitConversion({",
      "sourceStockAfter",
      "targetStockAfter",
      "visibleConvertibleProducts",
      "visibleSelectedVariants",
    ],
    reason:
      "unit conversion must keep production conversion mutation, synced source/target gating, local fallback, stock snapshot reconciliation, and bounded product/variant rows",
  },
  {
    file: FILES.store,
    markers: [
      "clockInRepSession",
      '"rep_session_opened"',
      "openingInventoryLines.flatMap",
      "createCloseout",
      '"closeout_created"',
      'kind: "rep_session" as const',
      'kind: "sale" as const',
      "recordStockIntake",
      '"stock_intake_recorded"',
      "recordStockAdjustment",
      "normalizeStockAdjustmentDirection",
      '"stock_adjustment_recorded"',
      "recordUnitConversion",
      '"unit_conversion_recorded"',
      'type: "conversion_in"',
      'type: "conversion_out"',
      "sourceStockAfter",
      "targetStockAfter",
      "deviceId: state.offlineDeviceId",
    ],
    reason:
      "local store must keep queued session, closeout, stock, and conversion events with product/session/sale dependencies, device metadata, and stock movement ledger entries",
  },
  {
    file: FILES.sessionsRouter,
    markers: [
      "openSession: protectedProcedure",
      ".input(retailOpsOpenSessionSchema)",
      "openRetailOpsSession(ctx.db",
      "closeSession: protectedProcedure",
      ".input(retailOpsCloseSessionSchema)",
      "closeRetailOpsSession(ctx.db",
      "assertCanOperateRetailOpsPos",
    ],
    reason:
      "sessions API must keep protected POS permissions and typed tRPC mutations for opening and closing sessions",
  },
  {
    file: FILES.stockRouter,
    markers: [
      "recordStockIntake: protectedProcedure",
      ".input(retailOpsRecordStockIntakeSchema)",
      "recordRetailOpsStockIntake(ctx.db",
      "recordStockAdjustment: protectedProcedure",
      ".input(retailOpsRecordStockAdjustmentSchema)",
      "recordRetailOpsStockAdjustment(ctx.db",
      "recordUnitConversion: protectedProcedure",
      ".input(retailOpsRecordUnitConversionSchema)",
      "recordRetailOpsUnitConversion(ctx.db",
      "assertCanOperateRetailOpsPos",
    ],
    reason:
      "stock API must keep protected POS permissions and typed tRPC mutations for stock intake, stock adjustment, and unit conversion",
  },
  {
    file: FILES.schemas,
    markers: [
      "retailOpsRecordStockIntakeSchema",
      "retailOpsRecordStockAdjustmentSchema",
      "retailOpsRecordUnitConversionSchema",
      "retailOpsOpenSessionSchema",
      "retailOpsCloseSessionSchema",
      "countedQuantity: z.coerce.number().int().min(0).max(1_000_000)",
      "sourceQuantity: z.coerce.number().int().positive().max(1_000_000)",
      "targetQuantity: z.coerce.number().int().positive().max(1_000_000)",
      "closingFloatMinor: z.coerce.number().int().min(0)",
      "declaredTransferMinor: z.coerce.number().int().min(0).default(0)",
    ],
    reason:
      "schemas must keep whole-number inventory/session contracts and cash/transfer closeout declarations",
  },
  {
    file: FILES.stockQueries,
    markers: [
      "recordRetailOpsStockIntake",
      "recordRetailOpsStockAdjustment",
      "recordRetailOpsUnitConversion",
      "RetailOpsStockError",
      "sourceProductVariantId",
      "targetProductVariantId",
      "sourceQuantity",
      "targetQuantity",
    ],
    reason:
      "database stock queries must keep durable stock intake, adjustment, conversion, and stock error boundaries",
  },
  {
    file: FILES.sessionQueries,
    markers: [
      "openRetailOpsSession",
      "closeRetailOpsSession",
      "retailOpsStockDeclaration",
      "openingFloatMinor",
      "closingFloatMinor",
      "declaredTransferMinor",
      "RetailOpsSessionError",
    ],
    reason:
      "database session queries must keep durable opening/closing inventory declarations, cash/transfer closeout amounts, and session error boundaries",
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
    "Inventory operations flow check failed. Restore clock-in, closeout, stock intake/adjustment, unit conversion, API, durable query, or offline event contracts.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Inventory operations flow check passed.")
