import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CatalogItemKind as DurableCatalogItemKind,
  InventoryMovementDirection as DurableInventoryMovementDirection,
  InventoryMovementSource as DurableInventoryMovementSource,
  InventoryMovementType as DurableInventoryMovementType,
  StockDeliverySource as DurableStockDeliverySource,
  StockDeliveryStatus as DurableStockDeliveryStatus,
} from "../../generated/prisma/enums"
import {
  type RetailOpsPaymentReconciliationRow,
  listRetailOpsPaymentReconciliation,
} from "./retail-ops-sessions"
import {
  type RetailOpsStaffStockWalletMovementEntry,
  listRetailOpsStaffStockWalletMovementEntries,
} from "./retail-ops-stock-wallets"

export type RecordRetailOpsStockIntakeInput = {
  actorUserId: string
  externalId?: string
  note?: string
  productVariantId: string
  quantity: number
  receivedAt?: Date
  sourceName?: string
  storeId: string
  tenantId: string
}

export type RecordedRetailOpsStockIntake = {
  intake: {
    externalId: string | null
    note: string | null
    quantity: number
    receivedAt: Date
    sourceName: string | null
  }
  inventory: {
    onHandQuantity: number
    previousOnHandQuantity: number
    productVariantId: string
  }
  unit: {
    id: string
    name: string
    productId: string
    productName: string
  }
}

export type RecordRetailOpsUnitConversionInput = {
  actorUserId: string
  convertedAt?: Date
  externalId?: string
  note?: string
  sourceProductVariantId: string
  sourceQuantity: number
  storeId: string
  targetProductVariantId: string
  targetQuantity: number
  tenantId: string
}

export type RecordedRetailOpsUnitConversion = {
  conversion: {
    convertedAt: Date
    externalId: string | null
    note: string | null
    sourceQuantity: number
    targetQuantity: number
  }
  product: {
    id: string
    name: string
  }
  source: {
    onHandQuantity: number
    previousOnHandQuantity: number
    productVariantId: string
    unitName: string
  }
  target: {
    onHandQuantity: number
    previousOnHandQuantity: number
    productVariantId: string
    unitName: string
  }
}

export type RetailOpsStockAdjustmentReason =
  | "correction"
  | "damage"
  | "found_stock"
  | "loss"

export type RetailOpsStockAdjustmentDirection = "decrease" | "increase"

export type RecordRetailOpsStockAdjustmentInput = {
  actorUserId: string
  adjustedAt?: Date
  direction: RetailOpsStockAdjustmentDirection
  externalId?: string
  note?: string
  productVariantId: string
  quantity: number
  reason: RetailOpsStockAdjustmentReason
  sourceName?: string
  storeId: string
  tenantId: string
}

export type RecordedRetailOpsStockAdjustment = {
  adjustment: {
    adjustedAt: Date
    direction: RetailOpsStockAdjustmentDirection
    externalId: string | null
    note: string | null
    quantity: number
    reason: RetailOpsStockAdjustmentReason
    sourceName: string | null
  }
  inventory: {
    onHandQuantity: number
    previousOnHandQuantity: number
    productVariantId: string
  }
  unit: {
    id: string
    name: string
    productId: string
    productName: string
  }
}

export type RetailOpsStockMovementHistoryType =
  | "conversion_in"
  | "conversion_out"
  | "opening_stock"
  | "sale"
  | "sale_reversal"
  | "staff_assignment"
  | "staff_return"
  | "stock_adjustment"
  | "stock_intake"

export type ListRetailOpsStockMovementsInput = {
  from?: Date
  limit?: number
  productVariantId?: string
  storeId: string
  tenantId: string
  to?: Date
}

export type RetailOpsStockMovementHistoryRow = {
  direction: "in" | "out"
  externalId: string
  happenedAt: string
  id: string
  note: string | null
  onHandQuantity: number | null
  previousOnHandQuantity: number | null
  product: {
    id: string
    name: string
  }
  quantity: number
  relatedUnit: {
    id: string
    name: string
    quantity: number
  } | null
  signedQuantity: number
  sourceName: string | null
  type: RetailOpsStockMovementHistoryType
  unit: {
    id: string
    name: string
  }
}

type RetailOpsStockErrorCode =
  | "CONVERSION_RATIO_MISMATCH"
  | "DIFFERENT_PRODUCT"
  | "INSUFFICIENT_STOCK"
  | "INVALID_STOCK_ADJUSTMENT"
  | "ITEM_NOT_STOCKABLE"
  | "PRODUCT_VARIANT_NOT_FOUND"
  | "SAME_UNIT"

export class RetailOpsStockError extends Error {
  code: RetailOpsStockErrorCode

  constructor(code: RetailOpsStockErrorCode, message: string) {
    super(message)
    this.name = "RetailOpsStockError"
    this.code = code
  }
}

type JsonRecord = Record<string, unknown>
type RetailOpsStockOperationType =
  | "stock_adjustment"
  | "stock_intake"
  | "unit_conversion"

type RetailOpsStockOperationMetadata = {
  externalId: string
  result: unknown
  type: RetailOpsStockOperationType
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return value as JsonRecord
}

function getStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function getNumberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getPositiveNumberField(value: unknown) {
  const numberValue = getNumberField(value)

  return numberValue !== null && numberValue > 0 ? numberValue : null
}

function getDateField(value: unknown) {
  const rawValue = getStringField(value)

  if (!rawValue) return null

  const date = new Date(rawValue)

  return Number.isNaN(date.getTime()) ? null : date
}

function getRetailOpsMetadata(metadata: unknown) {
  return asRecord(asRecord(metadata).retailOps)
}

function getRetailOpsSource(metadata: unknown) {
  return getStringField(getRetailOpsMetadata(metadata).source)
}

function getRetailOpsExternalId(metadata: unknown) {
  return getStringField(getRetailOpsMetadata(metadata).externalId)
}

function isDurableStockLedgerTableUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

function getVariantConversionMultiplier(variant: {
  conversionRatioDenominator: number | null
  conversionRatioNumerator: number | null
  metadata: unknown
}) {
  const metadataMultiplier = getPositiveNumberField(
    getRetailOpsMetadata(variant.metadata).conversionMultiplier,
  )

  if (metadataMultiplier !== null) return metadataMultiplier

  const ratioNumerator = getPositiveNumberField(
    variant.conversionRatioNumerator,
  )
  const ratioDenominator = getPositiveNumberField(
    variant.conversionRatioDenominator,
  )

  if (ratioNumerator !== null && ratioDenominator !== null) {
    return ratioNumerator / ratioDenominator
  }

  return null
}

function assertUnitConversionRatioMatches(input: {
  sourceMultiplier: number | null
  sourceQuantity: number
  targetMultiplier: number | null
  targetQuantity: number
}) {
  if (input.sourceMultiplier === null || input.targetMultiplier === null) {
    return
  }

  const sourceBaseQuantity = input.sourceQuantity * input.sourceMultiplier
  const targetBaseQuantity = input.targetQuantity * input.targetMultiplier

  if (Math.abs(sourceBaseQuantity - targetBaseQuantity) <= 1e-9) return

  throw new RetailOpsStockError(
    "CONVERSION_RATIO_MISMATCH",
    "Source and target quantities must match the configured unit conversion ratio.",
  )
}

function assertStockAdjustmentReasonMatchesDirection(input: {
  direction: RetailOpsStockAdjustmentDirection
  reason: RetailOpsStockAdjustmentReason
}) {
  if (
    (input.reason === "damage" || input.reason === "loss") &&
    input.direction !== "decrease"
  ) {
    throw new RetailOpsStockError(
      "INVALID_STOCK_ADJUSTMENT",
      "Damage and loss adjustments must decrease stock.",
    )
  }

  if (input.reason === "found_stock" && input.direction !== "increase") {
    throw new RetailOpsStockError(
      "INVALID_STOCK_ADJUSTMENT",
      "Found-stock adjustments must increase stock.",
    )
  }
}

function getRetailOpsLineUnitName(metadata: unknown) {
  return getStringField(getRetailOpsMetadata(metadata).unitName)
}

function getSaleLineStockMovementSnapshot(metadata: unknown) {
  const stockMovement = asRecord(getRetailOpsMetadata(metadata).stockMovement)
  const onHandQuantity = getNumberField(stockMovement.onHandQuantity)
  const previousOnHandQuantity = getNumberField(
    stockMovement.previousOnHandQuantity,
  )

  if (onHandQuantity === null || previousOnHandQuantity === null) {
    return null
  }

  return {
    onHandQuantity,
    previousOnHandQuantity,
  }
}

function getOpeningStockQuantity(metadata: unknown) {
  const openingStockQuantity = getNumberField(
    getRetailOpsMetadata(metadata).openingStockQuantity,
  )

  return openingStockQuantity && openingStockQuantity > 0
    ? openingStockQuantity
    : null
}

function getStockOperations(
  metadata: unknown,
): RetailOpsStockOperationMetadata[] {
  const stockOperations = getRetailOpsMetadata(metadata).stockOperations

  if (!Array.isArray(stockOperations)) return []

  return stockOperations.flatMap((operation) => {
    const record = asRecord(operation)
    const externalId = getStringField(record.externalId)
    const type = getStringField(record.type)

    if (
      !externalId ||
      (type !== "stock_adjustment" &&
        type !== "stock_intake" &&
        type !== "unit_conversion")
    ) {
      return []
    }

    return {
      externalId,
      result: record.result,
      type,
    }
  })
}

function withStockOperation(
  metadata: unknown,
  operation: RetailOpsStockOperationMetadata,
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)
  const stockOperations = getStockOperations(metadata).filter(
    (currentOperation) =>
      currentOperation.externalId !== operation.externalId ||
      currentOperation.type !== operation.type,
  )

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      stockOperations: [operation, ...stockOperations].slice(0, 250),
    },
  } as Prisma.InputJsonValue
}

function serializeStockIntakeResult(result: RecordedRetailOpsStockIntake) {
  return {
    ...result,
    intake: {
      ...result.intake,
      receivedAt: result.intake.receivedAt.toISOString(),
    },
  }
}

function serializeUnitConversionResult(
  result: RecordedRetailOpsUnitConversion,
) {
  return {
    ...result,
    conversion: {
      ...result.conversion,
      convertedAt: result.conversion.convertedAt.toISOString(),
    },
  }
}

function serializeStockAdjustmentResult(
  result: RecordedRetailOpsStockAdjustment,
) {
  return {
    ...result,
    adjustment: {
      ...result.adjustment,
      adjustedAt: result.adjustment.adjustedAt.toISOString(),
    },
  }
}

function deserializeStockIntakeResult(
  value: unknown,
): RecordedRetailOpsStockIntake | null {
  const result = asRecord(value)
  const intake = asRecord(result.intake)
  const inventory = asRecord(result.inventory)
  const unit = asRecord(result.unit)
  const receivedAt = getDateField(intake.receivedAt)
  const intakeQuantity = getNumberField(intake.quantity)
  const onHandQuantity = getNumberField(inventory.onHandQuantity)
  const previousOnHandQuantity = getNumberField(
    inventory.previousOnHandQuantity,
  )
  const productVariantId = getStringField(inventory.productVariantId)
  const unitId = getStringField(unit.id)
  const unitName = getStringField(unit.name)
  const productId = getStringField(unit.productId)
  const productName = getStringField(unit.productName)

  if (
    !receivedAt ||
    intakeQuantity === null ||
    onHandQuantity === null ||
    previousOnHandQuantity === null ||
    !productVariantId ||
    !unitId ||
    !unitName ||
    !productId ||
    !productName
  ) {
    return null
  }

  return {
    intake: {
      externalId: getStringField(intake.externalId),
      note: getStringField(intake.note),
      quantity: intakeQuantity,
      receivedAt,
      sourceName: getStringField(intake.sourceName),
    },
    inventory: {
      onHandQuantity,
      previousOnHandQuantity,
      productVariantId,
    },
    unit: {
      id: unitId,
      name: unitName,
      productId,
      productName,
    },
  }
}

function deserializeUnitConversionResult(
  value: unknown,
): RecordedRetailOpsUnitConversion | null {
  const result = asRecord(value)
  const conversion = asRecord(result.conversion)
  const product = asRecord(result.product)
  const source = asRecord(result.source)
  const target = asRecord(result.target)
  const convertedAt = getDateField(conversion.convertedAt)
  const sourceQuantity = getNumberField(conversion.sourceQuantity)
  const targetQuantity = getNumberField(conversion.targetQuantity)
  const productId = getStringField(product.id)
  const productName = getStringField(product.name)
  const sourceOnHandQuantity = getNumberField(source.onHandQuantity)
  const sourcePreviousOnHandQuantity = getNumberField(
    source.previousOnHandQuantity,
  )
  const sourceProductVariantId = getStringField(source.productVariantId)
  const sourceUnitName = getStringField(source.unitName)
  const targetOnHandQuantity = getNumberField(target.onHandQuantity)
  const targetPreviousOnHandQuantity = getNumberField(
    target.previousOnHandQuantity,
  )
  const targetProductVariantId = getStringField(target.productVariantId)
  const targetUnitName = getStringField(target.unitName)

  if (
    !convertedAt ||
    sourceQuantity === null ||
    targetQuantity === null ||
    !productId ||
    !productName ||
    sourceOnHandQuantity === null ||
    sourcePreviousOnHandQuantity === null ||
    !sourceProductVariantId ||
    !sourceUnitName ||
    targetOnHandQuantity === null ||
    targetPreviousOnHandQuantity === null ||
    !targetProductVariantId ||
    !targetUnitName
  ) {
    return null
  }

  return {
    conversion: {
      convertedAt,
      externalId: getStringField(conversion.externalId),
      note: getStringField(conversion.note),
      sourceQuantity,
      targetQuantity,
    },
    product: {
      id: productId,
      name: productName,
    },
    source: {
      onHandQuantity: sourceOnHandQuantity,
      previousOnHandQuantity: sourcePreviousOnHandQuantity,
      productVariantId: sourceProductVariantId,
      unitName: sourceUnitName,
    },
    target: {
      onHandQuantity: targetOnHandQuantity,
      previousOnHandQuantity: targetPreviousOnHandQuantity,
      productVariantId: targetProductVariantId,
      unitName: targetUnitName,
    },
  }
}

function getStockAdjustmentDirection(
  value: unknown,
): RetailOpsStockAdjustmentDirection | null {
  const direction = getStringField(value)

  return direction === "decrease" || direction === "increase" ? direction : null
}

function getStockAdjustmentReason(
  value: unknown,
): RetailOpsStockAdjustmentReason | null {
  const reason = getStringField(value)

  if (
    reason === "correction" ||
    reason === "damage" ||
    reason === "found_stock" ||
    reason === "loss"
  ) {
    return reason
  }

  return null
}

function deserializeStockAdjustmentResult(
  value: unknown,
): RecordedRetailOpsStockAdjustment | null {
  const result = asRecord(value)
  const adjustment = asRecord(result.adjustment)
  const inventory = asRecord(result.inventory)
  const unit = asRecord(result.unit)
  const adjustedAt = getDateField(adjustment.adjustedAt)
  const direction = getStockAdjustmentDirection(adjustment.direction)
  const reason = getStockAdjustmentReason(adjustment.reason)
  const adjustmentQuantity = getNumberField(adjustment.quantity)
  const onHandQuantity = getNumberField(inventory.onHandQuantity)
  const previousOnHandQuantity = getNumberField(
    inventory.previousOnHandQuantity,
  )
  const productVariantId = getStringField(inventory.productVariantId)
  const unitId = getStringField(unit.id)
  const unitName = getStringField(unit.name)
  const productId = getStringField(unit.productId)
  const productName = getStringField(unit.productName)

  if (
    !adjustedAt ||
    !direction ||
    !reason ||
    adjustmentQuantity === null ||
    onHandQuantity === null ||
    previousOnHandQuantity === null ||
    !productVariantId ||
    !unitId ||
    !unitName ||
    !productId ||
    !productName
  ) {
    return null
  }

  return {
    adjustment: {
      adjustedAt,
      direction,
      externalId: getStringField(adjustment.externalId),
      note: getStringField(adjustment.note),
      quantity: adjustmentQuantity,
      reason,
      sourceName: getStringField(adjustment.sourceName),
    },
    inventory: {
      onHandQuantity,
      previousOnHandQuantity,
      productVariantId,
    },
    unit: {
      id: unitId,
      name: unitName,
      productId,
      productName,
    },
  }
}

function findStoredStockIntakeResult(metadata: unknown, externalId: string) {
  const operation = getStockOperations(metadata).find(
    (currentOperation) =>
      currentOperation.externalId === externalId &&
      currentOperation.type === "stock_intake",
  )

  return operation ? deserializeStockIntakeResult(operation.result) : null
}

async function findDurableStockIntakeResult(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    externalId: string
    storeId: string
    tenantId: string
  },
): Promise<RecordedRetailOpsStockIntake | null> {
  try {
    const movement = await db.inventoryMovement.findFirst({
      where: {
        externalId: input.externalId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: DurableInventoryMovementType.STOCK_INTAKE,
      },
      select: {
        happenedAt: true,
        metadata: true,
        note: true,
        onHandQuantity: true,
        previousOnHandQuantity: true,
        product: {
          select: {
            id: true,
            kind: true,
            name: true,
          },
        },
        productVariant: {
          select: {
            id: true,
            name: true,
          },
        },
        quantity: true,
      },
    })

    if (
      !movement ||
      movement.onHandQuantity === null ||
      movement.previousOnHandQuantity === null
    ) {
      return null
    }

    return {
      intake: {
        externalId: input.externalId,
        note: movement.note,
        quantity: movement.quantity,
        receivedAt: movement.happenedAt,
        sourceName: getStringField(
          getRetailOpsMetadata(movement.metadata).sourceName,
        ),
      },
      inventory: {
        onHandQuantity: movement.onHandQuantity,
        previousOnHandQuantity: movement.previousOnHandQuantity,
        productVariantId: movement.productVariant.id,
      },
      unit: {
        id: movement.productVariant.id,
        name: movement.productVariant.name,
        productId: movement.product.id,
        productName: movement.product.name,
      },
    }
  } catch (error) {
    if (isDurableStockLedgerTableUnavailable(error)) return null

    throw error
  }
}

function findStoredUnitConversionResult(metadata: unknown, externalId: string) {
  const operation = getStockOperations(metadata).find(
    (currentOperation) =>
      currentOperation.externalId === externalId &&
      currentOperation.type === "unit_conversion",
  )

  return operation ? deserializeUnitConversionResult(operation.result) : null
}

async function findDurableUnitConversionResult(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    externalId: string
    storeId: string
    tenantId: string
  },
): Promise<RecordedRetailOpsUnitConversion | null> {
  try {
    const movements = await db.inventoryMovement.findMany({
      where: {
        externalId: input.externalId,
        source: DurableInventoryMovementSource.UNIT_CONVERSION,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: {
          in: [
            DurableInventoryMovementType.CONVERSION_OUT,
            DurableInventoryMovementType.CONVERSION_IN,
          ],
        },
      },
      select: {
        happenedAt: true,
        note: true,
        onHandQuantity: true,
        previousOnHandQuantity: true,
        product: {
          select: {
            id: true,
            kind: true,
            name: true,
          },
        },
        productVariant: {
          select: {
            id: true,
            name: true,
          },
        },
        quantity: true,
        type: true,
      },
    })

    const sourceMovement = movements.find(
      (movement) =>
        movement.type === DurableInventoryMovementType.CONVERSION_OUT,
    )
    const targetMovement = movements.find(
      (movement) =>
        movement.type === DurableInventoryMovementType.CONVERSION_IN,
    )

    if (
      !sourceMovement ||
      !targetMovement ||
      sourceMovement.product.id !== targetMovement.product.id ||
      sourceMovement.onHandQuantity === null ||
      sourceMovement.previousOnHandQuantity === null ||
      targetMovement.onHandQuantity === null ||
      targetMovement.previousOnHandQuantity === null
    ) {
      return null
    }

    return {
      conversion: {
        convertedAt: sourceMovement.happenedAt,
        externalId: input.externalId,
        note: sourceMovement.note ?? targetMovement.note,
        sourceQuantity: sourceMovement.quantity,
        targetQuantity: targetMovement.quantity,
      },
      product: sourceMovement.product,
      source: {
        onHandQuantity: sourceMovement.onHandQuantity,
        previousOnHandQuantity: sourceMovement.previousOnHandQuantity,
        productVariantId: sourceMovement.productVariant.id,
        unitName: sourceMovement.productVariant.name,
      },
      target: {
        onHandQuantity: targetMovement.onHandQuantity,
        previousOnHandQuantity: targetMovement.previousOnHandQuantity,
        productVariantId: targetMovement.productVariant.id,
        unitName: targetMovement.productVariant.name,
      },
    }
  } catch (error) {
    if (isDurableStockLedgerTableUnavailable(error)) return null

    throw error
  }
}

function findStoredStockAdjustmentResult(
  metadata: unknown,
  externalId: string,
) {
  const operation = getStockOperations(metadata).find(
    (currentOperation) =>
      currentOperation.externalId === externalId &&
      currentOperation.type === "stock_adjustment",
  )

  return operation ? deserializeStockAdjustmentResult(operation.result) : null
}

function toDurableStockAdjustmentMovementType(
  reason: RetailOpsStockAdjustmentReason,
) {
  if (reason === "damage") return DurableInventoryMovementType.DAMAGE
  if (reason === "loss") return DurableInventoryMovementType.LOSS

  return DurableInventoryMovementType.STOCK_ADJUSTMENT
}

function getDurableStockAdjustmentDirection(
  direction: string,
): RetailOpsStockAdjustmentDirection | null {
  if (direction === DurableInventoryMovementDirection.INBOUND) return "increase"
  if (direction === DurableInventoryMovementDirection.OUTBOUND)
    return "decrease"

  return null
}

function getDurableStockAdjustmentReason(input: {
  metadata: unknown
  type: string
}): RetailOpsStockAdjustmentReason | null {
  const metadataReason = getStockAdjustmentReason(
    getRetailOpsMetadata(input.metadata).reason,
  )

  if (metadataReason) return metadataReason
  if (input.type === DurableInventoryMovementType.DAMAGE) return "damage"
  if (input.type === DurableInventoryMovementType.LOSS) return "loss"

  return null
}

async function findDurableStockAdjustmentResult(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    externalId: string
    storeId: string
    tenantId: string
  },
): Promise<RecordedRetailOpsStockAdjustment | null> {
  try {
    const movement = await db.inventoryMovement.findFirst({
      where: {
        externalId: input.externalId,
        source: DurableInventoryMovementSource.STOCK_ADJUSTMENT,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: {
          in: [
            DurableInventoryMovementType.DAMAGE,
            DurableInventoryMovementType.LOSS,
            DurableInventoryMovementType.STOCK_ADJUSTMENT,
          ],
        },
      },
      select: {
        direction: true,
        happenedAt: true,
        metadata: true,
        note: true,
        onHandQuantity: true,
        previousOnHandQuantity: true,
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        productVariant: {
          select: {
            id: true,
            name: true,
          },
        },
        quantity: true,
        type: true,
      },
    })

    if (
      !movement ||
      movement.onHandQuantity === null ||
      movement.previousOnHandQuantity === null
    ) {
      return null
    }

    const direction = getDurableStockAdjustmentDirection(movement.direction)
    const reason = getDurableStockAdjustmentReason({
      metadata: movement.metadata,
      type: movement.type,
    })

    if (!direction || !reason) return null

    const sourceName =
      getStringField(getRetailOpsMetadata(movement.metadata).sourceName) ??
      stockAdjustmentReasonLabels[reason]

    return {
      adjustment: {
        adjustedAt: movement.happenedAt,
        direction,
        externalId: input.externalId,
        note: movement.note,
        quantity: movement.quantity,
        reason,
        sourceName,
      },
      inventory: {
        onHandQuantity: movement.onHandQuantity,
        previousOnHandQuantity: movement.previousOnHandQuantity,
        productVariantId: movement.productVariant.id,
      },
      unit: {
        id: movement.productVariant.id,
        name: movement.productVariant.name,
        productId: movement.product.id,
        productName: movement.product.name,
      },
    }
  } catch (error) {
    if (isDurableStockLedgerTableUnavailable(error)) return null

    throw error
  }
}

async function writeDurableStockIntakeMovement(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId: string
    externalId: string | null
    inventoryItemId: string
    result: RecordedRetailOpsStockIntake
    storeId: string
    tenantId: string
  },
) {
  if (!input.externalId) return

  try {
    const delivery = await db.stockDelivery.upsert({
      where: {
        storeId_referenceNumber: {
          referenceNumber: input.externalId,
          storeId: input.storeId,
        },
      },
      create: {
        metadata: {
          retailOps: {
            externalId: input.externalId,
            source: "retail_ops_stock_intake",
            sourceName: input.result.intake.sourceName,
          },
        } as Prisma.InputJsonValue,
        notes: input.result.intake.note,
        receivedAt: input.result.intake.receivedAt,
        receivedByUserId: input.actorUserId,
        referenceNumber: input.externalId,
        source: getDurableStockDeliverySource(input.result.intake.sourceName),
        sourceName: input.result.intake.sourceName,
        status: DurableStockDeliveryStatus.RECEIVED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {
        metadata: {
          retailOps: {
            externalId: input.externalId,
            source: "retail_ops_stock_intake",
            sourceName: input.result.intake.sourceName,
          },
        } as Prisma.InputJsonValue,
        notes: input.result.intake.note,
        receivedAt: input.result.intake.receivedAt,
        receivedByUserId: input.actorUserId,
        source: getDurableStockDeliverySource(input.result.intake.sourceName),
        sourceName: input.result.intake.sourceName,
        status: DurableStockDeliveryStatus.RECEIVED,
      },
      select: {
        id: true,
      },
    })
    const deliveryLine = await db.stockDeliveryLine.findFirst({
      where: {
        deliveryId: delivery.id,
        productVariantId: input.result.unit.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
      },
    })
    const deliveryLineData = {
      metadata: {
        retailOps: {
          externalId: input.externalId,
          source: "retail_ops_stock_intake",
        },
      } as Prisma.InputJsonValue,
      notes: input.result.intake.note,
      productId: input.result.unit.productId,
      productVariantId: input.result.unit.id,
      quantity: input.result.intake.quantity,
      storeId: input.storeId,
      tenantId: input.tenantId,
      unitNameSnapshot: input.result.unit.name,
      unitSkuSnapshot: null,
    }
    const stockDeliveryLine = deliveryLine
      ? await db.stockDeliveryLine.update({
          where: {
            id: deliveryLine.id,
          },
          data: deliveryLineData,
          select: {
            id: true,
          },
        })
      : await db.stockDeliveryLine.create({
          data: {
            ...deliveryLineData,
            deliveryId: delivery.id,
          },
          select: {
            id: true,
          },
        })

    await db.inventoryMovement.upsert({
      where: {
        tenantId_storeId_type_externalId: {
          externalId: input.externalId,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: DurableInventoryMovementType.STOCK_INTAKE,
        },
      },
      create: {
        actorUserId: input.actorUserId,
        direction: DurableInventoryMovementDirection.INBOUND,
        externalId: input.externalId,
        happenedAt: input.result.intake.receivedAt,
        inventoryItemId: input.inventoryItemId,
        metadata: {
          retailOps: {
            sourceName: input.result.intake.sourceName,
          },
        } as Prisma.InputJsonValue,
        movementGroupId: `stock_intake:${input.externalId}`,
        note: input.result.intake.note,
        onHandQuantity: input.result.inventory.onHandQuantity,
        previousOnHandQuantity: input.result.inventory.previousOnHandQuantity,
        productId: input.result.unit.productId,
        productVariantId: input.result.unit.id,
        quantity: input.result.intake.quantity,
        source: DurableInventoryMovementSource.STOCK_DELIVERY,
        sourceReferenceId: input.externalId,
        stockDeliveryId: delivery.id,
        stockDeliveryLineId: stockDeliveryLine.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: DurableInventoryMovementType.STOCK_INTAKE,
      },
      update: {
        actorUserId: input.actorUserId,
        direction: DurableInventoryMovementDirection.INBOUND,
        happenedAt: input.result.intake.receivedAt,
        inventoryItemId: input.inventoryItemId,
        metadata: {
          retailOps: {
            sourceName: input.result.intake.sourceName,
          },
        } as Prisma.InputJsonValue,
        movementGroupId: `stock_intake:${input.externalId}`,
        note: input.result.intake.note,
        onHandQuantity: input.result.inventory.onHandQuantity,
        previousOnHandQuantity: input.result.inventory.previousOnHandQuantity,
        productId: input.result.unit.productId,
        productVariantId: input.result.unit.id,
        quantity: input.result.intake.quantity,
        source: DurableInventoryMovementSource.STOCK_DELIVERY,
        sourceReferenceId: input.externalId,
        stockDeliveryId: delivery.id,
        stockDeliveryLineId: stockDeliveryLine.id,
      },
      select: {
        id: true,
      },
    })
  } catch (error) {
    if (isDurableStockLedgerTableUnavailable(error)) return

    throw error
  }
}

function getDurableStockDeliverySource(sourceName: string | null) {
  const normalized = sourceName?.trim().toLowerCase() ?? ""

  if (normalized.includes("production")) {
    return DurableStockDeliverySource.PRODUCTION
  }

  if (normalized.includes("supplier")) {
    return DurableStockDeliverySource.SUPPLIER
  }

  if (normalized.includes("transfer")) {
    return DurableStockDeliverySource.TRANSFER
  }

  return DurableStockDeliverySource.MANUAL
}

async function writeDurableUnitConversionMovements(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId: string
    externalId: string | null
    result: RecordedRetailOpsUnitConversion
    sourceInventoryItemId: string
    storeId: string
    targetInventoryItemId: string
    tenantId: string
  },
) {
  if (!input.externalId) return

  const movementGroupId = `unit_conversion:${input.externalId}`

  try {
    await db.inventoryMovement.upsert({
      where: {
        tenantId_storeId_type_externalId: {
          externalId: input.externalId,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: DurableInventoryMovementType.CONVERSION_OUT,
        },
      },
      create: {
        actorUserId: input.actorUserId,
        direction: DurableInventoryMovementDirection.OUTBOUND,
        externalId: input.externalId,
        happenedAt: input.result.conversion.convertedAt,
        inventoryItemId: input.sourceInventoryItemId,
        metadata: {
          retailOps: {
            relatedQuantity: input.result.conversion.targetQuantity,
            relatedUnitName: input.result.target.unitName,
          },
        } as Prisma.InputJsonValue,
        movementGroupId,
        note: input.result.conversion.note,
        onHandQuantity: input.result.source.onHandQuantity,
        previousOnHandQuantity: input.result.source.previousOnHandQuantity,
        productId: input.result.product.id,
        productVariantId: input.result.source.productVariantId,
        quantity: input.result.conversion.sourceQuantity,
        relatedProductVariantId: input.result.target.productVariantId,
        source: DurableInventoryMovementSource.UNIT_CONVERSION,
        sourceReferenceId: input.externalId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: DurableInventoryMovementType.CONVERSION_OUT,
      },
      update: {
        actorUserId: input.actorUserId,
        happenedAt: input.result.conversion.convertedAt,
        inventoryItemId: input.sourceInventoryItemId,
        metadata: {
          retailOps: {
            relatedQuantity: input.result.conversion.targetQuantity,
            relatedUnitName: input.result.target.unitName,
          },
        } as Prisma.InputJsonValue,
        movementGroupId,
        note: input.result.conversion.note,
        onHandQuantity: input.result.source.onHandQuantity,
        previousOnHandQuantity: input.result.source.previousOnHandQuantity,
        quantity: input.result.conversion.sourceQuantity,
        relatedProductVariantId: input.result.target.productVariantId,
        sourceReferenceId: input.externalId,
      },
      select: {
        id: true,
      },
    })

    await db.inventoryMovement.upsert({
      where: {
        tenantId_storeId_type_externalId: {
          externalId: input.externalId,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: DurableInventoryMovementType.CONVERSION_IN,
        },
      },
      create: {
        actorUserId: input.actorUserId,
        direction: DurableInventoryMovementDirection.INBOUND,
        externalId: input.externalId,
        happenedAt: input.result.conversion.convertedAt,
        inventoryItemId: input.targetInventoryItemId,
        metadata: {
          retailOps: {
            relatedQuantity: input.result.conversion.sourceQuantity,
            relatedUnitName: input.result.source.unitName,
          },
        } as Prisma.InputJsonValue,
        movementGroupId,
        note: input.result.conversion.note,
        onHandQuantity: input.result.target.onHandQuantity,
        previousOnHandQuantity: input.result.target.previousOnHandQuantity,
        productId: input.result.product.id,
        productVariantId: input.result.target.productVariantId,
        quantity: input.result.conversion.targetQuantity,
        relatedProductVariantId: input.result.source.productVariantId,
        source: DurableInventoryMovementSource.UNIT_CONVERSION,
        sourceReferenceId: input.externalId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: DurableInventoryMovementType.CONVERSION_IN,
      },
      update: {
        actorUserId: input.actorUserId,
        happenedAt: input.result.conversion.convertedAt,
        inventoryItemId: input.targetInventoryItemId,
        metadata: {
          retailOps: {
            relatedQuantity: input.result.conversion.sourceQuantity,
            relatedUnitName: input.result.source.unitName,
          },
        } as Prisma.InputJsonValue,
        movementGroupId,
        note: input.result.conversion.note,
        onHandQuantity: input.result.target.onHandQuantity,
        previousOnHandQuantity: input.result.target.previousOnHandQuantity,
        quantity: input.result.conversion.targetQuantity,
        relatedProductVariantId: input.result.source.productVariantId,
        sourceReferenceId: input.externalId,
      },
      select: {
        id: true,
      },
    })
  } catch (error) {
    if (isDurableStockLedgerTableUnavailable(error)) return

    throw error
  }
}

async function writeDurableStockAdjustmentMovement(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId: string
    externalId: string | null
    inventoryItemId: string
    result: RecordedRetailOpsStockAdjustment
    storeId: string
    tenantId: string
  },
) {
  if (!input.externalId) return

  const movementType = toDurableStockAdjustmentMovementType(
    input.result.adjustment.reason,
  )

  try {
    await db.inventoryMovement.upsert({
      where: {
        tenantId_storeId_type_externalId: {
          externalId: input.externalId,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: movementType,
        },
      },
      create: {
        actorUserId: input.actorUserId,
        direction:
          input.result.adjustment.direction === "increase"
            ? DurableInventoryMovementDirection.INBOUND
            : DurableInventoryMovementDirection.OUTBOUND,
        externalId: input.externalId,
        happenedAt: input.result.adjustment.adjustedAt,
        inventoryItemId: input.inventoryItemId,
        metadata: {
          retailOps: {
            reason: input.result.adjustment.reason,
            sourceName: input.result.adjustment.sourceName,
          },
        } as Prisma.InputJsonValue,
        movementGroupId: `stock_adjustment:${input.externalId}`,
        note: input.result.adjustment.note,
        onHandQuantity: input.result.inventory.onHandQuantity,
        previousOnHandQuantity: input.result.inventory.previousOnHandQuantity,
        productId: input.result.unit.productId,
        productVariantId: input.result.unit.id,
        quantity: input.result.adjustment.quantity,
        source: DurableInventoryMovementSource.STOCK_ADJUSTMENT,
        sourceReferenceId: input.externalId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: movementType,
      },
      update: {
        actorUserId: input.actorUserId,
        direction:
          input.result.adjustment.direction === "increase"
            ? DurableInventoryMovementDirection.INBOUND
            : DurableInventoryMovementDirection.OUTBOUND,
        happenedAt: input.result.adjustment.adjustedAt,
        inventoryItemId: input.inventoryItemId,
        metadata: {
          retailOps: {
            reason: input.result.adjustment.reason,
            sourceName: input.result.adjustment.sourceName,
          },
        } as Prisma.InputJsonValue,
        movementGroupId: `stock_adjustment:${input.externalId}`,
        note: input.result.adjustment.note,
        onHandQuantity: input.result.inventory.onHandQuantity,
        previousOnHandQuantity: input.result.inventory.previousOnHandQuantity,
        productId: input.result.unit.productId,
        productVariantId: input.result.unit.id,
        quantity: input.result.adjustment.quantity,
        sourceReferenceId: input.externalId,
      },
      select: {
        id: true,
      },
    })
  } catch (error) {
    if (isDurableStockLedgerTableUnavailable(error)) return

    throw error
  }
}

function getStockIntakeMovementRows(
  operation: RetailOpsStockOperationMetadata,
): RetailOpsStockMovementHistoryRow[] {
  const result = deserializeStockIntakeResult(operation.result)

  if (!result) return []

  return [
    {
      direction: "in",
      externalId: operation.externalId,
      happenedAt: result.intake.receivedAt.toISOString(),
      id: `stock_intake:${operation.externalId}`,
      note: result.intake.note,
      onHandQuantity: result.inventory.onHandQuantity,
      previousOnHandQuantity: result.inventory.previousOnHandQuantity,
      product: {
        id: result.unit.productId,
        name: result.unit.productName,
      },
      quantity: result.intake.quantity,
      relatedUnit: null,
      signedQuantity: result.intake.quantity,
      sourceName: result.intake.sourceName,
      type: "stock_intake",
      unit: {
        id: result.unit.id,
        name: result.unit.name,
      },
    },
  ]
}

const stockAdjustmentReasonLabels = {
  correction: "Count correction",
  damage: "Damage",
  found_stock: "Found stock",
  loss: "Loss",
} satisfies Record<RetailOpsStockAdjustmentReason, string>

function getStockOperationAdjustmentMovementRows(
  operation: RetailOpsStockOperationMetadata,
): RetailOpsStockMovementHistoryRow[] {
  const result = deserializeStockAdjustmentResult(operation.result)

  if (!result) return []

  const signedQuantity =
    result.adjustment.direction === "increase"
      ? result.adjustment.quantity
      : -result.adjustment.quantity

  return [
    {
      direction: result.adjustment.direction === "increase" ? "in" : "out",
      externalId: operation.externalId,
      happenedAt: result.adjustment.adjustedAt.toISOString(),
      id: `stock_adjustment:${operation.externalId}`,
      note: result.adjustment.note,
      onHandQuantity: result.inventory.onHandQuantity,
      previousOnHandQuantity: result.inventory.previousOnHandQuantity,
      product: {
        id: result.unit.productId,
        name: result.unit.productName,
      },
      quantity: result.adjustment.quantity,
      relatedUnit: null,
      signedQuantity,
      sourceName:
        result.adjustment.sourceName ??
        stockAdjustmentReasonLabels[result.adjustment.reason],
      type: "stock_adjustment",
      unit: {
        id: result.unit.id,
        name: result.unit.name,
      },
    },
  ]
}

function getUnitConversionMovementRows(
  operation: RetailOpsStockOperationMetadata,
): RetailOpsStockMovementHistoryRow[] {
  const result = deserializeUnitConversionResult(operation.result)

  if (!result) return []

  const happenedAt = result.conversion.convertedAt.toISOString()

  return [
    {
      direction: "out",
      externalId: operation.externalId,
      happenedAt,
      id: `unit_conversion:${operation.externalId}:out`,
      note: result.conversion.note,
      onHandQuantity: result.source.onHandQuantity,
      previousOnHandQuantity: result.source.previousOnHandQuantity,
      product: result.product,
      quantity: result.conversion.sourceQuantity,
      relatedUnit: {
        id: result.target.productVariantId,
        name: result.target.unitName,
        quantity: result.conversion.targetQuantity,
      },
      signedQuantity: -result.conversion.sourceQuantity,
      sourceName: null,
      type: "conversion_out",
      unit: {
        id: result.source.productVariantId,
        name: result.source.unitName,
      },
    },
    {
      direction: "in",
      externalId: operation.externalId,
      happenedAt,
      id: `unit_conversion:${operation.externalId}:in`,
      note: result.conversion.note,
      onHandQuantity: result.target.onHandQuantity,
      previousOnHandQuantity: result.target.previousOnHandQuantity,
      product: result.product,
      quantity: result.conversion.targetQuantity,
      relatedUnit: {
        id: result.source.productVariantId,
        name: result.source.unitName,
        quantity: result.conversion.sourceQuantity,
      },
      signedQuantity: result.conversion.targetQuantity,
      sourceName: null,
      type: "conversion_in",
      unit: {
        id: result.target.productVariantId,
        name: result.target.unitName,
      },
    },
  ]
}

function getSaleMovementRows(order: {
  createdAt: Date
  id: string
  items: Array<{
    id: string
    metadata: Prisma.JsonValue | null
    nameSnapshot: string
    productId: string
    productVariant: {
      name: string
    } | null
    productVariantId: string | null
    quantity: number
  }>
  metadata: Prisma.JsonValue | null
  notes: string | null
  orderNumber: string
}): RetailOpsStockMovementHistoryRow[] {
  if (getRetailOpsSource(order.metadata) !== "retail_ops_sale") {
    return []
  }

  const externalId = getRetailOpsExternalId(order.metadata) ?? order.id

  return order.items.flatMap((item) => {
    if (!item.productVariantId || item.quantity <= 0) return []

    const balanceSnapshot = getSaleLineStockMovementSnapshot(item.metadata)

    return [
      {
        direction: "out",
        externalId,
        happenedAt: order.createdAt.toISOString(),
        id: `sale:${order.id}:${item.id}`,
        note: order.notes,
        onHandQuantity: balanceSnapshot?.onHandQuantity ?? null,
        previousOnHandQuantity: balanceSnapshot?.previousOnHandQuantity ?? null,
        product: {
          id: item.productId,
          name: item.nameSnapshot,
        },
        quantity: item.quantity,
        relatedUnit: null,
        signedQuantity: -item.quantity,
        sourceName: `Sale ${order.orderNumber}`,
        type: "sale",
        unit: {
          id: item.productVariantId,
          name:
            getRetailOpsLineUnitName(item.metadata) ??
            item.productVariant?.name ??
            "Unit",
        },
      },
    ]
  })
}

function getStaffStockWalletMovementRows(
  movement: RetailOpsStaffStockWalletMovementEntry,
): RetailOpsStockMovementHistoryRow[] {
  const signedQuantity =
    movement.direction === "in" ? movement.quantity : -movement.quantity

  return [
    {
      direction: movement.direction,
      externalId: movement.externalId,
      happenedAt: movement.happenedAt,
      id: `${movement.type}:${movement.externalId}`,
      note: movement.note,
      onHandQuantity: movement.inventory.onHandQuantity,
      previousOnHandQuantity: movement.inventory.previousOnHandQuantity,
      product: movement.product,
      quantity: movement.quantity,
      relatedUnit: null,
      signedQuantity,
      sourceName:
        movement.type === "staff_assignment"
          ? `Assigned to ${movement.staff.displayName}`
          : `Returned by ${movement.staff.displayName}`,
      type: movement.type,
      unit: {
        id: movement.unit.id,
        name: movement.unit.name,
      },
    },
  ]
}

function getOpeningStockMovementRows(unit: {
  createdAt: Date
  id: string
  metadata: Prisma.JsonValue | null
  name: string
  product: {
    id: string
    name: string
  }
}): RetailOpsStockMovementHistoryRow[] {
  const openingStockQuantity = getOpeningStockQuantity(unit.metadata)

  if (!openingStockQuantity) return []

  return [
    {
      direction: "in",
      externalId: `opening_stock:${unit.id}`,
      happenedAt: unit.createdAt.toISOString(),
      id: `opening_stock:${unit.id}`,
      note: null,
      onHandQuantity: openingStockQuantity,
      previousOnHandQuantity: 0,
      product: unit.product,
      quantity: openingStockQuantity,
      relatedUnit: null,
      signedQuantity: openingStockQuantity,
      sourceName: "Opening stock",
      type: "opening_stock",
      unit: {
        id: unit.id,
        name: unit.name,
      },
    },
  ]
}

function getCloseoutStockAdjustmentMovementRows(
  row: RetailOpsPaymentReconciliationRow,
): RetailOpsStockMovementHistoryRow[] {
  const inventory = row.inventory

  if (!inventory) return []

  return inventory.lines.flatMap((line) => {
    if (line.varianceQuantity === 0) return []

    const direction = line.varianceQuantity > 0 ? "in" : "out"
    const quantity = Math.abs(line.varianceQuantity)

    return [
      {
        direction,
        externalId: row.id,
        happenedAt: inventory.declaredAt.toISOString(),
        id: `stock_adjustment:${row.id}:${line.productVariantId}`,
        note: line.note,
        onHandQuantity: line.countedQuantity,
        previousOnHandQuantity: line.expectedQuantity,
        product: line.product,
        quantity,
        relatedUnit: null,
        signedQuantity: line.varianceQuantity,
        sourceName: `Closeout by ${row.user.displayName}`,
        type: "stock_adjustment",
        unit: {
          id: line.unit.id,
          name: line.unit.name,
        },
      },
    ]
  })
}

const durableStockMovementTypes = [
  DurableInventoryMovementType.CLOSEOUT_ADJUSTMENT,
  DurableInventoryMovementType.CONVERSION_IN,
  DurableInventoryMovementType.CONVERSION_OUT,
  DurableInventoryMovementType.DAMAGE,
  DurableInventoryMovementType.LOSS,
  DurableInventoryMovementType.OPENING_STOCK,
  DurableInventoryMovementType.SALE_DEDUCTION,
  DurableInventoryMovementType.SALE_REVERSAL,
  DurableInventoryMovementType.STAFF_ASSIGNMENT,
  DurableInventoryMovementType.STAFF_RETURN,
  DurableInventoryMovementType.STOCK_ADJUSTMENT,
  DurableInventoryMovementType.STOCK_INTAKE,
  DurableInventoryMovementType.SYNC_CORRECTION,
] satisfies DurableInventoryMovementType[]

type DurableRetailOpsStockMovementRow = {
  cashierSessionId: string | null
  direction: DurableInventoryMovementDirection
  externalId: string | null
  happenedAt: Date
  id: string
  metadata: Prisma.JsonValue | null
  movementGroupId: string | null
  note: string | null
  onHandQuantity: number | null
  order: {
    orderNumber: string
  } | null
  previousOnHandQuantity: number | null
  previousStaffWalletQuantity: number | null
  product: {
    id: string
    name: string
  }
  productVariant: {
    id: string
    name: string
  }
  quantity: number
  relatedProductVariant: {
    id: string
    name: string
  } | null
  sourceReferenceId: string | null
  staffStockWallet: {
    staffUser: {
      displayName: string | null
      email: string
      name: string
    }
  } | null
  staffWalletQuantity: number | null
  type: DurableInventoryMovementType
}

function isRetailOpsStockAdjustmentReason(
  value: string | null,
): value is RetailOpsStockAdjustmentReason {
  return (
    value === "correction" ||
    value === "damage" ||
    value === "found_stock" ||
    value === "loss"
  )
}

function getDurableStockMovementHistoryType(
  type: DurableInventoryMovementType,
): RetailOpsStockMovementHistoryType {
  if (type === DurableInventoryMovementType.CONVERSION_IN) {
    return "conversion_in"
  }

  if (type === DurableInventoryMovementType.CONVERSION_OUT) {
    return "conversion_out"
  }

  if (type === DurableInventoryMovementType.OPENING_STOCK) {
    return "opening_stock"
  }

  if (type === DurableInventoryMovementType.SALE_DEDUCTION) {
    return "sale"
  }

  if (type === DurableInventoryMovementType.SALE_REVERSAL) {
    return "sale_reversal"
  }

  if (type === DurableInventoryMovementType.STAFF_ASSIGNMENT) {
    return "staff_assignment"
  }

  if (type === DurableInventoryMovementType.STAFF_RETURN) {
    return "staff_return"
  }

  if (type === DurableInventoryMovementType.STOCK_INTAKE) {
    return "stock_intake"
  }

  return "stock_adjustment"
}

function getDurableStockAdjustmentSourceName(
  movement: DurableRetailOpsStockMovementRow,
  retailOpsMetadata: Record<string, unknown>,
) {
  const sourceName = getStringField(retailOpsMetadata.sourceName)

  if (sourceName) return sourceName

  const reason = getStringField(retailOpsMetadata.reason)

  if (isRetailOpsStockAdjustmentReason(reason)) {
    return stockAdjustmentReasonLabels[reason]
  }

  if (movement.type === DurableInventoryMovementType.DAMAGE) {
    return stockAdjustmentReasonLabels.damage
  }

  if (movement.type === DurableInventoryMovementType.LOSS) {
    return stockAdjustmentReasonLabels.loss
  }

  if (movement.type === DurableInventoryMovementType.CLOSEOUT_ADJUSTMENT) {
    return "Closeout adjustment"
  }

  if (movement.type === DurableInventoryMovementType.SYNC_CORRECTION) {
    return "Offline sync correction"
  }

  return "Stock adjustment"
}

function getDurableStaffDisplayName(
  movement: DurableRetailOpsStockMovementRow,
) {
  const staffUser = movement.staffStockWallet?.staffUser

  return (
    staffUser?.displayName?.trim() ||
    staffUser?.name.trim() ||
    staffUser?.email ||
    null
  )
}

function getDurableStockMovementSourceName(
  movement: DurableRetailOpsStockMovementRow,
  retailOpsMetadata: Record<string, unknown>,
) {
  if (movement.type === DurableInventoryMovementType.STOCK_INTAKE) {
    return getStringField(retailOpsMetadata.sourceName) ?? "Stock intake"
  }

  if (movement.type === DurableInventoryMovementType.SALE_DEDUCTION) {
    return movement.order?.orderNumber
      ? `Sale ${movement.order.orderNumber}`
      : "Sale"
  }

  if (movement.type === DurableInventoryMovementType.SALE_REVERSAL) {
    return movement.order?.orderNumber
      ? `Reversal ${movement.order.orderNumber}`
      : "Sale reversal"
  }

  if (movement.type === DurableInventoryMovementType.STAFF_ASSIGNMENT) {
    const staffName = getDurableStaffDisplayName(movement)

    return staffName ? `Assigned to ${staffName}` : "Staff assignment"
  }

  if (movement.type === DurableInventoryMovementType.STAFF_RETURN) {
    const staffName = getDurableStaffDisplayName(movement)

    return staffName ? `Returned by ${staffName}` : "Staff return"
  }

  if (
    movement.type === DurableInventoryMovementType.STOCK_ADJUSTMENT ||
    movement.type === DurableInventoryMovementType.DAMAGE ||
    movement.type === DurableInventoryMovementType.LOSS ||
    movement.type === DurableInventoryMovementType.CLOSEOUT_ADJUSTMENT ||
    movement.type === DurableInventoryMovementType.SYNC_CORRECTION
  ) {
    return getDurableStockAdjustmentSourceName(movement, retailOpsMetadata)
  }

  if (movement.type === DurableInventoryMovementType.OPENING_STOCK) {
    return "Opening stock"
  }

  return null
}

function getDurableStockMovementExternalId(
  movement: DurableRetailOpsStockMovementRow,
) {
  const retailOpsMetadata = getRetailOpsMetadata(movement.metadata)

  if (movement.type === DurableInventoryMovementType.CLOSEOUT_ADJUSTMENT) {
    return (
      movement.cashierSessionId ??
      getStringField(retailOpsMetadata.cashierSessionId) ??
      movement.externalId ??
      movement.sourceReferenceId ??
      movement.movementGroupId ??
      movement.id
    )
  }

  return (
    movement.externalId ??
    movement.sourceReferenceId ??
    movement.movementGroupId ??
    movement.id
  )
}

function getDurableStockMovementRelatedUnit(
  movement: DurableRetailOpsStockMovementRow,
  retailOpsMetadata: Record<string, unknown>,
) {
  if (!movement.relatedProductVariant) return null

  return {
    id: movement.relatedProductVariant.id,
    name:
      getStringField(retailOpsMetadata.relatedUnitName) ??
      movement.relatedProductVariant.name,
    quantity:
      getPositiveNumberField(retailOpsMetadata.relatedQuantity) ??
      movement.quantity,
  }
}

function getDurableStockMovementHistoryRow(
  movement: DurableRetailOpsStockMovementRow,
): RetailOpsStockMovementHistoryRow {
  const retailOpsMetadata = getRetailOpsMetadata(movement.metadata)
  const direction =
    movement.direction === DurableInventoryMovementDirection.INBOUND
      ? "in"
      : "out"
  const signedQuantity =
    direction === "in" ? movement.quantity : -movement.quantity

  return {
    direction,
    externalId: getDurableStockMovementExternalId(movement),
    happenedAt: movement.happenedAt.toISOString(),
    id: `durable:${movement.id}`,
    note: movement.note,
    onHandQuantity: movement.onHandQuantity ?? movement.staffWalletQuantity,
    previousOnHandQuantity:
      movement.previousOnHandQuantity ?? movement.previousStaffWalletQuantity,
    product: movement.product,
    quantity: movement.quantity,
    relatedUnit: getDurableStockMovementRelatedUnit(
      movement,
      retailOpsMetadata,
    ),
    signedQuantity,
    sourceName: getDurableStockMovementSourceName(movement, retailOpsMetadata),
    type: getDurableStockMovementHistoryType(movement.type),
    unit: {
      id: movement.productVariant.id,
      name: movement.productVariant.name,
    },
  }
}

async function listDurableRetailOpsStockMovementRows(
  db: PrismaClient,
  input: ListRetailOpsStockMovementsInput,
  limit: number,
): Promise<RetailOpsStockMovementHistoryRow[]> {
  try {
    const movements = await db.inventoryMovement.findMany({
      where: {
        ...(input.from || input.to
          ? {
              happenedAt: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {}),
              },
            }
          : {}),
        ...(input.productVariantId
          ? { productVariantId: input.productVariantId }
          : {}),
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: {
          in: durableStockMovementTypes,
        },
      },
      orderBy: {
        happenedAt: "desc",
      },
      take: Math.max(limit * 3, 100),
      select: {
        cashierSessionId: true,
        direction: true,
        externalId: true,
        happenedAt: true,
        id: true,
        metadata: true,
        movementGroupId: true,
        note: true,
        onHandQuantity: true,
        order: {
          select: {
            orderNumber: true,
          },
        },
        previousOnHandQuantity: true,
        previousStaffWalletQuantity: true,
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        productVariant: {
          select: {
            id: true,
            name: true,
          },
        },
        quantity: true,
        relatedProductVariant: {
          select: {
            id: true,
            name: true,
          },
        },
        sourceReferenceId: true,
        staffStockWallet: {
          select: {
            staffUser: {
              select: {
                displayName: true,
                email: true,
                name: true,
              },
            },
          },
        },
        staffWalletQuantity: true,
        type: true,
      },
    })

    return movements.map(getDurableStockMovementHistoryRow)
  } catch (error) {
    if (isDurableStockLedgerTableUnavailable(error)) return []

    throw error
  }
}

function getStockMovementDedupKey(movement: RetailOpsStockMovementHistoryRow) {
  if (movement.type === "opening_stock") {
    return [movement.type, movement.unit.id].join(":")
  }

  return [
    movement.type,
    movement.externalId,
    movement.unit.id,
    movement.direction,
    movement.signedQuantity,
  ].join(":")
}

function getUniqueStockMovementRows(rows: RetailOpsStockMovementHistoryRow[]) {
  const seenKeys = new Set<string>()

  return rows.filter((row) => {
    const key = getStockMovementDedupKey(row)

    if (seenKeys.has(key)) return false

    seenKeys.add(key)

    return true
  })
}

export async function listRetailOpsStockMovements(
  db: PrismaClient,
  input: ListRetailOpsStockMovementsInput,
): Promise<RetailOpsStockMovementHistoryRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const store = await db.store.findFirst({
    where: {
      id: input.storeId,
      status: { not: "ARCHIVED" },
      tenantId: input.tenantId,
    },
    select: {
      metadata: true,
    },
  })

  if (!store) return []

  const saleLookbackLimit = Math.max(limit * 10, 250)
  const [durableRows, saleOrders, productUnits, reconciliationRows] =
    await Promise.all([
      listDurableRetailOpsStockMovementRows(db, input, limit),
      db.order.findMany({
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          status: { not: "CANCELLED" },
          ...(input.from || input.to
            ? {
                createdAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
        orderBy: {
          createdAt: "desc",
        },
        take: saleLookbackLimit,
        select: {
          createdAt: true,
          id: true,
          metadata: true,
          notes: true,
          orderNumber: true,
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              metadata: true,
              nameSnapshot: true,
              productId: true,
              productVariant: {
                select: {
                  name: true,
                },
              },
              productVariantId: true,
              quantity: true,
            },
          },
        },
      }),
      db.productVariant.findMany({
        where: {
          ...(input.productVariantId ? { id: input.productVariantId } : {}),
          isActive: true,
          product: {
            kind: DurableCatalogItemKind.PRODUCT,
            status: { not: "ARCHIVED" },
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          createdAt: true,
          id: true,
          metadata: true,
          name: true,
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      listRetailOpsPaymentReconciliation(db, {
        from: input.from,
        storeId: input.storeId,
        tenantId: input.tenantId,
        to: input.to,
      }),
    ])
  const stockOperationRows = getStockOperations(store.metadata).flatMap(
    (operation) => {
      if (operation.type === "stock_intake") {
        return getStockIntakeMovementRows(operation)
      }

      if (operation.type === "stock_adjustment") {
        return getStockOperationAdjustmentMovementRows(operation)
      }

      return getUnitConversionMovementRows(operation)
    },
  )
  const saleRows = saleOrders.flatMap(getSaleMovementRows)
  const staffStockWalletRows = listRetailOpsStaffStockWalletMovementEntries(
    store.metadata,
  ).flatMap(getStaffStockWalletMovementRows)
  const openingStockRows = productUnits.flatMap(getOpeningStockMovementRows)
  const stockAdjustmentRows = reconciliationRows.flatMap(
    getCloseoutStockAdjustmentMovementRows,
  )

  return getUniqueStockMovementRows([
    ...durableRows,
    ...stockOperationRows,
    ...saleRows,
    ...staffStockWalletRows,
    ...openingStockRows,
    ...stockAdjustmentRows,
  ])
    .filter((movement) => {
      const happenedAt = new Date(movement.happenedAt)

      if (Number.isNaN(happenedAt.getTime())) return false
      if (
        input.productVariantId &&
        movement.unit.id !== input.productVariantId
      ) {
        return false
      }
      if (input.from && happenedAt < input.from) return false
      if (input.to && happenedAt > input.to) return false

      return true
    })
    .sort(
      (left, right) =>
        new Date(right.happenedAt).getTime() -
        new Date(left.happenedAt).getTime(),
    )
    .slice(0, limit)
}

export async function recordRetailOpsStockIntake(
  db: PrismaClient,
  input: RecordRetailOpsStockIntakeInput,
): Promise<RecordedRetailOpsStockIntake> {
  const receivedAt = input.receivedAt ?? new Date()
  const externalId = input.externalId?.trim() || null

  return db.$transaction(async (tx) => {
    const store = externalId
      ? await tx.store.findFirst({
          where: {
            id: input.storeId,
            tenantId: input.tenantId,
            status: { not: "ARCHIVED" },
          },
          select: {
            metadata: true,
          },
        })
      : null

    if (externalId) {
      const existingResult = findStoredStockIntakeResult(
        store?.metadata,
        externalId,
      )

      if (existingResult) return existingResult

      const durableResult = await findDurableStockIntakeResult(tx, {
        externalId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })

      if (durableResult) return durableResult
    }

    const productVariant = await tx.productVariant.findFirst({
      where: {
        id: input.productVariantId,
        isActive: true,
        product: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          status: { not: "ARCHIVED" },
        },
      },
      select: {
        conversionRatioDenominator: true,
        conversionRatioNumerator: true,
        id: true,
        metadata: true,
        name: true,
        product: {
          select: {
            id: true,
            kind: true,
            name: true,
          },
        },
      },
    })

    if (!productVariant) {
      throw new RetailOpsStockError(
        "PRODUCT_VARIANT_NOT_FOUND",
        "Product variant not found for this store.",
      )
    }

    if (productVariant.product.kind !== DurableCatalogItemKind.PRODUCT) {
      throw new RetailOpsStockError(
        "ITEM_NOT_STOCKABLE",
        "Service items do not have stock.",
      )
    }

    const existingInventory = await tx.inventoryItem.findUnique({
      where: {
        productVariantId: productVariant.id,
      },
      select: {
        onHandQuantity: true,
      },
    })
    const inventory = await tx.inventoryItem.upsert({
      where: {
        productVariantId: productVariant.id,
      },
      create: {
        onHandQuantity: input.quantity,
        productVariantId: productVariant.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
        updatedByUserId: input.actorUserId,
      },
      update: {
        onHandQuantity: { increment: input.quantity },
        updatedByUserId: input.actorUserId,
      },
      select: {
        id: true,
        onHandQuantity: true,
      },
    })

    const result: RecordedRetailOpsStockIntake = {
      intake: {
        externalId,
        note: input.note ?? null,
        quantity: input.quantity,
        receivedAt,
        sourceName: input.sourceName ?? null,
      },
      inventory: {
        onHandQuantity: inventory.onHandQuantity,
        previousOnHandQuantity: existingInventory?.onHandQuantity ?? 0,
        productVariantId: productVariant.id,
      },
      unit: {
        id: productVariant.id,
        name: productVariant.name,
        productId: productVariant.product.id,
        productName: productVariant.product.name,
      },
    }

    await writeDurableStockIntakeMovement(tx, {
      actorUserId: input.actorUserId,
      externalId,
      inventoryItemId: inventory.id,
      result,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })

    if (externalId) {
      await tx.store.update({
        where: {
          id: input.storeId,
        },
        data: {
          metadata: withStockOperation(store?.metadata, {
            externalId,
            result: serializeStockIntakeResult(result),
            type: "stock_intake",
          }),
        },
        select: {
          id: true,
        },
      })
    }

    return result
  })
}

export async function recordRetailOpsUnitConversion(
  db: PrismaClient,
  input: RecordRetailOpsUnitConversionInput,
): Promise<RecordedRetailOpsUnitConversion> {
  if (input.sourceProductVariantId === input.targetProductVariantId) {
    throw new RetailOpsStockError(
      "SAME_UNIT",
      "Choose different source and target units.",
    )
  }

  const convertedAt = input.convertedAt ?? new Date()
  const externalId = input.externalId?.trim() || null

  return db.$transaction(async (tx) => {
    const store = externalId
      ? await tx.store.findFirst({
          where: {
            id: input.storeId,
            tenantId: input.tenantId,
            status: { not: "ARCHIVED" },
          },
          select: {
            metadata: true,
          },
        })
      : null

    if (externalId) {
      const existingResult = findStoredUnitConversionResult(
        store?.metadata,
        externalId,
      )

      if (existingResult) return existingResult

      const durableResult = await findDurableUnitConversionResult(tx, {
        externalId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })

      if (durableResult) return durableResult
    }

    const variants = await tx.productVariant.findMany({
      where: {
        id: {
          in: [input.sourceProductVariantId, input.targetProductVariantId],
        },
        isActive: true,
        product: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          status: { not: "ARCHIVED" },
        },
      },
      select: {
        conversionRatioDenominator: true,
        conversionRatioNumerator: true,
        id: true,
        metadata: true,
        name: true,
        product: {
          select: {
            id: true,
            kind: true,
            name: true,
          },
        },
      },
    })
    const sourceVariant = variants.find(
      (variant) => variant.id === input.sourceProductVariantId,
    )
    const targetVariant = variants.find(
      (variant) => variant.id === input.targetProductVariantId,
    )

    if (!sourceVariant || !targetVariant) {
      throw new RetailOpsStockError(
        "PRODUCT_VARIANT_NOT_FOUND",
        "Product variant not found for this store.",
      )
    }

    if (
      sourceVariant.product.kind !== DurableCatalogItemKind.PRODUCT ||
      targetVariant.product.kind !== DurableCatalogItemKind.PRODUCT
    ) {
      throw new RetailOpsStockError(
        "ITEM_NOT_STOCKABLE",
        "Service items cannot participate in stock conversions.",
      )
    }

    if (sourceVariant.product.id !== targetVariant.product.id) {
      throw new RetailOpsStockError(
        "DIFFERENT_PRODUCT",
        "Source and target units must belong to the same product.",
      )
    }

    assertUnitConversionRatioMatches({
      sourceMultiplier: getVariantConversionMultiplier(sourceVariant),
      sourceQuantity: input.sourceQuantity,
      targetMultiplier: getVariantConversionMultiplier(targetVariant),
      targetQuantity: input.targetQuantity,
    })

    const sourceInventory = await tx.inventoryItem.findUnique({
      where: {
        productVariantId: sourceVariant.id,
      },
      select: {
        id: true,
        onHandQuantity: true,
        reservedQuantity: true,
      },
    })

    if (
      !sourceInventory ||
      sourceInventory.onHandQuantity - sourceInventory.reservedQuantity <
        input.sourceQuantity
    ) {
      throw new RetailOpsStockError(
        "INSUFFICIENT_STOCK",
        "Not enough source stock is available for this conversion.",
      )
    }

    const sourceUpdate = await tx.inventoryItem.updateMany({
      where: {
        id: sourceInventory.id,
        onHandQuantity: {
          gte: sourceInventory.reservedQuantity + input.sourceQuantity,
        },
        reservedQuantity: sourceInventory.reservedQuantity,
      },
      data: {
        onHandQuantity: { decrement: input.sourceQuantity },
        updatedByUserId: input.actorUserId,
      },
    })

    if (sourceUpdate.count !== 1) {
      throw new RetailOpsStockError(
        "INSUFFICIENT_STOCK",
        "Not enough source stock is available for this conversion.",
      )
    }

    const [updatedSourceInventory, existingTargetInventory] = await Promise.all(
      [
        tx.inventoryItem.findUniqueOrThrow({
          where: {
            id: sourceInventory.id,
          },
          select: {
            onHandQuantity: true,
          },
        }),
        tx.inventoryItem.findUnique({
          where: {
            productVariantId: targetVariant.id,
          },
          select: {
            onHandQuantity: true,
          },
        }),
      ],
    )
    const targetInventory = await tx.inventoryItem.upsert({
      where: {
        productVariantId: targetVariant.id,
      },
      create: {
        onHandQuantity: input.targetQuantity,
        productVariantId: targetVariant.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
        updatedByUserId: input.actorUserId,
      },
      update: {
        onHandQuantity: { increment: input.targetQuantity },
        updatedByUserId: input.actorUserId,
      },
      select: {
        id: true,
        onHandQuantity: true,
      },
    })

    const result: RecordedRetailOpsUnitConversion = {
      conversion: {
        convertedAt,
        externalId,
        note: input.note ?? null,
        sourceQuantity: input.sourceQuantity,
        targetQuantity: input.targetQuantity,
      },
      product: {
        id: sourceVariant.product.id,
        name: sourceVariant.product.name,
      },
      source: {
        onHandQuantity: updatedSourceInventory.onHandQuantity,
        previousOnHandQuantity: sourceInventory.onHandQuantity,
        productVariantId: sourceVariant.id,
        unitName: sourceVariant.name,
      },
      target: {
        onHandQuantity: targetInventory.onHandQuantity,
        previousOnHandQuantity: existingTargetInventory?.onHandQuantity ?? 0,
        productVariantId: targetVariant.id,
        unitName: targetVariant.name,
      },
    }

    await writeDurableUnitConversionMovements(tx, {
      actorUserId: input.actorUserId,
      externalId,
      result,
      sourceInventoryItemId: sourceInventory.id,
      storeId: input.storeId,
      targetInventoryItemId: targetInventory.id,
      tenantId: input.tenantId,
    })

    if (externalId) {
      await tx.store.update({
        where: {
          id: input.storeId,
        },
        data: {
          metadata: withStockOperation(store?.metadata, {
            externalId,
            result: serializeUnitConversionResult(result),
            type: "unit_conversion",
          }),
        },
        select: {
          id: true,
        },
      })
    }

    return result
  })
}

export async function recordRetailOpsStockAdjustment(
  db: PrismaClient,
  input: RecordRetailOpsStockAdjustmentInput,
): Promise<RecordedRetailOpsStockAdjustment> {
  assertStockAdjustmentReasonMatchesDirection({
    direction: input.direction,
    reason: input.reason,
  })

  const adjustedAt = input.adjustedAt ?? new Date()
  const externalId = input.externalId?.trim() || null

  return db.$transaction(async (tx) => {
    const store = externalId
      ? await tx.store.findFirst({
          where: {
            id: input.storeId,
            tenantId: input.tenantId,
            status: { not: "ARCHIVED" },
          },
          select: {
            metadata: true,
          },
        })
      : null

    if (externalId) {
      const existingResult = findStoredStockAdjustmentResult(
        store?.metadata,
        externalId,
      )

      if (existingResult) return existingResult

      const durableResult = await findDurableStockAdjustmentResult(tx, {
        externalId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })

      if (durableResult) return durableResult
    }

    const productVariant = await tx.productVariant.findFirst({
      where: {
        id: input.productVariantId,
        isActive: true,
        product: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          status: { not: "ARCHIVED" },
        },
      },
      select: {
        id: true,
        name: true,
        product: {
          select: {
            id: true,
            kind: true,
            name: true,
          },
        },
      },
    })

    if (!productVariant) {
      throw new RetailOpsStockError(
        "PRODUCT_VARIANT_NOT_FOUND",
        "Product variant not found for this store.",
      )
    }

    if (productVariant.product.kind !== DurableCatalogItemKind.PRODUCT) {
      throw new RetailOpsStockError(
        "ITEM_NOT_STOCKABLE",
        "Service items do not have stock.",
      )
    }

    const existingInventory = await tx.inventoryItem.findUnique({
      where: {
        productVariantId: productVariant.id,
      },
      select: {
        id: true,
        onHandQuantity: true,
        reservedQuantity: true,
      },
    })

    if (
      input.direction === "decrease" &&
      (!existingInventory ||
        existingInventory.onHandQuantity - existingInventory.reservedQuantity <
          input.quantity)
    ) {
      throw new RetailOpsStockError(
        "INSUFFICIENT_STOCK",
        "Not enough stock is available for this adjustment.",
      )
    }

    const previousOnHandQuantity = existingInventory?.onHandQuantity ?? 0
    let inventory: {
      id: string
      onHandQuantity: number
    }

    if (!existingInventory) {
      inventory = await tx.inventoryItem.create({
        data: {
          onHandQuantity: input.quantity,
          productVariantId: productVariant.id,
          storeId: input.storeId,
          tenantId: input.tenantId,
          updatedByUserId: input.actorUserId,
        },
        select: {
          id: true,
          onHandQuantity: true,
        },
      })
    } else if (input.direction === "increase") {
      inventory = await tx.inventoryItem.update({
        where: {
          id: existingInventory.id,
        },
        data: {
          onHandQuantity: { increment: input.quantity },
          updatedByUserId: input.actorUserId,
        },
        select: {
          id: true,
          onHandQuantity: true,
        },
      })
    } else {
      const adjustmentUpdate = await tx.inventoryItem.updateMany({
        where: {
          id: existingInventory.id,
          onHandQuantity: {
            gte: existingInventory.reservedQuantity + input.quantity,
          },
          reservedQuantity: existingInventory.reservedQuantity,
        },
        data: {
          onHandQuantity: { decrement: input.quantity },
          updatedByUserId: input.actorUserId,
        },
      })

      if (adjustmentUpdate.count !== 1) {
        throw new RetailOpsStockError(
          "INSUFFICIENT_STOCK",
          "Not enough stock is available for this adjustment.",
        )
      }

      inventory = await tx.inventoryItem.findUniqueOrThrow({
        where: {
          id: existingInventory.id,
        },
        select: {
          id: true,
          onHandQuantity: true,
        },
      })
    }

    const result: RecordedRetailOpsStockAdjustment = {
      adjustment: {
        adjustedAt,
        direction: input.direction,
        externalId,
        note: input.note ?? null,
        quantity: input.quantity,
        reason: input.reason,
        sourceName:
          input.sourceName ?? stockAdjustmentReasonLabels[input.reason],
      },
      inventory: {
        onHandQuantity: inventory.onHandQuantity,
        previousOnHandQuantity,
        productVariantId: productVariant.id,
      },
      unit: {
        id: productVariant.id,
        name: productVariant.name,
        productId: productVariant.product.id,
        productName: productVariant.product.name,
      },
    }

    await writeDurableStockAdjustmentMovement(tx, {
      actorUserId: input.actorUserId,
      externalId,
      inventoryItemId: inventory.id,
      result,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })

    if (externalId) {
      await tx.store.update({
        where: {
          id: input.storeId,
        },
        data: {
          metadata: withStockOperation(store?.metadata, {
            externalId,
            result: serializeStockAdjustmentResult(result),
            type: "stock_adjustment",
          }),
        },
        select: {
          id: true,
        },
      })
    }

    return result
  })
}
