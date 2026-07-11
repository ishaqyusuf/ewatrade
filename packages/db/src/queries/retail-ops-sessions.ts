import { Prisma, type PrismaClient } from "../generated/prisma/client"
import {
  InventoryMovementDirection as DurableInventoryMovementDirection,
  InventoryMovementSource as DurableInventoryMovementSource,
  InventoryMovementType as DurableInventoryMovementType,
  RetailOpsCloseoutReviewResult as DurableRetailOpsCloseoutReviewResult,
  RetailOpsCloseoutStatus as DurableRetailOpsCloseoutStatus,
  RetailOpsPaymentDeclarationMethod as DurableRetailOpsPaymentDeclarationMethod,
  RetailOpsStockDeclarationSource as DurableRetailOpsStockDeclarationSource,
  RetailOpsStockDeclarationType as DurableRetailOpsStockDeclarationType,
} from "../generated/prisma/enums"
import { getRetailOpsStaffStockWalletBalance } from "./retail-ops-stock-wallets"

export type OpenRetailOpsSessionInput = {
  actorUserId: string
  externalId?: string
  inventoryLines?: OpenRetailOpsSessionInventoryLineInput[]
  notes?: string
  openedAt?: Date
  openingFloatMinor: number
  storeId: string
  tenantId: string
}

export type CloseRetailOpsSessionInput = {
  actorUserId: string
  cashierSessionId: string
  closedAt?: Date
  declaredCardMinor?: number
  declaredCreditMinor?: number
  declaredTransferMinor?: number
  closingFloatMinor: number
  externalId?: string
  inventoryLines?: CloseRetailOpsSessionInventoryLineInput[]
  notes?: string
  storeId: string
  tenantId: string
}

export type CloseRetailOpsSessionInventoryLineInput = {
  countedQuantity: number
  note?: string
  productVariantId: string
}

export type OpenRetailOpsSessionInventoryLineInput = {
  countedQuantity: number
  note?: string
  productVariantId: string
}

export type ReviewRetailOpsCloseoutSessionInput = {
  actorUserId: string
  cashierSessionId: string
  note?: string
  status: "approved" | "rejected"
  storeId: string
  tenantId: string
}

export type RetailOpsSessionPaymentTotals = {
  cardMinor: number
  cashMinor: number
  creditMinor: number
  grossMinor: number
  receiptCount: number
  transferMinor: number
}

export type RetailOpsCloseoutDeclarations = {
  cardMinor: number | null
  cashMinor: number | null
  creditMinor: number | null
  transferMinor: number | null
}

export type RetailOpsCloseoutInventoryLine = {
  countedQuantity: number
  expectedQuantity: number
  note: string | null
  product: {
    id: string
    name: string
  }
  productVariantId: string
  stockSource: "staff_wallet" | "store"
  unit: {
    id: string
    name: string
    sku: string
  }
  varianceQuantity: number
}

export type RetailOpsOpeningInventoryLine = RetailOpsCloseoutInventoryLine

export type RetailOpsCloseoutInventoryDeclaration = {
  cashierSessionId: string
  declaredAt: Date
  declaredByUserId: string
  lines: RetailOpsCloseoutInventoryLine[]
}

export type RetailOpsOpeningInventoryDeclaration = {
  cashierSessionId: string
  declaredAt: Date
  declaredByUserId: string
  lines: RetailOpsOpeningInventoryLine[]
}

export type RetailOpsCloseoutReview = {
  cashierSessionId: string
  note: string | null
  reviewedAt: Date
  reviewedByUserId: string
  status: "approved" | "rejected"
}

export type OpenedRetailOpsSession = {
  externalId: string | null
  id: string
  inventory: RetailOpsOpeningInventoryDeclaration | null
  openedAt: Date
  openingFloatMinor: number
  status: string
  storeId: string
  userId: string
}

export type ClosedRetailOpsSession = {
  closedAt: Date
  closingFloatMinor: number
  expectedCashMinor: number
  externalId: string | null
  id: string
  openedAt: Date
  openingFloatMinor: number
  declarations: RetailOpsCloseoutDeclarations
  inventory: RetailOpsCloseoutInventoryDeclaration | null
  payments: RetailOpsSessionPaymentTotals
  review: RetailOpsCloseoutReview | null
  status: string
  variance: {
    cardMinor: number | null
    cashMinor: number | null
    creditMinor: number | null
    transferMinor: number | null
  }
}

export type RetailOpsPaymentReconciliationRow = {
  closedAt: Date | null
  closingFloatMinor: number | null
  expectedCashMinor: number
  id: string
  openedAt: Date
  openingFloatMinor: number
  declarations: RetailOpsCloseoutDeclarations | null
  inventory: RetailOpsCloseoutInventoryDeclaration | null
  openingInventory: RetailOpsOpeningInventoryDeclaration | null
  payments: RetailOpsSessionPaymentTotals
  review: RetailOpsCloseoutReview | null
  status: string
  user: {
    displayName: string
    email: string | null
    id: string
  }
  variance: {
    cardMinor: number | null
    cashMinor: number | null
    creditMinor: number | null
    transferMinor: number | null
  }
}

export type RetailOpsSessionStatusFilter = "all" | "closed" | "open"

export type RetailOpsSessionListRow = {
  closedAt: Date | null
  closingFloatMinor: number | null
  expectedCashMinor: number
  id: string
  openedAt: Date
  openingFloatMinor: number
  declarations: RetailOpsCloseoutDeclarations | null
  inventory: RetailOpsCloseoutInventoryDeclaration | null
  openingInventory: RetailOpsOpeningInventoryDeclaration | null
  payments: RetailOpsSessionPaymentTotals
  status: string
  user: {
    displayName: string
    email: string | null
    id: string
  }
  variance: {
    cardMinor: number | null
    cashMinor: number | null
    creditMinor: number | null
    transferMinor: number | null
  }
}

export type ListRetailOpsPaymentReconciliationInput = {
  from?: Date
  storeId: string
  tenantId: string
  to?: Date
  userId?: string
}

export type ListRetailOpsSessionsInput = {
  from?: Date
  limit?: number
  status?: RetailOpsSessionStatusFilter
  storeId: string
  tenantId: string
  to?: Date
  userId?: string
}

type RetailOpsSessionErrorCode =
  | "DUPLICATE_INVENTORY_LINE"
  | "OPEN_SESSION_EXISTS"
  | "PRODUCT_VARIANT_NOT_FOUND"
  | "SESSION_NOT_CLOSED"
  | "SESSION_NOT_FOUND"

type JsonRecord = Record<string, unknown>

type RetailOpsSessionOperationMetadata = {
  externalId: string
  result: unknown
  type: "session_close" | "session_open"
}

type RetailOpsCloseoutDeclarationMetadata = {
  cashierSessionId: string
  declaredAt: string
  declaredByUserId: string
  declarations: {
    cardMinor: number
    cashMinor: number
    creditMinor: number
    transferMinor: number
  }
}

type RetailOpsCloseoutInventoryMetadata = {
  cashierSessionId: string
  declaredAt: string
  declaredByUserId: string
  lines: Array<{
    countedQuantity: number
    expectedQuantity: number
    note: string | null
    product: {
      id: string
      name: string
    }
    productVariantId: string
    stockSource: "staff_wallet" | "store"
    unit: {
      id: string
      name: string
      sku: string
    }
    varianceQuantity: number
  }>
}

type RetailOpsOpeningInventoryMetadata = RetailOpsCloseoutInventoryMetadata

export class RetailOpsSessionError extends Error {
  code: RetailOpsSessionErrorCode

  constructor(code: RetailOpsSessionErrorCode, message: string) {
    super(message)
    this.name = "RetailOpsSessionError"
    this.code = code
  }
}

function normalizePaymentMethod(value: string | null) {
  return value?.trim().toLowerCase() ?? ""
}

function normalizeExternalId(externalId: string | undefined) {
  const trimmed = externalId?.trim()

  return trimmed || undefined
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

function getDateField(value: unknown) {
  const rawValue = getStringField(value)

  if (!rawValue) return null

  const date = new Date(rawValue)

  return Number.isNaN(date.getTime()) ? null : date
}

function getRetailOpsMetadata(metadata: unknown) {
  return asRecord(asRecord(metadata).retailOps)
}

function isDurableCloseoutTableUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

function getSessionOperations(
  metadata: unknown,
): RetailOpsSessionOperationMetadata[] {
  const sessionOperations = getRetailOpsMetadata(metadata).sessionOperations

  if (!Array.isArray(sessionOperations)) return []

  return sessionOperations.flatMap((operation) => {
    const record = asRecord(operation)
    const externalId = getStringField(record.externalId)
    const type = getStringField(record.type)

    return externalId && (type === "session_open" || type === "session_close")
      ? [
          {
            externalId,
            result: record.result,
            type,
          },
        ]
      : []
  })
}

function getCloseoutReviews(metadata: unknown): RetailOpsCloseoutReview[] {
  const closeoutReviews = getRetailOpsMetadata(metadata).closeoutReviews

  if (!Array.isArray(closeoutReviews)) return []

  return closeoutReviews.flatMap((review) => {
    const record = asRecord(review)
    const cashierSessionId = getStringField(record.cashierSessionId)
    const reviewedAt = getDateField(record.reviewedAt)
    const reviewedByUserId = getStringField(record.reviewedByUserId)
    const status = getStringField(record.status)

    if (
      !cashierSessionId ||
      !reviewedAt ||
      !reviewedByUserId ||
      (status !== "approved" && status !== "rejected")
    ) {
      return []
    }

    return [
      {
        cashierSessionId,
        note: getStringField(record.note),
        reviewedAt,
        reviewedByUserId,
        status,
      },
    ]
  })
}

function findCloseoutReview(metadata: unknown, cashierSessionId: string) {
  return (
    getCloseoutReviews(metadata).find(
      (review) => review.cashierSessionId === cashierSessionId,
    ) ?? null
  )
}

function getCloseoutDeclarations(
  metadata: unknown,
): RetailOpsCloseoutDeclarationMetadata[] {
  const declarations = getRetailOpsMetadata(metadata).closeoutDeclarations

  if (!Array.isArray(declarations)) return []

  return declarations.flatMap((declaration) => {
    const record = asRecord(declaration)
    const values = asRecord(record.declarations)
    const cashierSessionId = getStringField(record.cashierSessionId)
    const declaredAt = getStringField(record.declaredAt)
    const declaredByUserId = getStringField(record.declaredByUserId)
    const cardMinor = getNumberField(values.cardMinor)
    const cashMinor = getNumberField(values.cashMinor)
    const creditMinor = getNumberField(values.creditMinor)
    const transferMinor = getNumberField(values.transferMinor)

    if (
      !cashierSessionId ||
      !declaredAt ||
      !declaredByUserId ||
      cardMinor === null ||
      cashMinor === null ||
      creditMinor === null ||
      transferMinor === null
    ) {
      return []
    }

    return [
      {
        cashierSessionId,
        declaredAt,
        declaredByUserId,
        declarations: {
          cardMinor,
          cashMinor,
          creditMinor,
          transferMinor,
        },
      },
    ]
  })
}

function findCloseoutDeclaration(
  metadata: unknown,
  cashierSessionId: string,
) {
  const declaration = getCloseoutDeclarations(metadata).find(
    (currentDeclaration) =>
      currentDeclaration.cashierSessionId === cashierSessionId,
  )

  return declaration
    ? {
        cardMinor: declaration.declarations.cardMinor,
        cashMinor: declaration.declarations.cashMinor,
        creditMinor: declaration.declarations.creditMinor,
        transferMinor: declaration.declarations.transferMinor,
      }
    : null
}

function getCloseoutInventoryDeclarations(
  metadata: unknown,
): RetailOpsCloseoutInventoryDeclaration[] {
  const declarations = getRetailOpsMetadata(metadata).closeoutInventoryDeclarations

  if (!Array.isArray(declarations)) return []

  return declarations.flatMap((declaration) => {
    const record = asRecord(declaration)
    const cashierSessionId = getStringField(record.cashierSessionId)
    const declaredAt = getDateField(record.declaredAt)
    const declaredByUserId = getStringField(record.declaredByUserId)

    if (!cashierSessionId || !declaredAt || !declaredByUserId) return []

    const lines = Array.isArray(record.lines)
      ? record.lines.flatMap<RetailOpsCloseoutInventoryLine>((line) => {
          const lineRecord = asRecord(line)
          const product = asRecord(lineRecord.product)
          const unit = asRecord(lineRecord.unit)
          const countedQuantity = getNumberField(lineRecord.countedQuantity)
          const expectedQuantity = getNumberField(lineRecord.expectedQuantity)
          const productId = getStringField(product.id)
          const productName = getStringField(product.name)
          const productVariantId = getStringField(lineRecord.productVariantId)
          const stockSource = getStringField(lineRecord.stockSource)
          const unitId = getStringField(unit.id)
          const unitName = getStringField(unit.name)
          const unitSku = getStringField(unit.sku)
          const varianceQuantity = getNumberField(lineRecord.varianceQuantity)

          if (
            countedQuantity === null ||
            expectedQuantity === null ||
            !productId ||
            !productName ||
            !productVariantId ||
            (stockSource !== "staff_wallet" && stockSource !== "store") ||
            !unitId ||
            !unitName ||
            !unitSku ||
            varianceQuantity === null
          ) {
            return []
          }

          return [
            {
              countedQuantity,
              expectedQuantity,
              note: getStringField(lineRecord.note),
              product: {
                id: productId,
                name: productName,
              },
              productVariantId,
              stockSource,
              unit: {
                id: unitId,
                name: unitName,
                sku: unitSku,
              },
              varianceQuantity,
            },
          ]
        })
      : []

    return [
      {
        cashierSessionId,
        declaredAt,
        declaredByUserId,
        lines,
      },
    ]
  })
}

function findCloseoutInventoryDeclaration(
  metadata: unknown,
  cashierSessionId: string,
) {
  return (
    getCloseoutInventoryDeclarations(metadata).find(
      (declaration) => declaration.cashierSessionId === cashierSessionId,
    ) ?? null
  )
}

function getOpeningInventoryDeclarations(
  metadata: unknown,
): RetailOpsOpeningInventoryDeclaration[] {
  const declarations = getRetailOpsMetadata(metadata).openingInventoryDeclarations

  if (!Array.isArray(declarations)) return []

  return declarations.flatMap((declaration) => {
    const record = asRecord(declaration)
    const cashierSessionId = getStringField(record.cashierSessionId)
    const declaredAt = getDateField(record.declaredAt)
    const declaredByUserId = getStringField(record.declaredByUserId)

    if (!cashierSessionId || !declaredAt || !declaredByUserId) return []

    const lines = Array.isArray(record.lines)
      ? record.lines.flatMap<RetailOpsOpeningInventoryLine>((line) => {
          const lineRecord = asRecord(line)
          const product = asRecord(lineRecord.product)
          const unit = asRecord(lineRecord.unit)
          const countedQuantity = getNumberField(lineRecord.countedQuantity)
          const expectedQuantity = getNumberField(lineRecord.expectedQuantity)
          const productId = getStringField(product.id)
          const productName = getStringField(product.name)
          const productVariantId = getStringField(lineRecord.productVariantId)
          const stockSource = getStringField(lineRecord.stockSource)
          const unitId = getStringField(unit.id)
          const unitName = getStringField(unit.name)
          const unitSku = getStringField(unit.sku)
          const varianceQuantity = getNumberField(lineRecord.varianceQuantity)

          if (
            countedQuantity === null ||
            expectedQuantity === null ||
            !productId ||
            !productName ||
            !productVariantId ||
            (stockSource !== "staff_wallet" && stockSource !== "store") ||
            !unitId ||
            !unitName ||
            !unitSku ||
            varianceQuantity === null
          ) {
            return []
          }

          return [
            {
              countedQuantity,
              expectedQuantity,
              note: getStringField(lineRecord.note),
              product: {
                id: productId,
                name: productName,
              },
              productVariantId,
              stockSource,
              unit: {
                id: unitId,
                name: unitName,
                sku: unitSku,
              },
              varianceQuantity,
            },
          ]
        })
      : []

    return [
      {
        cashierSessionId,
        declaredAt,
        declaredByUserId,
        lines,
      },
    ]
  })
}

function findOpeningInventoryDeclaration(
  metadata: unknown,
  cashierSessionId: string,
) {
  return (
    getOpeningInventoryDeclarations(metadata).find(
      (declaration) => declaration.cashierSessionId === cashierSessionId,
    ) ?? null
  )
}

function serializeCloseoutReview(review: RetailOpsCloseoutReview) {
  return {
    ...review,
    reviewedAt: review.reviewedAt.toISOString(),
  }
}

function withCloseoutReview(
  metadata: unknown,
  review: RetailOpsCloseoutReview,
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)
  const closeoutReviews = getCloseoutReviews(metadata).filter(
    (currentReview) =>
      currentReview.cashierSessionId !== review.cashierSessionId,
  )

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      closeoutReviews: [
        serializeCloseoutReview(review),
        ...closeoutReviews.map(serializeCloseoutReview),
      ].slice(0, 250),
    },
  } as Prisma.InputJsonValue
}

function withCloseoutDeclaration(
  metadata: unknown,
  declaration: RetailOpsCloseoutDeclarationMetadata,
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)
  const declarations = getCloseoutDeclarations(metadata).filter(
    (currentDeclaration) =>
      currentDeclaration.cashierSessionId !== declaration.cashierSessionId,
  )

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      closeoutDeclarations: [declaration, ...declarations].slice(0, 250),
    },
  } as Prisma.InputJsonValue
}

function serializeCloseoutInventoryDeclaration(
  declaration: RetailOpsCloseoutInventoryDeclaration,
): RetailOpsCloseoutInventoryMetadata {
  return {
    ...declaration,
    declaredAt: declaration.declaredAt.toISOString(),
  }
}

function serializeOpeningInventoryDeclaration(
  declaration: RetailOpsOpeningInventoryDeclaration,
): RetailOpsOpeningInventoryMetadata {
  return {
    ...declaration,
    declaredAt: declaration.declaredAt.toISOString(),
  }
}

function withCloseoutInventoryDeclaration(
  metadata: unknown,
  declaration: RetailOpsCloseoutInventoryDeclaration,
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)
  const declarations = getCloseoutInventoryDeclarations(metadata).filter(
    (currentDeclaration) =>
      currentDeclaration.cashierSessionId !== declaration.cashierSessionId,
  )

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      closeoutInventoryDeclarations: [
        serializeCloseoutInventoryDeclaration(declaration),
        ...declarations.map(serializeCloseoutInventoryDeclaration),
      ].slice(0, 250),
    },
  } as Prisma.InputJsonValue
}

function withOpeningInventoryDeclaration(
  metadata: unknown,
  declaration: RetailOpsOpeningInventoryDeclaration,
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)
  const declarations = getOpeningInventoryDeclarations(metadata).filter(
    (currentDeclaration) =>
      currentDeclaration.cashierSessionId !== declaration.cashierSessionId,
  )

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      openingInventoryDeclarations: [
        serializeOpeningInventoryDeclaration(declaration),
        ...declarations.map(serializeOpeningInventoryDeclaration),
      ].slice(0, 250),
    },
  } as Prisma.InputJsonValue
}

function withSessionOperation(
  metadata: unknown,
  operation: RetailOpsSessionOperationMetadata,
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)
  const sessionOperations = getSessionOperations(metadata).filter(
    (currentOperation) =>
      currentOperation.externalId !== operation.externalId ||
      currentOperation.type !== operation.type,
  )

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      sessionOperations: [operation, ...sessionOperations].slice(0, 250),
    },
  } as Prisma.InputJsonValue
}

function serializeOpenedSessionResult(result: OpenedRetailOpsSession) {
  return {
    ...result,
    inventory: result.inventory
      ? serializeOpeningInventoryDeclaration(result.inventory)
      : null,
    openedAt: result.openedAt.toISOString(),
  }
}

function serializeClosedSessionResult(result: ClosedRetailOpsSession) {
  return {
    ...result,
    closedAt: result.closedAt.toISOString(),
    inventory: result.inventory
      ? serializeCloseoutInventoryDeclaration(result.inventory)
      : null,
    openedAt: result.openedAt.toISOString(),
  }
}

function deserializeOpenedSessionResult(
  result: unknown,
): OpenedRetailOpsSession | null {
  const record = asRecord(result)
  const inventory = record.inventory
    ? (getOpeningInventoryDeclarations({
        retailOps: {
          openingInventoryDeclarations: [record.inventory],
        },
      })[0] ?? null)
    : null
  const id = getStringField(record.id)
  const openedAt = getDateField(record.openedAt)
  const openingFloatMinor = getNumberField(record.openingFloatMinor)
  const status = getStringField(record.status)
  const storeId = getStringField(record.storeId)
  const userId = getStringField(record.userId)

  if (
    !id ||
    !openedAt ||
    openingFloatMinor === null ||
    !status ||
    !storeId ||
    !userId
  ) {
    return null
  }

  return {
    externalId: getStringField(record.externalId),
    id,
    inventory,
    openedAt,
    openingFloatMinor,
    status,
    storeId,
    userId,
  }
}

function deserializeClosedSessionResult(
  result: unknown,
): ClosedRetailOpsSession | null {
  const record = asRecord(result)
  const declarations = asRecord(record.declarations)
  const payments = asRecord(record.payments)
  const variance = asRecord(record.variance)
  const inventory = record.inventory
    ? (getCloseoutInventoryDeclarations({
        retailOps: {
          closeoutInventoryDeclarations: [record.inventory],
        },
      })[0] ?? null)
    : null
  const closedAt = getDateField(record.closedAt)
  const closingFloatMinor = getNumberField(record.closingFloatMinor)
  const expectedCashMinor = getNumberField(record.expectedCashMinor)
  const id = getStringField(record.id)
  const openedAt = getDateField(record.openedAt)
  const openingFloatMinor = getNumberField(record.openingFloatMinor)
  const status = getStringField(record.status)
  const cardMinor = getNumberField(payments.cardMinor)
  const cashMinor = getNumberField(payments.cashMinor)
  const creditMinor = getNumberField(payments.creditMinor)
  const grossMinor = getNumberField(payments.grossMinor)
  const receiptCount = getNumberField(payments.receiptCount)
  const transferMinor = getNumberField(payments.transferMinor)
  const declaredCardMinor = getNumberField(declarations.cardMinor)
  const declaredCashMinor = getNumberField(declarations.cashMinor)
  const declaredCreditMinor = getNumberField(declarations.creditMinor)
  const declaredTransferMinor = getNumberField(declarations.transferMinor)
  const cardVarianceMinor = getNumberField(variance.cardMinor)
  const cashVarianceMinor = getNumberField(variance.cashMinor)
  const creditVarianceMinor = getNumberField(variance.creditMinor)
  const transferVarianceMinor = getNumberField(variance.transferMinor)

  if (
    !closedAt ||
    closingFloatMinor === null ||
    expectedCashMinor === null ||
    !id ||
    !openedAt ||
    openingFloatMinor === null ||
    !status ||
    cardMinor === null ||
    cashMinor === null ||
    creditMinor === null ||
    grossMinor === null ||
    receiptCount === null ||
    transferMinor === null ||
    declaredCardMinor === null ||
    declaredCashMinor === null ||
    declaredCreditMinor === null ||
    declaredTransferMinor === null ||
    cardVarianceMinor === null ||
    cashVarianceMinor === null ||
    creditVarianceMinor === null ||
    transferVarianceMinor === null
  ) {
    return null
  }

  return {
    closedAt,
    closingFloatMinor,
    expectedCashMinor,
    externalId: getStringField(record.externalId),
    id,
    inventory,
    openedAt,
    openingFloatMinor,
    declarations: {
      cardMinor: declaredCardMinor,
      cashMinor: declaredCashMinor,
      creditMinor: declaredCreditMinor,
      transferMinor: declaredTransferMinor,
    },
    payments: {
      cardMinor,
      cashMinor,
      creditMinor,
      grossMinor,
      receiptCount,
      transferMinor,
    },
    review: null,
    status,
    variance: {
      cardMinor: cardVarianceMinor,
      cashMinor: cashVarianceMinor,
      creditMinor: creditVarianceMinor,
      transferMinor: transferVarianceMinor,
    },
  }
}

function findSessionOpenReplay(metadata: unknown, externalId: string) {
  const operation = getSessionOperations(metadata).find(
    (currentOperation) =>
      currentOperation.externalId === externalId &&
      currentOperation.type === "session_open",
  )

  return operation ? deserializeOpenedSessionResult(operation.result) : null
}

function findSessionCloseReplay(metadata: unknown, externalId: string) {
  const operation = getSessionOperations(metadata).find(
    (currentOperation) =>
      currentOperation.externalId === externalId &&
      currentOperation.type === "session_close",
  )

  return operation ? deserializeClosedSessionResult(operation.result) : null
}

function getTodayRange(now = new Date()) {
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)

  return {
    from,
    to: now,
  }
}

function getRange(input: { from?: Date; to?: Date }) {
  const fallback = getTodayRange()

  return {
    from: input.from ?? fallback.from,
    to: input.to ?? fallback.to,
  }
}

function getReceiptTotals(
  receipts: Array<{
    paymentMethod: string | null
    totalMinor: number
  }>,
): RetailOpsSessionPaymentTotals {
  return receipts.reduce(
    (totals, receipt) => {
      const paymentMethod = normalizePaymentMethod(receipt.paymentMethod)

      if (paymentMethod.includes("cash")) {
        totals.cashMinor += receipt.totalMinor
      }

      if (
        paymentMethod.includes("transfer") ||
        paymentMethod.includes("bank")
      ) {
        totals.transferMinor += receipt.totalMinor
      }

      if (paymentMethod.includes("card") || paymentMethod.includes("pos")) {
        totals.cardMinor += receipt.totalMinor
      }

      totals.grossMinor += receipt.totalMinor
      totals.receiptCount += 1

      return totals
    },
    {
      cardMinor: 0,
      cashMinor: 0,
      creditMinor: 0,
      grossMinor: 0,
      receiptCount: 0,
      transferMinor: 0,
    },
  )
}

function getSessionIdFromOrderMetadata(metadata: unknown) {
  const retailOps = getRetailOpsMetadata(metadata)

  if (getStringField(retailOps.source) !== "retail_ops_sale") return null
  if (getStringField(retailOps.paymentMethod) !== "credit") return null

  return getStringField(retailOps.cashierSessionId)
}

function getCreditTotalsBySession(
  orders: Array<{
    metadata: unknown
    totalMinor: number
  }>,
) {
  const totals = new Map<string, number>()

  for (const order of orders) {
    const cashierSessionId = getSessionIdFromOrderMetadata(order.metadata)

    if (!cashierSessionId) continue

    totals.set(
      cashierSessionId,
      (totals.get(cashierSessionId) ?? 0) + order.totalMinor,
    )
  }

  return totals
}

function withCreditTotal(
  payments: RetailOpsSessionPaymentTotals,
  creditMinor: number,
): RetailOpsSessionPaymentTotals {
  return {
    ...payments,
    creditMinor,
    grossMinor: payments.grossMinor + creditMinor,
  }
}

function getCloseoutVariance(input: {
  declarations: RetailOpsCloseoutDeclarations | null
  expectedCashMinor: number
  payments: RetailOpsSessionPaymentTotals
}) {
  return {
    cardMinor:
      input.declarations?.cardMinor === null ||
      input.declarations?.cardMinor === undefined
        ? null
        : input.declarations.cardMinor - input.payments.cardMinor,
    cashMinor:
      input.declarations?.cashMinor === null ||
      input.declarations?.cashMinor === undefined
        ? null
        : input.declarations.cashMinor - input.expectedCashMinor,
    creditMinor:
      input.declarations?.creditMinor === null ||
      input.declarations?.creditMinor === undefined
        ? null
        : input.declarations.creditMinor - input.payments.creditMinor,
    transferMinor:
      input.declarations?.transferMinor === null ||
      input.declarations?.transferMinor === undefined
        ? null
        : input.declarations.transferMinor - input.payments.transferMinor,
  }
}

function getCloseoutExpectedTotalMinor(result: ClosedRetailOpsSession) {
  return (
    result.expectedCashMinor +
    result.payments.transferMinor +
    result.payments.cardMinor +
    result.payments.creditMinor
  )
}

function getCloseoutDeclaredTotalMinor(result: ClosedRetailOpsSession) {
  return (
    (result.declarations.cashMinor ?? 0) +
    (result.declarations.transferMinor ?? 0) +
    (result.declarations.cardMinor ?? 0) +
    (result.declarations.creditMinor ?? 0)
  )
}

function getCloseoutPaymentVarianceCount(result: ClosedRetailOpsSession) {
  return [
    result.variance.cashMinor,
    result.variance.transferMinor,
    result.variance.cardMinor,
    result.variance.creditMinor,
  ].filter((variance) => variance !== null && variance !== 0).length
}

function getDurableCloseoutStatus(status: RetailOpsCloseoutReview["status"]) {
  return status === "approved"
    ? DurableRetailOpsCloseoutStatus.APPROVED
    : DurableRetailOpsCloseoutStatus.REJECTED
}

function getDurableCloseoutReviewResult(
  status: RetailOpsCloseoutReview["status"],
) {
  return status === "approved"
    ? DurableRetailOpsCloseoutReviewResult.APPROVED
    : DurableRetailOpsCloseoutReviewResult.REJECTED
}

function getDurableStockDeclarationSource(
  source: RetailOpsCloseoutInventoryLine["stockSource"],
) {
  return source === "staff_wallet"
    ? DurableRetailOpsStockDeclarationSource.STAFF_WALLET
    : DurableRetailOpsStockDeclarationSource.CENTRAL_STOCK
}

function getCloseoutPaymentDeclarationRows(result: ClosedRetailOpsSession) {
  return [
    {
      declaredMinor: result.declarations.cashMinor ?? 0,
      expectedMinor: result.expectedCashMinor,
      method: DurableRetailOpsPaymentDeclarationMethod.CASH,
      varianceMinor: result.variance.cashMinor ?? 0,
    },
    {
      declaredMinor: result.declarations.transferMinor ?? 0,
      expectedMinor: result.payments.transferMinor,
      method: DurableRetailOpsPaymentDeclarationMethod.TRANSFER,
      varianceMinor: result.variance.transferMinor ?? 0,
    },
    {
      declaredMinor: result.declarations.cardMinor ?? 0,
      expectedMinor: result.payments.cardMinor,
      method: DurableRetailOpsPaymentDeclarationMethod.CARD,
      varianceMinor: result.variance.cardMinor ?? 0,
    },
    {
      declaredMinor: result.declarations.creditMinor ?? 0,
      expectedMinor: result.payments.creditMinor,
      method: DurableRetailOpsPaymentDeclarationMethod.CREDIT,
      varianceMinor: result.variance.creditMinor ?? 0,
    },
  ]
}

async function writeDurableClosedSessionCloseout(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId: string
    notes: string | null
    result: ClosedRetailOpsSession
    storeId: string
    tenantId: string
  },
) {
  const expectedTotalMinor = getCloseoutExpectedTotalMinor(input.result)
  const declaredTotalMinor = getCloseoutDeclaredTotalMinor(input.result)

  try {
    const closeout = await db.retailOpsCloseout.upsert({
      where: {
        cashierSessionId: input.result.id,
      },
      create: {
        cashierSessionId: input.result.id,
        declaredTotalMinor,
        expectedTotalMinor,
        externalId: input.result.externalId,
        metadata: {
          retailOps: {
            paymentTotals: input.result.payments,
            source: "retail_ops_close_session",
          },
        } as Prisma.InputJsonValue,
        notes: input.notes,
        paymentVarianceCount: getCloseoutPaymentVarianceCount(input.result),
        status: DurableRetailOpsCloseoutStatus.PENDING_REVIEW,
        stockVarianceLineCount:
          input.result.inventory?.lines.filter(
            (line) => line.varianceQuantity !== 0,
          ).length ?? 0,
        storeId: input.storeId,
        submittedAt: input.result.closedAt,
        submittedByUserId: input.actorUserId,
        tenantId: input.tenantId,
        varianceTotalMinor: declaredTotalMinor - expectedTotalMinor,
      },
      update: {
        declaredTotalMinor,
        expectedTotalMinor,
        externalId: input.result.externalId,
        metadata: {
          retailOps: {
            paymentTotals: input.result.payments,
            source: "retail_ops_close_session",
          },
        } as Prisma.InputJsonValue,
        notes: input.notes,
        paymentVarianceCount: getCloseoutPaymentVarianceCount(input.result),
        stockVarianceLineCount:
          input.result.inventory?.lines.filter(
            (line) => line.varianceQuantity !== 0,
          ).length ?? 0,
        submittedAt: input.result.closedAt,
        submittedByUserId: input.actorUserId,
        varianceTotalMinor: declaredTotalMinor - expectedTotalMinor,
      },
      select: {
        id: true,
      },
    })

    await Promise.all(
      getCloseoutPaymentDeclarationRows(input.result).map((declaration) =>
        db.retailOpsPaymentDeclaration.upsert({
          where: {
            closeoutId_method: {
              closeoutId: closeout.id,
              method: declaration.method,
            },
          },
          create: {
            cashierSessionId: input.result.id,
            closeoutId: closeout.id,
            declaredAt: input.result.closedAt,
            declaredByUserId: input.actorUserId,
            declaredMinor: declaration.declaredMinor,
            expectedMinor: declaration.expectedMinor,
            method: declaration.method,
            storeId: input.storeId,
            tenantId: input.tenantId,
            varianceMinor: declaration.varianceMinor,
          },
          update: {
            declaredAt: input.result.closedAt,
            declaredByUserId: input.actorUserId,
            declaredMinor: declaration.declaredMinor,
            expectedMinor: declaration.expectedMinor,
            varianceMinor: declaration.varianceMinor,
          },
          select: {
            id: true,
          },
        }),
      ),
    )

    await Promise.all(
      (input.result.inventory?.lines ?? []).map((line) => {
        const stockSource = getDurableStockDeclarationSource(line.stockSource)

        return db.retailOpsStockDeclaration.upsert({
          where: {
            cashierSessionId_type_productVariantId_stockSource: {
              cashierSessionId: input.result.id,
              productVariantId: line.productVariantId,
              stockSource,
              type: DurableRetailOpsStockDeclarationType.CLOSING,
            },
          },
          create: {
            cashierSessionId: input.result.id,
            closeoutId: closeout.id,
            countedQuantity: line.countedQuantity,
            declaredAt: input.result.closedAt,
            declaredByUserId: input.actorUserId,
            expectedQuantity: line.expectedQuantity,
            metadata: {
              retailOps: {
                source: "retail_ops_close_session",
                stockSource: line.stockSource,
              },
            } as Prisma.InputJsonValue,
            note: line.note,
            productId: line.product.id,
            productVariantId: line.productVariantId,
            stockSource,
            storeId: input.storeId,
            tenantId: input.tenantId,
            type: DurableRetailOpsStockDeclarationType.CLOSING,
            unitNameSnapshot: line.unit.name,
            unitSkuSnapshot: line.unit.sku || null,
            varianceQuantity: line.varianceQuantity,
          },
          update: {
            closeoutId: closeout.id,
            countedQuantity: line.countedQuantity,
            declaredAt: input.result.closedAt,
            declaredByUserId: input.actorUserId,
            expectedQuantity: line.expectedQuantity,
            metadata: {
              retailOps: {
                source: "retail_ops_close_session",
                stockSource: line.stockSource,
              },
            } as Prisma.InputJsonValue,
            note: line.note,
            productId: line.product.id,
            productVariantId: line.productVariantId,
            unitNameSnapshot: line.unit.name,
            unitSkuSnapshot: line.unit.sku || null,
            varianceQuantity: line.varianceQuantity,
          },
          select: {
            id: true,
          },
        })
      }),
    )
  } catch (error) {
    if (isDurableCloseoutTableUnavailable(error)) return

    throw error
  }
}

async function writeDurableCloseoutReview(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    review: RetailOpsCloseoutReview
    storeId: string
    tenantId: string
  },
) {
  const closeoutStatus = getDurableCloseoutStatus(input.review.status)

  try {
    const closeout = await db.retailOpsCloseout.upsert({
      where: {
        cashierSessionId: input.review.cashierSessionId,
      },
      create: {
        cashierSessionId: input.review.cashierSessionId,
        reviewNote: input.review.note,
        reviewedAt: input.review.reviewedAt,
        reviewedByUserId: input.review.reviewedByUserId,
        status: closeoutStatus,
        storeId: input.storeId,
        submittedAt: input.review.reviewedAt,
        tenantId: input.tenantId,
      },
      update: {
        reviewNote: input.review.note,
        reviewedAt: input.review.reviewedAt,
        reviewedByUserId: input.review.reviewedByUserId,
        status: closeoutStatus,
      },
      select: {
        id: true,
      },
    })

    await db.retailOpsCloseoutReview.create({
      data: {
        cashierSessionId: input.review.cashierSessionId,
        closeoutId: closeout.id,
        metadata: {
          retailOps: {
            source: "retail_ops_closeout_review",
          },
        } as Prisma.InputJsonValue,
        note: input.review.note,
        result: getDurableCloseoutReviewResult(input.review.status),
        reviewedAt: input.review.reviewedAt,
        reviewedByUserId: input.review.reviewedByUserId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
      },
    })
  } catch (error) {
    if (isDurableCloseoutTableUnavailable(error)) return

    throw error
  }
}

async function writeDurableApprovedCloseoutAdjustmentMovements(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    review: RetailOpsCloseoutReview
    storeId: string
    tenantId: string
  },
) {
  if (input.review.status !== "approved") return

  try {
    const closeout = await db.retailOpsCloseout.findUnique({
      where: {
        cashierSessionId: input.review.cashierSessionId,
      },
      select: {
        id: true,
        submittedByUserId: true,
        stockDeclarations: {
          where: {
            type: DurableRetailOpsStockDeclarationType.CLOSING,
            varianceQuantity: {
              not: 0,
            },
          },
          select: {
            countedQuantity: true,
            expectedQuantity: true,
            id: true,
            note: true,
            productId: true,
            productVariantId: true,
            stockSource: true,
            varianceQuantity: true,
          },
        },
      },
    })

    if (!closeout || closeout.stockDeclarations.length === 0) return

    const productVariantIds = closeout.stockDeclarations.map(
      (declaration) => declaration.productVariantId,
    )
    const [inventoryItems, staffWallets] = await Promise.all([
      db.inventoryItem.findMany({
        where: {
          productVariantId: {
            in: productVariantIds,
          },
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        select: {
          id: true,
          productVariantId: true,
        },
      }),
      closeout.submittedByUserId
        ? db.staffStockWallet.findMany({
            where: {
              productVariantId: {
                in: productVariantIds,
              },
              staffUserId: closeout.submittedByUserId,
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
            select: {
              id: true,
              productVariantId: true,
            },
          })
        : Promise.resolve([]),
    ])
    const inventoryItemIdByVariantId = new Map(
      inventoryItems.map((item) => [item.productVariantId, item.id]),
    )
    const staffWalletIdByVariantId = new Map(
      staffWallets.map((wallet) => [wallet.productVariantId, wallet.id]),
    )

    await Promise.all(
      closeout.stockDeclarations.map((declaration) => {
        const isStaffWallet =
          declaration.stockSource ===
          DurableRetailOpsStockDeclarationSource.STAFF_WALLET
        const externalId = `closeout_adjustment:${declaration.id}`
        const quantity = Math.abs(declaration.varianceQuantity)

        return db.inventoryMovement.upsert({
          where: {
            tenantId_storeId_type_externalId: {
              externalId,
              storeId: input.storeId,
              tenantId: input.tenantId,
              type: DurableInventoryMovementType.CLOSEOUT_ADJUSTMENT,
            },
          },
          create: {
            actorUserId: input.review.reviewedByUserId,
            cashierSessionId: input.review.cashierSessionId,
            direction:
              declaration.varianceQuantity > 0
                ? DurableInventoryMovementDirection.INBOUND
                : DurableInventoryMovementDirection.OUTBOUND,
            externalId,
            happenedAt: input.review.reviewedAt,
            inventoryItemId: isStaffWallet
              ? null
              : (inventoryItemIdByVariantId.get(
                  declaration.productVariantId,
                ) ?? null),
            metadata: {
              retailOps: {
                closeoutId: closeout.id,
                stockDeclarationId: declaration.id,
                stockSource: isStaffWallet ? "staff_wallet" : "store",
              },
            } as Prisma.InputJsonValue,
            movementGroupId: `closeout:${closeout.id}`,
            note: declaration.note ?? input.review.note,
            onHandQuantity: isStaffWallet
              ? null
              : declaration.countedQuantity,
            previousOnHandQuantity: isStaffWallet
              ? null
              : declaration.expectedQuantity,
            previousStaffWalletQuantity: isStaffWallet
              ? declaration.expectedQuantity
              : null,
            productId: declaration.productId,
            productVariantId: declaration.productVariantId,
            quantity,
            source: DurableInventoryMovementSource.CLOSEOUT,
            sourceReferenceId: declaration.id,
            staffStockWalletId: isStaffWallet
              ? (staffWalletIdByVariantId.get(declaration.productVariantId) ??
                null)
              : null,
            staffUserId: isStaffWallet ? closeout.submittedByUserId : null,
            staffWalletQuantity: isStaffWallet
              ? declaration.countedQuantity
              : null,
            storeId: input.storeId,
            tenantId: input.tenantId,
            type: DurableInventoryMovementType.CLOSEOUT_ADJUSTMENT,
          },
          update: {
            actorUserId: input.review.reviewedByUserId,
            cashierSessionId: input.review.cashierSessionId,
            direction:
              declaration.varianceQuantity > 0
                ? DurableInventoryMovementDirection.INBOUND
                : DurableInventoryMovementDirection.OUTBOUND,
            happenedAt: input.review.reviewedAt,
            inventoryItemId: isStaffWallet
              ? null
              : (inventoryItemIdByVariantId.get(
                  declaration.productVariantId,
                ) ?? null),
            metadata: {
              retailOps: {
                closeoutId: closeout.id,
                stockDeclarationId: declaration.id,
                stockSource: isStaffWallet ? "staff_wallet" : "store",
              },
            } as Prisma.InputJsonValue,
            movementGroupId: `closeout:${closeout.id}`,
            note: declaration.note ?? input.review.note,
            onHandQuantity: isStaffWallet
              ? null
              : declaration.countedQuantity,
            previousOnHandQuantity: isStaffWallet
              ? null
              : declaration.expectedQuantity,
            previousStaffWalletQuantity: isStaffWallet
              ? declaration.expectedQuantity
              : null,
            productId: declaration.productId,
            productVariantId: declaration.productVariantId,
            quantity,
            source: DurableInventoryMovementSource.CLOSEOUT,
            sourceReferenceId: declaration.id,
            staffStockWalletId: isStaffWallet
              ? (staffWalletIdByVariantId.get(declaration.productVariantId) ??
                null)
              : null,
            staffUserId: isStaffWallet ? closeout.submittedByUserId : null,
            staffWalletQuantity: isStaffWallet
              ? declaration.countedQuantity
              : null,
          },
          select: {
            id: true,
          },
        })
      }),
    )
  } catch (error) {
    if (isDurableCloseoutTableUnavailable(error)) return

    throw error
  }
}

function getUniqueInventoryLineInputs(
  lines:
    | CloseRetailOpsSessionInventoryLineInput[]
    | OpenRetailOpsSessionInventoryLineInput[]
    | undefined,
  label = "inventory count",
) {
  const seen = new Set<string>()

  return (lines ?? []).map((line) => {
    const productVariantId = line.productVariantId.trim()

    if (seen.has(productVariantId)) {
      throw new RetailOpsSessionError(
        "DUPLICATE_INVENTORY_LINE",
        `Each product unit can only appear once in an ${label}.`,
      )
    }

    seen.add(productVariantId)

    return {
      countedQuantity: line.countedQuantity,
      note: line.note?.trim() || null,
      productVariantId,
    }
  })
}

function getUserDisplayName(user: {
  displayName: string | null
  email: string
  name: string
}) {
  return user.displayName || user.name || user.email
}

export async function listRetailOpsSessions(
  db: PrismaClient,
  input: ListRetailOpsSessionsInput,
): Promise<RetailOpsSessionListRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  const range = getRange(input)
  const status = input.status ?? "all"
  const where: Prisma.CashierSessionWhereInput = {
    tenantId: input.tenantId,
    storeId: input.storeId,
  }

  if (input.userId) {
    where.userId = input.userId
  }

  if (status === "open") {
    where.status = "OPEN"
    where.openedAt = {
      gte: range.from,
      lte: range.to,
    }
  } else if (status === "closed") {
    where.status = "CLOSED"
    where.closedAt = {
      gte: range.from,
      lte: range.to,
    }
  } else {
    where.OR = [
      {
        openedAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      {
        closedAt: {
          gte: range.from,
          lte: range.to,
        },
      },
    ]
  }

  const [store, sessions] = await Promise.all([
    db.store.findFirst({
      where: {
        id: input.storeId,
        tenantId: input.tenantId,
        status: { not: "ARCHIVED" },
      },
      select: {
        metadata: true,
      },
    }),
    db.cashierSession.findMany({
      where,
      orderBy: { openedAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        openedAt: true,
        closedAt: true,
        openingFloatMinor: true,
        closingFloatMinor: true,
        user: {
          select: {
            id: true,
            displayName: true,
            name: true,
            email: true,
          },
        },
        receipts: {
          select: {
            paymentMethod: true,
            totalMinor: true,
          },
        },
      },
    }),
  ])
  const creditOrders =
    sessions.length > 0
      ? await db.order.findMany({
          where: {
            tenantId: input.tenantId,
            storeId: input.storeId,
            paymentStatus: "PENDING",
            status: { not: "CANCELLED" },
            createdAt: {
              gte: sessions.reduce(
                (earliest, session) =>
                  session.openedAt < earliest ? session.openedAt : earliest,
                sessions[0]?.openedAt ?? range.from,
              ),
              lte: sessions.reduce((latest, session) => {
                const sessionEnd = session.closedAt ?? range.to

                return sessionEnd > latest ? sessionEnd : latest
              }, range.to),
            },
          },
          select: {
            metadata: true,
            totalMinor: true,
          },
        })
      : []
  const creditTotalsBySession = getCreditTotalsBySession(creditOrders)

  return sessions.map((session) => {
    const payments = withCreditTotal(
      getReceiptTotals(session.receipts),
      creditTotalsBySession.get(session.id) ?? 0,
    )
    const expectedCashMinor = session.openingFloatMinor + payments.cashMinor
    const metadataDeclarations = findCloseoutDeclaration(
      store?.metadata,
      session.id,
    )
    const declarations =
      metadataDeclarations ??
      (session.closingFloatMinor === null
        ? null
        : {
            cardMinor: null,
            cashMinor: session.closingFloatMinor,
            creditMinor: null,
            transferMinor: null,
          })

    return {
      closedAt: session.closedAt,
      closingFloatMinor: session.closingFloatMinor,
      declarations,
      expectedCashMinor,
      id: session.id,
      inventory: findCloseoutInventoryDeclaration(store?.metadata, session.id),
      openedAt: session.openedAt,
      openingInventory: findOpeningInventoryDeclaration(
        store?.metadata,
        session.id,
      ),
      openingFloatMinor: session.openingFloatMinor,
      payments,
      review: findCloseoutReview(store?.metadata, session.id),
      status: session.status,
      user: {
        displayName: getUserDisplayName(session.user),
        email: session.user.email,
        id: session.user.id,
      },
      variance: {
        ...getCloseoutVariance({
          declarations,
          expectedCashMinor,
          payments,
        }),
      },
    }
  })
}

export async function listRetailOpsPaymentReconciliation(
  db: PrismaClient,
  input: ListRetailOpsPaymentReconciliationInput,
): Promise<RetailOpsPaymentReconciliationRow[]> {
  const range = getRange(input)
  const [store, sessions] = await Promise.all([
    db.store.findFirst({
      where: {
        id: input.storeId,
        tenantId: input.tenantId,
        status: { not: "ARCHIVED" },
      },
      select: {
        metadata: true,
      },
    }),
    db.cashierSession.findMany({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        ...(input.userId ? { userId: input.userId } : {}),
        closedAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      orderBy: { closedAt: "desc" },
      select: {
        id: true,
        status: true,
        openedAt: true,
        closedAt: true,
        openingFloatMinor: true,
        closingFloatMinor: true,
        user: {
          select: {
            id: true,
            displayName: true,
            name: true,
            email: true,
          },
        },
        receipts: {
          select: {
            paymentMethod: true,
            totalMinor: true,
          },
        },
      },
    }),
  ])
  const creditOrders =
    sessions.length > 0
      ? await db.order.findMany({
          where: {
            tenantId: input.tenantId,
            storeId: input.storeId,
            paymentStatus: "PENDING",
            status: { not: "CANCELLED" },
            createdAt: {
              gte: sessions.reduce(
                (earliest, session) =>
                  session.openedAt < earliest ? session.openedAt : earliest,
                sessions[0]?.openedAt ?? range.from,
              ),
              lte: sessions.reduce((latest, session) => {
                const sessionEnd = session.closedAt ?? range.to

                return sessionEnd > latest ? sessionEnd : latest
              }, range.to),
            },
          },
          select: {
            metadata: true,
            totalMinor: true,
          },
        })
      : []
  const creditTotalsBySession = getCreditTotalsBySession(creditOrders)

  return sessions.map((session) => {
    const payments = withCreditTotal(
      getReceiptTotals(session.receipts),
      creditTotalsBySession.get(session.id) ?? 0,
    )
    const expectedCashMinor = session.openingFloatMinor + payments.cashMinor
    const metadataDeclarations = findCloseoutDeclaration(
      store?.metadata,
      session.id,
    )
    const declarations =
      metadataDeclarations ??
      (session.closingFloatMinor === null
        ? null
        : {
            cardMinor: null,
            cashMinor: session.closingFloatMinor,
            creditMinor: null,
            transferMinor: null,
          })

    return {
      closedAt: session.closedAt,
      closingFloatMinor: session.closingFloatMinor,
      declarations,
      expectedCashMinor,
      id: session.id,
      inventory: findCloseoutInventoryDeclaration(store?.metadata, session.id),
      openedAt: session.openedAt,
      openingInventory: findOpeningInventoryDeclaration(
        store?.metadata,
        session.id,
      ),
      openingFloatMinor: session.openingFloatMinor,
      payments,
      review: findCloseoutReview(store?.metadata, session.id),
      status: session.status,
      user: {
        displayName: getUserDisplayName(session.user),
        email: session.user.email,
        id: session.user.id,
      },
      variance: {
        ...getCloseoutVariance({
          declarations,
          expectedCashMinor,
          payments,
        }),
      },
    }
  })
}

export async function openRetailOpsSession(
  db: PrismaClient,
  input: OpenRetailOpsSessionInput,
): Promise<OpenedRetailOpsSession> {
  const externalId = normalizeExternalId(input.externalId)
  const openedAt = input.openedAt ?? new Date()
  const inventoryLineInputs = getUniqueInventoryLineInputs(
    input.inventoryLines,
    "opening inventory count",
  )

  return db.$transaction(async (tx) => {
    const store = await tx.store.findFirst({
      where: {
        id: input.storeId,
        tenantId: input.tenantId,
        status: { not: "ARCHIVED" },
      },
      select: {
        id: true,
        metadata: true,
      },
    })

    const replayedSession = externalId
      ? findSessionOpenReplay(store?.metadata, externalId)
      : null

    if (replayedSession) return replayedSession

    const existingSession = await tx.cashierSession.findFirst({
      where: {
        status: "OPEN",
        storeId: input.storeId,
        tenantId: input.tenantId,
        userId: input.actorUserId,
      },
      select: {
        id: true,
      },
    })

    if (existingSession) {
      throw new RetailOpsSessionError(
        "OPEN_SESSION_EXISTS",
        "Close the current session before opening a new one.",
      )
    }

    const [productVariants, inventoryItems] =
      inventoryLineInputs.length > 0
        ? await Promise.all([
            tx.productVariant.findMany({
              where: {
                id: {
                  in: inventoryLineInputs.map((line) => line.productVariantId),
                },
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
                sku: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            }),
            tx.inventoryItem.findMany({
              where: {
                productVariantId: {
                  in: inventoryLineInputs.map((line) => line.productVariantId),
                },
                storeId: input.storeId,
                tenantId: input.tenantId,
              },
              select: {
                productVariantId: true,
                onHandQuantity: true,
              },
            }),
          ])
        : [[], []]
    const variantsById = new Map(
      productVariants.map((variant) => [variant.id, variant]),
    )
    const inventoryByVariantId = new Map(
      inventoryItems.map((item) => [item.productVariantId, item]),
    )

    const session = await tx.cashierSession.create({
      data: {
        notes: input.notes,
        openedAt,
        openingFloatMinor: input.openingFloatMinor,
        storeId: input.storeId,
        tenantId: input.tenantId,
        userId: input.actorUserId,
      },
      select: {
        id: true,
        openedAt: true,
        openingFloatMinor: true,
        status: true,
        storeId: true,
        userId: true,
      },
    })
    const openingInventory =
      inventoryLineInputs.length > 0
        ? {
            cashierSessionId: session.id,
            declaredAt: openedAt,
            declaredByUserId: input.actorUserId,
            lines: inventoryLineInputs.map<RetailOpsOpeningInventoryLine>(
              (line) => {
                const variant = variantsById.get(line.productVariantId)

                if (!variant) {
                  throw new RetailOpsSessionError(
                    "PRODUCT_VARIANT_NOT_FOUND",
                    "One or more opening inventory units were not found for this store.",
                  )
                }

                const staffWalletBalance = store
                  ? getRetailOpsStaffStockWalletBalance(store.metadata, {
                      productVariantId: variant.id,
                      staffUserId: input.actorUserId,
                    })
                  : null
                const expectedQuantity =
                  staffWalletBalance?.quantity ??
                  inventoryByVariantId.get(variant.id)?.onHandQuantity ??
                  0
                const stockSource = staffWalletBalance
                  ? "staff_wallet"
                  : "store"

                return {
                  countedQuantity: line.countedQuantity,
                  expectedQuantity,
                  note: line.note,
                  product: {
                    id: variant.product.id,
                    name: variant.product.name,
                  },
                  productVariantId: variant.id,
                  stockSource,
                  unit: {
                    id: variant.id,
                    name: variant.name,
                    sku: variant.sku,
                  },
                  varianceQuantity: line.countedQuantity - expectedQuantity,
                }
              },
            ),
          }
        : null
    const result = {
      ...session,
      externalId: externalId ?? null,
      inventory: openingInventory,
    }

    if ((externalId || openingInventory) && store) {
      let metadata: Prisma.InputJsonValue = openingInventory
        ? withOpeningInventoryDeclaration(store.metadata, openingInventory)
        : (store.metadata as Prisma.InputJsonValue)

      if (externalId) {
        metadata = withSessionOperation(metadata, {
          externalId,
          result: serializeOpenedSessionResult(result),
          type: "session_open",
        })
      }

      await tx.store.update({
        where: {
          id: store.id,
        },
        data: {
          metadata,
        },
      })
    }

    return result
  })
}

export async function closeRetailOpsSession(
  db: PrismaClient,
  input: CloseRetailOpsSessionInput,
): Promise<ClosedRetailOpsSession> {
  const closedAt = input.closedAt ?? new Date()
  const externalId = normalizeExternalId(input.externalId)
  const inventoryLineInputs = getUniqueInventoryLineInputs(input.inventoryLines)

  return db.$transaction(async (tx) => {
    const store = await tx.store.findFirst({
      where: {
        id: input.storeId,
        tenantId: input.tenantId,
        status: { not: "ARCHIVED" },
      },
      select: {
        id: true,
        metadata: true,
      },
    })
    const replayedSession = externalId
      ? findSessionCloseReplay(store?.metadata, externalId)
      : null

    if (replayedSession) return replayedSession

    const session = await tx.cashierSession.findFirst({
      where: {
        id: input.cashierSessionId,
        status: "OPEN",
        storeId: input.storeId,
        tenantId: input.tenantId,
        userId: input.actorUserId,
      },
      select: {
        id: true,
        openedAt: true,
        openingFloatMinor: true,
      },
    })

    if (!session) {
      throw new RetailOpsSessionError(
        "SESSION_NOT_FOUND",
        "Open session not found for this user and store.",
      )
    }

    const productVariantIds = inventoryLineInputs.map(
      (line) => line.productVariantId,
    )
    const [productVariants, inventoryItems] =
      productVariantIds.length > 0
        ? await Promise.all([
            tx.productVariant.findMany({
              where: {
                id: { in: productVariantIds },
                isActive: true,
                product: {
                  storeId: input.storeId,
                  tenantId: input.tenantId,
                  status: { not: "ARCHIVED" },
                },
              },
              select: {
                id: true,
                name: true,
                sku: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            }),
            tx.inventoryItem.findMany({
              where: {
                productVariantId: { in: productVariantIds },
                storeId: input.storeId,
                tenantId: input.tenantId,
              },
              select: {
                onHandQuantity: true,
                productVariantId: true,
              },
            }),
          ])
        : [[], []]

    if (productVariants.length !== productVariantIds.length) {
      throw new RetailOpsSessionError(
        "PRODUCT_VARIANT_NOT_FOUND",
        "One or more closeout inventory units were not found for this store.",
      )
    }

    const variantsById = new Map(
      productVariants.map((variant) => [variant.id, variant]),
    )
    const inventoryByVariantId = new Map(
      inventoryItems.map((item) => [item.productVariantId, item]),
    )
    const closeoutInventory =
      inventoryLineInputs.length > 0
        ? {
            cashierSessionId: session.id,
            declaredAt: closedAt,
            declaredByUserId: input.actorUserId,
            lines: inventoryLineInputs.map<RetailOpsCloseoutInventoryLine>(
              (line) => {
                const variant = variantsById.get(line.productVariantId)

                if (!variant) {
                  throw new RetailOpsSessionError(
                    "PRODUCT_VARIANT_NOT_FOUND",
                    "One or more closeout inventory units were not found for this store.",
                  )
                }

                const staffWalletBalance = store
                  ? getRetailOpsStaffStockWalletBalance(store.metadata, {
                      productVariantId: variant.id,
                      staffUserId: input.actorUserId,
                    })
                  : null
                const expectedQuantity =
                  staffWalletBalance?.quantity ??
                  inventoryByVariantId.get(variant.id)?.onHandQuantity ??
                  0
                const stockSource = staffWalletBalance
                  ? "staff_wallet"
                  : "store"

                return {
                  countedQuantity: line.countedQuantity,
                  expectedQuantity,
                  note: line.note,
                  product: {
                    id: variant.product.id,
                    name: variant.product.name,
                  },
                  productVariantId: variant.id,
                  stockSource,
                  unit: {
                    id: variant.id,
                    name: variant.name,
                    sku: variant.sku,
                  },
                  varianceQuantity: line.countedQuantity - expectedQuantity,
                }
              },
            ),
          }
        : null

    const receipts = await tx.receipt.findMany({
      where: {
        cashierSessionId: session.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        paymentMethod: true,
        totalMinor: true,
      },
    })
    const creditOrders = await tx.order.findMany({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        paymentStatus: "PENDING",
        status: { not: "CANCELLED" },
        AND: [
          {
            metadata: {
              path: ["retailOps", "source"],
              equals: "retail_ops_sale",
            },
          },
          {
            metadata: {
              path: ["retailOps", "paymentMethod"],
              equals: "credit",
            },
          },
          {
            metadata: {
              path: ["retailOps", "cashierSessionId"],
              equals: session.id,
            },
          },
        ],
      },
      select: {
        totalMinor: true,
      },
    })
    const payments = withCreditTotal(
      getReceiptTotals(receipts),
      creditOrders.reduce((total, order) => total + order.totalMinor, 0),
    )
    const declarations = {
      cardMinor: input.declaredCardMinor ?? 0,
      cashMinor: input.closingFloatMinor,
      creditMinor: input.declaredCreditMinor ?? 0,
      transferMinor: input.declaredTransferMinor ?? 0,
    }
    const expectedCashMinor = session.openingFloatMinor + payments.cashMinor
    const variance = getCloseoutVariance({
      declarations,
      expectedCashMinor,
      payments,
    })
    const closedSession = await tx.cashierSession.update({
      where: {
        id: session.id,
      },
      data: {
        closedAt,
        closingFloatMinor: input.closingFloatMinor,
        notes: input.notes,
        status: "CLOSED",
      },
      select: {
        id: true,
        openedAt: true,
        status: true,
      },
    })

    const result = {
      closedAt,
      closingFloatMinor: input.closingFloatMinor,
      declarations,
      expectedCashMinor,
      externalId: externalId ?? null,
      id: closedSession.id,
      inventory: closeoutInventory,
      openedAt: closedSession.openedAt,
      openingFloatMinor: session.openingFloatMinor,
      payments,
      review: null,
      status: closedSession.status,
      variance,
    }

    await writeDurableClosedSessionCloseout(tx, {
      actorUserId: input.actorUserId,
      notes: input.notes ?? null,
      result,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })

    if (store) {
      let metadata: Prisma.InputJsonValue = withCloseoutDeclaration(
        store.metadata,
        {
          cashierSessionId: session.id,
          declaredAt: closedAt.toISOString(),
          declaredByUserId: input.actorUserId,
          declarations,
        },
      )

      if (closeoutInventory) {
        metadata = withCloseoutInventoryDeclaration(metadata, closeoutInventory)
      }

      if (externalId) {
        metadata = withSessionOperation(metadata, {
          externalId,
          result: serializeClosedSessionResult(result),
          type: "session_close",
        })
      }

      await tx.store.update({
        where: {
          id: store.id,
        },
        data: {
          metadata,
        },
      })
    }

    return result
  })
}

export async function reviewRetailOpsCloseoutSession(
  db: PrismaClient,
  input: ReviewRetailOpsCloseoutSessionInput,
): Promise<RetailOpsCloseoutReview> {
  return db.$transaction(async (tx) => {
    const [store, session] = await Promise.all([
      tx.store.findFirst({
        where: {
          id: input.storeId,
          tenantId: input.tenantId,
          status: { not: "ARCHIVED" },
        },
        select: {
          id: true,
          metadata: true,
        },
      }),
      tx.cashierSession.findFirst({
        where: {
          id: input.cashierSessionId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        select: {
          id: true,
          status: true,
        },
      }),
    ])

    if (!store || !session) {
      throw new RetailOpsSessionError(
        "SESSION_NOT_FOUND",
        "Closed session not found for this store.",
      )
    }

    if (session.status !== "CLOSED") {
      throw new RetailOpsSessionError(
        "SESSION_NOT_CLOSED",
        "Only closed sessions can be reviewed.",
      )
    }

    const review = {
      cashierSessionId: session.id,
      note: input.note?.trim() || null,
      reviewedAt: new Date(),
      reviewedByUserId: input.actorUserId,
      status: input.status,
    }

    await writeDurableCloseoutReview(tx, {
      review,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
    await writeDurableApprovedCloseoutAdjustmentMovements(tx, {
      review,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })

    await tx.store.update({
      where: {
        id: store.id,
      },
      data: {
        metadata: withCloseoutReview(store.metadata, review),
      },
      select: {
        id: true,
      },
    })

    return review
  })
}
