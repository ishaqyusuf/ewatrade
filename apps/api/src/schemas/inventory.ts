import {
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { normalizeStockCategoryName } from "@ewatrade/utils/inventory-categories"
import { z } from "zod"

const exactTransactionQuantitySchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    try {
      parseExactDecimal(value, {
        allowZero: false,
        maxScale: EXACT_QUANTITY_MAX_SCALE,
      })
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid exact quantity.",
      })
    }
  })
  .transform((value) =>
    parseExactDecimal(value, {
      allowZero: false,
      maxScale: EXACT_QUANTITY_MAX_SCALE,
    }),
  )

export const inventoryOfferingAvailabilitySchema = z
  .object({
    offeringId: z.string().trim().min(1),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const inventoryReserveOfferingSchema = z
  .object({
    clientReservationId: z.string().trim().min(8).max(160),
    enteredQuantity: exactTransactionQuantitySchema,
    expectedBalanceRevision: z.number().int().nonnegative().optional(),
    expectedConfigurationVersionId: z.string().trim().min(1),
    expiresAt: z.coerce.date().optional(),
    offeringId: z.string().trim().min(1),
    schemaVersion: z.literal(1),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const inventoryReleaseReservationSchema = z
  .object({ reservationId: z.string().trim().min(1) })
  .strict()

export const inventoryCommitReservationSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    reason: z.string().trim().min(1).max(500).optional(),
    reservationId: z.string().trim().min(1),
    schemaVersion: z.literal(1),
    source: z.string().trim().min(1).max(80),
  })
  .strict()

const inventoryOperationFields = {
  clientOperationId: z.string().trim().min(8).max(160),
  expectedConfigurationVersionId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500),
  schemaVersion: z.literal(1),
  source: z.string().trim().min(1).max(80),
  storeId: z.string().trim().min(1).optional(),
}

const categoryNameSchema = z
  .string()
  .max(160)
  .transform((value, ctx) => {
    try {
      return normalizeStockCategoryName(value).name
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid category.",
      })
      return z.NEVER
    }
  })

export const inventoryCategorySuggestionsSchema = z
  .object({
    query: z.string().trim().max(80).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict()

export const inventorySingleBalanceOperationSchema = z
  .object({
    ...inventoryOperationFields,
    reason: inventoryOperationFields.reason.optional(),
    categories: z
      .array(
        z.union([
          z
            .object({
              categoryNameId: z.number().int().positive().max(2_147_483_647),
            })
            .strict(),
          z.object({ name: categoryNameSchema }).strict(),
        ]),
      )
      .min(1)
      .max(10)
      .optional(),
    balanceSourceId: z.string().trim().min(1),
    direction: z.enum(["increase", "decrease"]),
    effectiveAt: z.coerce.date().optional(),
    enteredInventoryUnitId: z.string().trim().min(1),
    enteredQuantity: exactTransactionQuantitySchema,
    expectedBalanceRevision: z.number().int().nonnegative(),
    linkedOperationId: z.string().trim().min(1).optional(),
    unitCostMinor: z.number().int().nonnegative().max(100_000_000).optional(),
    type: z.enum(["adjustment", "receipt", "return"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.reason && !value.categories?.length)
      ctx.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Add categories or a legacy reason.",
      })
    if (
      value.type === "return" &&
      (!value.reason || value.categories !== undefined)
    )
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Returns require a reason without categories.",
      })
  })

export const inventoryTransformationSchema = z
  .object({
    ...inventoryOperationFields,
    sourceBalanceRevision: z.number().int().nonnegative(),
    sourceBalanceSourceId: z.string().trim().min(1),
    sourceQuantity: exactTransactionQuantitySchema,
    targetBalanceRevision: z.number().int().nonnegative(),
    targetBalanceSourceId: z.string().trim().min(1),
    targetQuantity: exactTransactionQuantitySchema,
  })
  .strict()

export const inventoryStockCountReviewSchema = z
  .object({
    stockCountId: z.string().trim().min(1).max(128),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const inventoryCreateStockCountSchema = z
  .object({
    actorNote: z.string().trim().max(500).optional(),
    clientOperationId: z.string().trim().min(8).max(160),
    lines: z
      .array(
        z
          .object({
            balanceSourceId: z.string().trim().min(1),
            entries: z
              .array(
                z
                  .object({
                    enteredInventoryUnitId: z.string().trim().min(1),
                    enteredQuantity: exactTransactionQuantitySchema,
                  })
                  .strict(),
              )
              .min(1)
              .max(48),
            expectedRevision: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    schemaVersion: z.literal(1),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const inventoryFinalizeStockCountSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    reason: z.string().trim().min(1).max(500),
    schemaVersion: z.literal(1),
    stockCountId: z.string().trim().min(1),
  })
  .strict()

export const inventoryCorrectOperationSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    corrections: z
      .array(
        z
          .object({
            correctedEnteredQuantity: exactTransactionQuantitySchema,
            expectedBalanceRevision: z.number().int().nonnegative(),
            movementId: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    reason: z.string().trim().min(1).max(500),
    schemaVersion: z.literal(1),
    source: z.string().trim().min(1).max(80),
    targetOperationId: z.string().trim().min(1),
  })
  .strict()

export const inventoryMoveCustodySchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    expectedSourceRevision: z.number().int().nonnegative(),
    expectedTargetRevision: z.number().int().nonnegative().optional(),
    quantity: exactTransactionQuantitySchema,
    reason: z.string().trim().min(1).max(500),
    schemaVersion: z.literal(1),
    source: z.string().trim().min(1).max(80),
    sourceBalanceSourceId: z.string().trim().min(1),
    targetCustodyReferenceId: z.string().trim().max(160),
    targetCustodyType: z.enum(["session", "staff", "store"]),
  })
  .strict()

export const inventoryDispatchTransferSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    clientTransferId: z.string().trim().min(8).max(160),
    expectedSourceRevision: z.number().int().nonnegative(),
    quantity: exactTransactionQuantitySchema,
    reason: z.string().trim().min(1).max(500),
    schemaVersion: z.literal(1),
    source: z.string().trim().min(1).max(80),
    sourceBalanceSourceId: z.string().trim().min(1),
    targetStoreId: z.string().trim().min(1),
  })
  .strict()

export const inventoryTransitionTransferSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    expectedTransitRevision: z.number().int().nonnegative(),
    quantity: exactTransactionQuantitySchema.optional(),
    reason: z.string().trim().min(1).max(500),
    schemaVersion: z.literal(1),
    source: z.string().trim().min(1).max(80),
    transferId: z.string().trim().min(1),
    transition: z.enum(["cancel", "receive"]),
  })
  .strict()

export const inventoryListTransfersSchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const inventoryCreateCloseoutSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    custodyReferenceId: z.string().trim().min(1).max(160),
    custodyType: z.enum(["session", "staff"]),
    declarations: z
      .array(
        z
          .object({
            balanceSourceId: z.string().trim().min(1),
            declaredQuantity: z.string().trim().min(1),
            expectedRevision: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    reason: z.string().trim().max(500).optional(),
    schemaVersion: z.literal(1),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const inventoryFinalizeCloseoutSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    closeoutId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500),
    schemaVersion: z.literal(1),
  })
  .strict()

export const inventoryBalanceReportSchema = z
  .object({
    includeCompatibleTotals: z.boolean().optional(),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const inventoryOperationAuditSchema = z
  .object({ operationId: z.string().trim().min(1), storeId: z.string().trim().min(1).optional() })
  .strict()

export const inventoryOperationHistorySchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
    storeId: z.string().trim().min(1).optional(),
    type: z
      .enum([
        "adjustment",
        "correction",
        "custody_assignment",
        "custody_return",
        "opening_stock",
        "receipt",
        "return",
        "sale_fulfillment",
        "stock_count",
        "stock_transition",
        "transfer",
        "transformation",
      ])
      .optional(),
  })
  .strict()

export const inventoryReconciliationReportSchema = z
  .object({ storeId: z.string().trim().min(1).optional() })
  .strict()

export const inventoryAuditExportSchema = z
  .object({ storeId: z.string().trim().min(1).optional() })
  .strict()

export const inventoryLowStockPageSchema = z
  .object({
    storeId: z.string().trim().min(1).max(128),
    threshold: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .superRefine((value, ctx) => {
        try {
          parseExactDecimal(value, { maxScale: EXACT_QUANTITY_MAX_SCALE })
        } catch {
          ctx.addIssue({
            code: "custom",
            message:
              "Use a nonnegative exact quantity with at most six decimal places.",
          })
        }
      }),
    afterOfferingId: z.string().trim().min(1).max(128).optional(),
    catalogItemId: z.string().trim().min(1).max(128).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict()

export const inventoryBalancePageSchema = z
  .object({
    storeId: z.string().min(1).max(128),
    catalogItemId: z.string().min(1).max(128).optional(),
    cursor: z.string().min(1).max(128).optional(),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict()

export const inventoryCompatibleTotalsPageSchema = inventoryBalancePageSchema
  .extend({ cursor: z.string().min(1).max(1024).optional() })
  .strict()

export const inventoryTransferReviewSchema = z.object({
  transferId: z.string().trim().min(1).max(128),
  storeId: z.string().trim().min(1).optional(),
}).strict()

export const inventoryCloseoutReviewSchema = z.object({
  closeoutId: z.string().trim().min(1).max(128),
  storeId: z.string().trim().min(1).optional(),
}).strict()

export const inventoryListCloseoutsSchema = z.object({
  storeId: z.string().trim().min(1).optional(),
  status: z.enum(["DRAFT", "FINALIZED", "CANCELLED"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).strict()
