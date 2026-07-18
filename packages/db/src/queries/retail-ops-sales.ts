import { randomUUID } from "node:crypto"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  InventoryMovementDirection as DurableInventoryMovementDirection,
  InventoryMovementSource as DurableInventoryMovementSource,
  InventoryMovementType as DurableInventoryMovementType,
  OrderPaymentEventType as DurableOrderPaymentEventType,
  ServiceJobEventType as DurableServiceJobEventType,
  ServiceJobStatus as DurableServiceJobStatus,
} from "../../generated/prisma/enums"
import { resolveRetailOpsProductUnitPriceAt } from "./retail-ops-products"
import {
  type RetailOpsStaffStockWalletSale,
  getRetailOpsStaffStockWalletBalance,
  withRetailOpsStaffStockWalletSale,
} from "./retail-ops-stock-wallets"

export type RetailOpsPaymentMethod = "cash" | "transfer" | "card" | "credit"
export type RetailOpsCreditPaymentMethod = Exclude<
  RetailOpsPaymentMethod,
  "credit"
>

export type CreateRetailOpsSaleInput = {
  actorUserId: string
  cashierSessionId?: string
  creditDueAt?: Date
  creditTermsNote?: string
  customerEmail?: string
  customerName?: string
  customerPhone?: string
  externalId?: string
  notes?: string
  paymentMethod: RetailOpsPaymentMethod
  productVariantId: string
  quantity: number
  soldAt?: Date
  storeId: string
  tenantId: string
}

export type CreateRetailOpsCatalogSaleInput = {
  actorUserId: string
  cashierSessionId?: string
  creditDueAt?: Date
  creditTermsNote?: string
  customerEmail?: string
  customerName?: string
  customerPhone?: string
  externalId?: string
  lines: Array<{
    catalogItemVariantId: string
    quantity: number
  }>
  notes?: string
  paymentMethod: RetailOpsPaymentMethod
  serviceDueAt?: Date
  soldAt?: Date
  storeId: string
  tenantId: string
}

export type RetailOpsServiceJobStatus =
  | "cancelled"
  | "completed"
  | "in_progress"
  | "ready"
  | "received"

export type CreatedRetailOpsCatalogSale = {
  inventoryEffects: Array<{
    catalogItemVariantId: string
    onHandQuantity: number
    previousOnHandQuantity: number
  }>
  lines: Array<{
    catalogItemId: string
    catalogItemName: string
    catalogItemVariantId: string
    grossMinor: number
    kind: "product" | "service"
    quantity: number
    variantName: string
    unitPriceMinor: number
  }>
  order: {
    id: string
    orderNumber: string
    paymentStatus: string
    status: string
    totalMinor: number
  }
  receipt: {
    id: string
    receiptNumber: string
    totalMinor: number
  } | null
  serviceJob: {
    id: string
    status: RetailOpsServiceJobStatus
    trackingToken: string
  } | null
}

export type CreatedRetailOpsSale = {
  inventory: {
    onHandQuantity: number
    previousOnHandQuantity: number
    productVariantId: string
  }
  staffWallet: RetailOpsStaffStockWalletSale | null
  line: {
    grossMinor: number
    productId: string
    productName: string
    quantity: number
    unitName: string
    unitPriceMinor: number
  }
  order: {
    id: string
    orderNumber: string
    paymentStatus: string
    status: string
    totalMinor: number
  }
  receipt: {
    id: string
    receiptNumber: string
    totalMinor: number
  } | null
}

export type RecordRetailOpsCreditPaymentInput = {
  actorUserId: string
  amountMinor: number
  cashierSessionId?: string
  externalId?: string
  notes?: string
  orderId: string
  paidAt?: Date
  paymentMethod: RetailOpsCreditPaymentMethod
  storeId: string
  tenantId: string
}

export type CancelRetailOpsOrderLineInput = {
  actorUserId: string
  externalId?: string
  note?: string
  orderItemId: string
  refundAmountMinor?: number
  refundMethod?: RetailOpsCreditPaymentMethod
  storeId: string
  tenantId: string
}

export type CancelledRetailOpsOrderLine = {
  alreadyCancelled: boolean
  inventory: {
    onHandQuantity: number
    previousOnHandQuantity: number
    productVariantId: string
  } | null
  line: {
    cancelledAt: Date
    id: string
    kind: "product" | "service"
    name: string
    quantity: number
    totalMinor: number
  }
  order: {
    id: string
    orderNumber: string
    paymentStatus: string
    status: string
    totalMinor: number
  }
  refund: {
    amountMinor: number
    externalId: string | null
    happenedAt: Date
    id: string
    paymentMethod: string | null
  } | null
  serviceJob: {
    id: string
    status: RetailOpsServiceJobStatus
  } | null
}

export type RetailOpsCreditPayment = {
  amountMinor: number
  balanceMinor: number
  cashierSessionId: string | null
  externalId: string | null
  id: string
  note: string | null
  paidAt: Date
  paymentMethod: RetailOpsCreditPaymentMethod
  previousPaidMinor: number
  receipt: {
    id: string
    receiptNumber: string
    totalMinor: number
  }
  receivedByUserId: string
  totalMinor: number
}

export type RecordedRetailOpsCreditPayment = {
  balanceMinor: number
  order: {
    id: string
    orderNumber: string
    paymentStatus: string
    status: string
    totalMinor: number
  }
  paidMinor: number
  payment: RetailOpsCreditPayment
  payments: RetailOpsCreditPayment[]
  previousPaidMinor: number
}

export type RetailOpsRecentSaleLine = {
  cancelledAt: Date | null
  id: string
  kind: "product" | "service"
  productId: string
  productName: string
  productVariantId: string | null
  quantity: number
  sku: string | null
  totalMinor: number
  unitName: string
  unitPriceMinor: number
}

export type RetailOpsCreditAgingBucket =
  | "1_7_days_overdue"
  | "8_30_days_overdue"
  | "31_plus_days_overdue"
  | "due_today"
  | "no_due_date"
  | "not_due"

export type RetailOpsRecentSale = {
  createdAt: Date
  currencyCode: string
  customer: {
    email: string | null
    name: string | null
    phone: string | null
  }
  id: string
  lines: RetailOpsRecentSaleLine[]
  notes: string | null
  orderNumber: string
  payment: {
    method: string | null
    receiptId: string | null
    receiptNumber: string | null
    receiptTotalMinor: number | null
    state: string | null
  }
  paymentStatus: string
  retailOps: {
    actorUserId: string | null
    cashierSessionId: string | null
    externalId: string | null
  }
  status: string
  totalMinor: number
}

export type RetailOpsCreditSale = {
  actor: {
    displayName: string
    email: string | null
    id: string | null
  }
  aging: {
    bucket: RetailOpsCreditAgingBucket
    overdueDays: number | null
  }
  amountDueMinor: number
  balanceMinor: number
  creditTermsNote: string | null
  createdAt: Date
  currencyCode: string
  customer: {
    email: string | null
    name: string | null
    phone: string | null
  }
  dueAt: Date | null
  id: string
  lines: RetailOpsRecentSaleLine[]
  notes: string | null
  paidMinor: number
  lastPaymentAt: Date | null
  payments: RetailOpsCreditPayment[]
  orderNumber: string
  paymentState: string | null
  status: string
  totalMinor: number
}

export type RetailOpsSalesByRepRow = {
  actorUserId: string | null
  cashMinor: number
  cashierSessionIds: string[]
  cardMinor: number
  creditMinor: number
  displayName: string
  email: string | null
  grossMinor: number
  lastSoldAt: Date | null
  orderCount: number
  quantity: number
  transferMinor: number
}

export type ListRetailOpsRecentSalesInput = {
  actorUserId?: string
  from?: Date
  limit?: number
  storeId: string
  tenantId: string
  to?: Date
}

export type ListRetailOpsSalesByRepInput = {
  actorUserId?: string
  from?: Date
  storeId: string
  tenantId: string
  to?: Date
}

export type ListRetailOpsCreditSalesInput = {
  actorUserId?: string
  from?: Date
  limit?: number
  storeId: string
  tenantId: string
  to?: Date
}

type RetailOpsSaleErrorCode =
  | "CASHIER_SESSION_NOT_FOUND"
  | "CREDIT_ORDER_NOT_FOUND"
  | "CREDIT_PAYMENT_NOT_ALLOWED"
  | "CREDIT_PAYMENT_OVERPAID"
  | "INSUFFICIENT_STOCK"
  | "ORDER_LINE_CANCELLATION_NOT_ALLOWED"
  | "ORDER_LINE_NOT_FOUND"
  | "PRODUCT_VARIANT_NOT_FOUND"
  | "REFUND_AMOUNT_INVALID"

export class RetailOpsSaleError extends Error {
  code: RetailOpsSaleErrorCode

  constructor(code: RetailOpsSaleErrorCode, message: string) {
    super(message)
    this.name = "RetailOpsSaleError"
    this.code = code
  }
}

function createReference(prefix: string) {
  const timestamp = Date.now().toString(36).toUpperCase()
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()

  return `${prefix}-${timestamp}-${suffix}`
}

function getPaymentMethodLabel(paymentMethod: RetailOpsPaymentMethod) {
  if (paymentMethod === "card") return "card"
  if (paymentMethod === "transfer") return "bank_transfer"

  return paymentMethod
}

function getTodayRange(now = new Date()) {
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)

  return {
    from,
    to: now,
  }
}

function getReportRange(input: { from?: Date; to?: Date }) {
  const fallback = getTodayRange()

  return {
    from: input.from ?? fallback.from,
    to: input.to ?? fallback.to,
  }
}

function getDateFilter(input: { from?: Date; to?: Date }) {
  if (!input.from && !input.to) return {}

  return {
    createdAt: {
      ...(input.from ? { gte: input.from } : {}),
      ...(input.to ? { lte: input.to } : {}),
    },
  }
}

function normalizeRetailOpsPaymentMethod(value: string | null) {
  return value?.trim().toLowerCase() ?? ""
}

function getRepPaymentBucket(input: {
  paymentMethod: string | null
  paymentState: string | null
  paymentStatus: string
}) {
  const paymentMethod = normalizeRetailOpsPaymentMethod(input.paymentMethod)
  const paymentState = normalizeRetailOpsPaymentMethod(input.paymentState)
  const paymentStatus = normalizeRetailOpsPaymentMethod(input.paymentStatus)

  if (
    paymentMethod === "credit" ||
    paymentState.includes("credit") ||
    paymentStatus === "pending"
  ) {
    return "credit"
  }

  if (paymentMethod.includes("transfer") || paymentMethod.includes("bank")) {
    return "transfer"
  }

  if (paymentMethod.includes("card") || paymentMethod.includes("pos")) {
    return "card"
  }

  return "cash"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function getNumberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getDateField(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function isCreditPaymentMethod(
  value: unknown,
): value is RetailOpsCreditPaymentMethod {
  return value === "cash" || value === "transfer" || value === "card"
}

function getRetailOpsMetadata(metadata: unknown) {
  if (!isRecord(metadata) || !isRecord(metadata.retailOps)) {
    return null
  }

  return {
    actorUserId: getStringField(metadata.retailOps.actorUserId),
    cashierSessionId: getStringField(metadata.retailOps.cashierSessionId),
    creditDueAt: getStringField(metadata.retailOps.creditDueAt),
    creditTermsNote: getStringField(metadata.retailOps.creditTermsNote),
    externalId: getStringField(metadata.retailOps.externalId),
    paymentMethod: getStringField(metadata.retailOps.paymentMethod),
    paymentState: getStringField(metadata.retailOps.paymentState),
    source: getStringField(metadata.retailOps.source),
  }
}

function getCreditDueAt(metadata: ReturnType<typeof getRetailOpsMetadata>) {
  return getDateField(metadata?.creditDueAt)
}

function getDayStart(date: Date) {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)

  return day
}

function getCreditAging(
  dueAt: Date | null,
  now = new Date(),
): {
  bucket: RetailOpsCreditAgingBucket
  overdueDays: number | null
} {
  if (!dueAt) {
    return {
      bucket: "no_due_date",
      overdueDays: null,
    }
  }

  const dueDay = getDayStart(dueAt)
  const today = getDayStart(now)
  const overdueDays = Math.floor(
    (today.getTime() - dueDay.getTime()) / 86_400_000,
  )

  if (overdueDays < 0) {
    return {
      bucket: "not_due",
      overdueDays: null,
    }
  }

  if (overdueDays === 0) {
    return {
      bucket: "due_today",
      overdueDays: 0,
    }
  }

  if (overdueDays <= 7) {
    return {
      bucket: "1_7_days_overdue",
      overdueDays,
    }
  }

  if (overdueDays <= 30) {
    return {
      bucket: "8_30_days_overdue",
      overdueDays,
    }
  }

  return {
    bucket: "31_plus_days_overdue",
    overdueDays,
  }
}

function getCreditPayments(metadata: unknown): RetailOpsCreditPayment[] {
  if (!isRecord(metadata) || !isRecord(metadata.retailOps)) {
    return []
  }

  const payments = metadata.retailOps.creditPayments

  if (!Array.isArray(payments)) return []

  return payments
    .flatMap<RetailOpsCreditPayment>((payment) => {
      if (!isRecord(payment) || !isRecord(payment.receipt)) return []

      const amountMinor = getNumberField(payment.amountMinor)
      const balanceMinor = getNumberField(payment.balanceMinor)
      const id = getStringField(payment.id)
      const paidAt = getDateField(payment.paidAt)
      const paymentMethod = payment.paymentMethod
      const previousPaidMinor = getNumberField(payment.previousPaidMinor)
      const receiptId = getStringField(payment.receipt.id)
      const receiptNumber = getStringField(payment.receipt.receiptNumber)
      const receiptTotalMinor = getNumberField(payment.receipt.totalMinor)
      const receivedByUserId = getStringField(payment.receivedByUserId)
      const totalMinor = getNumberField(payment.totalMinor)

      if (
        amountMinor === null ||
        amountMinor <= 0 ||
        balanceMinor === null ||
        balanceMinor < 0 ||
        !id ||
        !paidAt ||
        !isCreditPaymentMethod(paymentMethod) ||
        previousPaidMinor === null ||
        previousPaidMinor < 0 ||
        !receiptId ||
        !receiptNumber ||
        receiptTotalMinor === null ||
        receiptTotalMinor <= 0 ||
        !receivedByUserId ||
        totalMinor === null ||
        totalMinor <= 0
      ) {
        return []
      }

      return [
        {
          amountMinor,
          balanceMinor,
          cashierSessionId: getStringField(payment.cashierSessionId),
          externalId: getStringField(payment.externalId),
          id,
          note: getStringField(payment.note),
          paidAt,
          paymentMethod,
          previousPaidMinor,
          receipt: {
            id: receiptId,
            receiptNumber,
            totalMinor: receiptTotalMinor,
          },
          receivedByUserId,
          totalMinor,
        },
      ]
    })
    .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime())
}

function serializeCreditPayment(
  payment: RetailOpsCreditPayment,
): Omit<RetailOpsCreditPayment, "paidAt"> & { paidAt: string } {
  return {
    ...payment,
    paidAt: payment.paidAt.toISOString(),
  }
}

function getCreditPaidMinor(payments: RetailOpsCreditPayment[]) {
  return payments.reduce((total, payment) => total + payment.amountMinor, 0)
}

function findCreditPaymentByExternalId(metadata: unknown, externalId: string) {
  return getCreditPayments(metadata).find(
    (payment) => payment.externalId === externalId,
  )
}

function isDurableStockLedgerTableUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

async function writeDurableSaleDeductionMovement(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId: string
    cashierSessionId: string | null
    externalId: string | null
    inventoryItemId: string | null
    note: string | null
    onHandQuantity: number | null
    orderId: string
    orderItemId: string
    previousOnHandQuantity: number | null
    previousStaffWalletQuantity: number | null
    productId: string
    productVariantId: string
    quantity: number
    soldAt: Date
    staffUserId: string | null
    staffWalletQuantity: number | null
    stockSource: "staff_wallet" | "store"
    storeId: string
    tenantId: string
  },
) {
  const movementGroupId = `sale:${input.externalId ?? input.orderId}`
  const metadata = {
    retailOps: {
      stockSource: input.stockSource,
    },
  } as Prisma.InputJsonValue

  try {
    const staffStockWallet =
      input.staffUserId && input.staffWalletQuantity !== null
        ? await db.staffStockWallet.upsert({
            where: {
              tenantId_storeId_staffUserId_productVariantId: {
                productVariantId: input.productVariantId,
                staffUserId: input.staffUserId,
                storeId: input.storeId,
                tenantId: input.tenantId,
              },
            },
            create: {
              lastMovementAt: input.soldAt,
              metadata,
              onHandQuantity: input.staffWalletQuantity,
              productId: input.productId,
              productVariantId: input.productVariantId,
              staffUserId: input.staffUserId,
              storeId: input.storeId,
              tenantId: input.tenantId,
              updatedByUserId: input.actorUserId,
            },
            update: {
              lastMovementAt: input.soldAt,
              metadata,
              onHandQuantity: input.staffWalletQuantity,
              productId: input.productId,
              updatedByUserId: input.actorUserId,
            },
            select: {
              id: true,
            },
          })
        : null

    if (input.externalId) {
      await db.inventoryMovement.upsert({
        where: {
          tenantId_storeId_type_externalId: {
            externalId: input.externalId,
            storeId: input.storeId,
            tenantId: input.tenantId,
            type: DurableInventoryMovementType.SALE_DEDUCTION,
          },
        },
        create: {
          actorUserId: input.actorUserId,
          cashierSessionId: input.cashierSessionId,
          direction: DurableInventoryMovementDirection.OUTBOUND,
          externalId: input.externalId,
          happenedAt: input.soldAt,
          inventoryItemId: input.inventoryItemId,
          metadata,
          movementGroupId,
          note: input.note,
          onHandQuantity: input.onHandQuantity,
          orderId: input.orderId,
          orderItemId: input.orderItemId,
          previousOnHandQuantity: input.previousOnHandQuantity,
          previousStaffWalletQuantity: input.previousStaffWalletQuantity,
          productId: input.productId,
          productVariantId: input.productVariantId,
          quantity: input.quantity,
          source: DurableInventoryMovementSource.SALE,
          sourceReferenceId: input.orderId,
          staffUserId: input.staffUserId,
          staffStockWalletId: staffStockWallet?.id ?? null,
          staffWalletQuantity: input.staffWalletQuantity,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: DurableInventoryMovementType.SALE_DEDUCTION,
        },
        update: {
          actorUserId: input.actorUserId,
          cashierSessionId: input.cashierSessionId,
          direction: DurableInventoryMovementDirection.OUTBOUND,
          happenedAt: input.soldAt,
          inventoryItemId: input.inventoryItemId,
          metadata,
          movementGroupId,
          note: input.note,
          onHandQuantity: input.onHandQuantity,
          orderId: input.orderId,
          orderItemId: input.orderItemId,
          previousOnHandQuantity: input.previousOnHandQuantity,
          previousStaffWalletQuantity: input.previousStaffWalletQuantity,
          productId: input.productId,
          productVariantId: input.productVariantId,
          quantity: input.quantity,
          source: DurableInventoryMovementSource.SALE,
          sourceReferenceId: input.orderId,
          staffUserId: input.staffUserId,
          staffStockWalletId: staffStockWallet?.id ?? null,
          staffWalletQuantity: input.staffWalletQuantity,
        },
        select: {
          id: true,
        },
      })

      return
    }

    await db.inventoryMovement.create({
      data: {
        actorUserId: input.actorUserId,
        cashierSessionId: input.cashierSessionId,
        direction: DurableInventoryMovementDirection.OUTBOUND,
        externalId: null,
        happenedAt: input.soldAt,
        inventoryItemId: input.inventoryItemId,
        metadata,
        movementGroupId,
        note: input.note,
        onHandQuantity: input.onHandQuantity,
        orderId: input.orderId,
        orderItemId: input.orderItemId,
        previousOnHandQuantity: input.previousOnHandQuantity,
        previousStaffWalletQuantity: input.previousStaffWalletQuantity,
        productId: input.productId,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        source: DurableInventoryMovementSource.SALE,
        sourceReferenceId: input.orderId,
        staffUserId: input.staffUserId,
        staffStockWalletId: staffStockWallet?.id ?? null,
        staffWalletQuantity: input.staffWalletQuantity,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: DurableInventoryMovementType.SALE_DEDUCTION,
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

function withCreditPayment(
  metadata: unknown,
  input: {
    balanceMinor: number
    paidMinor: number
    payment: RetailOpsCreditPayment
    paymentState: string
  },
): Prisma.InputJsonValue {
  const existingMetadata = isRecord(metadata) ? metadata : {}
  const retailOps = isRecord(existingMetadata.retailOps)
    ? existingMetadata.retailOps
    : {}
  const payments = getCreditPayments(metadata).filter(
    (payment) => payment.id !== input.payment.id,
  )

  return {
    ...existingMetadata,
    retailOps: {
      ...retailOps,
      creditBalanceMinor: input.balanceMinor,
      creditPaidMinor: input.paidMinor,
      creditPayments: [
        serializeCreditPayment(input.payment),
        ...payments.map(serializeCreditPayment),
      ].slice(0, 250),
      paymentState: input.paymentState,
    },
  } as Prisma.InputJsonValue
}

function withOrderLineCancellation(
  metadata: unknown,
  input: {
    actorUserId: string
    cancelledAt: Date
    note: string | null
    orderItemId: string
    refundedMinor: number
    totalRefundedMinor: number
  },
): Prisma.InputJsonValue {
  const existingMetadata = isRecord(metadata) ? metadata : {}
  const retailOps = isRecord(existingMetadata.retailOps)
    ? existingMetadata.retailOps
    : {}
  const existingCancellations = Array.isArray(retailOps.lineCancellations)
    ? retailOps.lineCancellations.filter(
        (entry) =>
          !isRecord(entry) ||
          getStringField(entry.orderItemId) !== input.orderItemId,
      )
    : []

  return {
    ...existingMetadata,
    retailOps: {
      ...retailOps,
      lineCancellations: [
        {
          actorUserId: input.actorUserId,
          cancelledAt: input.cancelledAt.toISOString(),
          note: input.note,
          orderItemId: input.orderItemId,
          refundedMinor: input.refundedMinor,
        },
        ...existingCancellations,
      ].slice(0, 250),
      refundedMinor: input.totalRefundedMinor,
    },
  } as Prisma.InputJsonValue
}

function getRetailOpsLineUnitName(metadata: unknown) {
  if (!isRecord(metadata) || !isRecord(metadata.retailOps)) {
    return null
  }

  return getStringField(metadata.retailOps.unitName)
}

function fromDurableCatalogItemKind(kind: string): "product" | "service" {
  return kind === "SERVICE" ? "service" : "product"
}

function fromDurableServiceJobStatus(
  status: string,
): RetailOpsServiceJobStatus {
  if (status === "CANCELLED") return "cancelled"
  if (status === "COMPLETED") return "completed"
  if (status === "IN_PROGRESS") return "in_progress"
  if (status === "READY") return "ready"

  return "received"
}

function getUserDisplayName(user: {
  displayName: string | null
  email: string
  name: string
}) {
  return user.displayName || user.name || user.email
}

function buildRecordedCreditPaymentResult(
  order: {
    id: string
    orderNumber: string
    paymentStatus: string
    status: string
    totalMinor: number
  },
  payment: RetailOpsCreditPayment,
  payments: RetailOpsCreditPayment[],
): RecordedRetailOpsCreditPayment {
  const paidMinor = getCreditPaidMinor(payments)

  return {
    balanceMinor: Math.max(order.totalMinor - paidMinor, 0),
    order,
    paidMinor,
    payment,
    payments,
    previousPaidMinor: payment.previousPaidMinor,
  }
}

export async function listRetailOpsRecentSales(
  db: PrismaClient,
  input: ListRetailOpsRecentSalesInput,
): Promise<RetailOpsRecentSale[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  const orderLookbackLimit = Math.max(limit * 10, 250)
  const orders = await db.order.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      ...getDateFilter(input),
    },
    orderBy: { createdAt: "desc" },
    take: orderLookbackLimit,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      customerEmail: true,
      customerName: true,
      customerPhone: true,
      currencyCode: true,
      notes: true,
      metadata: true,
      totalMinor: true,
      createdAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          cancelledAt: true,
          id: true,
          kindSnapshot: true,
          productId: true,
          productVariantId: true,
          nameSnapshot: true,
          skuSnapshot: true,
          quantity: true,
          unitPriceMinor: true,
          totalPriceMinor: true,
          metadata: true,
          productVariant: {
            select: {
              name: true,
            },
          },
        },
      },
      receipts: {
        orderBy: { issuedAt: "desc" },
        take: 1,
        select: {
          id: true,
          receiptNumber: true,
          paymentMethod: true,
          totalMinor: true,
        },
      },
    },
  })

  return orders
    .flatMap<RetailOpsRecentSale>((order) => {
      const metadata = getRetailOpsMetadata(order.metadata)

      if (
        metadata?.source !== "retail_ops_sale" &&
        metadata?.source !== "retail_ops_catalog_sale"
      ) {
        return []
      }

      if (input.actorUserId && metadata.actorUserId !== input.actorUserId) {
        return []
      }

      const receipt = order.receipts[0] ?? null

      return [
        {
          createdAt: order.createdAt,
          currencyCode: order.currencyCode,
          customer: {
            email: order.customerEmail,
            name: order.customerName,
            phone: order.customerPhone,
          },
          id: order.id,
          lines: order.items.map((item) => ({
            cancelledAt: item.cancelledAt,
            id: item.id,
            kind: fromDurableCatalogItemKind(item.kindSnapshot),
            productId: item.productId,
            productName: item.nameSnapshot,
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            sku: item.skuSnapshot,
            totalMinor: item.totalPriceMinor,
            unitName:
              getRetailOpsLineUnitName(item.metadata) ??
              item.productVariant?.name ??
              "Unit",
            unitPriceMinor: item.unitPriceMinor,
          })),
          notes: order.notes,
          orderNumber: order.orderNumber,
          payment: {
            method: metadata.paymentMethod ?? receipt?.paymentMethod ?? null,
            receiptId: receipt?.id ?? null,
            receiptNumber: receipt?.receiptNumber ?? null,
            receiptTotalMinor: receipt?.totalMinor ?? null,
            state: metadata.paymentState,
          },
          paymentStatus: order.paymentStatus,
          retailOps: {
            actorUserId: metadata.actorUserId,
            cashierSessionId: metadata.cashierSessionId,
            externalId: metadata.externalId,
          },
          status: order.status,
          totalMinor: order.totalMinor,
        },
      ]
    })
    .slice(0, limit)
}

export async function listRetailOpsCreditSales(
  db: PrismaClient,
  input: ListRetailOpsCreditSalesInput,
): Promise<RetailOpsCreditSale[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  const orderLookbackLimit = Math.max(limit * 10, 250)
  const orders = await db.order.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: { not: "CANCELLED" },
      paymentStatus: "PENDING",
      ...getDateFilter(input),
    },
    orderBy: { createdAt: "desc" },
    take: orderLookbackLimit,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      customerEmail: true,
      customerName: true,
      customerPhone: true,
      currencyCode: true,
      notes: true,
      metadata: true,
      totalMinor: true,
      createdAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          cancelledAt: true,
          id: true,
          kindSnapshot: true,
          productId: true,
          productVariantId: true,
          nameSnapshot: true,
          skuSnapshot: true,
          quantity: true,
          unitPriceMinor: true,
          totalPriceMinor: true,
          metadata: true,
          productVariant: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  })
  const actorUserIds = new Set<string>()
  const creditOrders = orders.flatMap((order) => {
    const metadata = getRetailOpsMetadata(order.metadata)

    if (
      (metadata?.source !== "retail_ops_sale" &&
        metadata?.source !== "retail_ops_catalog_sale") ||
      getRepPaymentBucket({
        paymentMethod: metadata.paymentMethod,
        paymentState: metadata.paymentState,
        paymentStatus: "PENDING",
      }) !== "credit"
    ) {
      return []
    }

    if (input.actorUserId && metadata.actorUserId !== input.actorUserId) {
      return []
    }

    if (metadata.actorUserId) {
      actorUserIds.add(metadata.actorUserId)
    }

    return [{ metadata, order }]
  })
  const users =
    actorUserIds.size > 0
      ? await db.user.findMany({
          where: {
            id: { in: Array.from(actorUserIds) },
          },
          select: {
            id: true,
            displayName: true,
            name: true,
            email: true,
          },
        })
      : []
  const usersById = new Map(users.map((user) => [user.id, user]))

  return creditOrders
    .map<RetailOpsCreditSale>(({ metadata, order }) => {
      const actorUser = metadata.actorUserId
        ? usersById.get(metadata.actorUserId)
        : null
      const dueAt = getCreditDueAt(metadata)
      const payments = getCreditPayments(order.metadata)
      const paidMinor = getCreditPaidMinor(payments)
      const balanceMinor = Math.max(order.totalMinor - paidMinor, 0)

      return {
        actor: {
          displayName: actorUser
            ? getUserDisplayName(actorUser)
            : metadata.actorUserId
              ? "Unknown rep"
              : "Unassigned",
          email: actorUser?.email ?? null,
          id: metadata.actorUserId,
        },
        aging: getCreditAging(dueAt),
        amountDueMinor: balanceMinor,
        balanceMinor,
        creditTermsNote: metadata.creditTermsNote,
        createdAt: order.createdAt,
        currencyCode: order.currencyCode,
        customer: {
          email: order.customerEmail,
          name: order.customerName,
          phone: order.customerPhone,
        },
        dueAt,
        id: order.id,
        lines: order.items.map((item) => ({
          cancelledAt: item.cancelledAt,
          id: item.id,
          kind: fromDurableCatalogItemKind(item.kindSnapshot),
          productId: item.productId,
          productName: item.nameSnapshot,
          productVariantId: item.productVariantId,
          quantity: item.quantity,
          sku: item.skuSnapshot,
          totalMinor: item.totalPriceMinor,
          unitName:
            getRetailOpsLineUnitName(item.metadata) ??
            item.productVariant?.name ??
            "Unit",
          unitPriceMinor: item.unitPriceMinor,
        })),
        notes: order.notes,
        paidMinor,
        lastPaymentAt: payments[0]?.paidAt ?? null,
        payments,
        orderNumber: order.orderNumber,
        paymentState: metadata.paymentState,
        status: order.status,
        totalMinor: order.totalMinor,
      }
    })
    .slice(0, limit)
}

export async function listRetailOpsSalesByRep(
  db: PrismaClient,
  input: ListRetailOpsSalesByRepInput,
): Promise<RetailOpsSalesByRepRow[]> {
  const range = getReportRange(input)
  const orders = await db.order.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: { not: "CANCELLED" },
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      paymentStatus: true,
      metadata: true,
      totalMinor: true,
      createdAt: true,
      items: {
        select: {
          quantity: true,
        },
      },
    },
  })
  const grouped = new Map<string, RetailOpsSalesByRepRow>()
  const actorUserIds = new Set<string>()

  for (const order of orders) {
    const metadata = getRetailOpsMetadata(order.metadata)

    if (metadata?.source !== "retail_ops_sale") {
      continue
    }

    if (input.actorUserId && metadata.actorUserId !== input.actorUserId) {
      continue
    }

    const actorKey = metadata.actorUserId ?? "unknown"
    const current = grouped.get(actorKey) ?? {
      actorUserId: metadata.actorUserId,
      cashMinor: 0,
      cashierSessionIds: [],
      cardMinor: 0,
      creditMinor: 0,
      displayName: metadata.actorUserId ? "Unknown rep" : "Unassigned",
      email: null,
      grossMinor: 0,
      lastSoldAt: null,
      orderCount: 0,
      quantity: 0,
      transferMinor: 0,
    }
    const paymentBucket = getRepPaymentBucket({
      paymentMethod: metadata.paymentMethod,
      paymentState: metadata.paymentState,
      paymentStatus: order.paymentStatus,
    })
    const quantity = order.items.reduce(
      (total, item) => total + item.quantity,
      0,
    )
    const cashierSessionIds = metadata.cashierSessionId
      ? new Set([...current.cashierSessionIds, metadata.cashierSessionId])
      : new Set(current.cashierSessionIds)

    grouped.set(actorKey, {
      ...current,
      cashMinor:
        current.cashMinor + (paymentBucket === "cash" ? order.totalMinor : 0),
      cashierSessionIds: Array.from(cashierSessionIds),
      cardMinor:
        current.cardMinor + (paymentBucket === "card" ? order.totalMinor : 0),
      creditMinor:
        current.creditMinor +
        (paymentBucket === "credit" ? order.totalMinor : 0),
      grossMinor: current.grossMinor + order.totalMinor,
      lastSoldAt:
        current.lastSoldAt && current.lastSoldAt > order.createdAt
          ? current.lastSoldAt
          : order.createdAt,
      orderCount: current.orderCount + 1,
      quantity: current.quantity + quantity,
      transferMinor:
        current.transferMinor +
        (paymentBucket === "transfer" ? order.totalMinor : 0),
    })

    if (metadata.actorUserId) {
      actorUserIds.add(metadata.actorUserId)
    }
  }

  if (actorUserIds.size > 0) {
    const users = await db.user.findMany({
      where: {
        id: { in: Array.from(actorUserIds) },
      },
      select: {
        id: true,
        displayName: true,
        name: true,
        email: true,
      },
    })

    for (const user of users) {
      const row = grouped.get(user.id)

      if (!row) continue

      grouped.set(user.id, {
        ...row,
        displayName: user.displayName || user.name || user.email,
        email: user.email,
      })
    }
  }

  return Array.from(grouped.values()).sort(
    (left, right) => right.grossMinor - left.grossMinor,
  )
}

export async function createRetailOpsCatalogSale(
  db: PrismaClient,
  input: CreateRetailOpsCatalogSaleInput,
): Promise<CreatedRetailOpsCatalogSale> {
  const soldAt = input.soldAt ?? new Date()
  const externalId = input.externalId?.trim() || null
  const normalizedLines = Array.from(
    input.lines.reduce((linesByVariant, line) => {
      const quantity = Math.trunc(line.quantity)

      if (quantity <= 0) {
        throw new RetailOpsSaleError(
          "PRODUCT_VARIANT_NOT_FOUND",
          "Sale quantities must be positive whole numbers.",
        )
      }

      linesByVariant.set(
        line.catalogItemVariantId,
        (linesByVariant.get(line.catalogItemVariantId) ?? 0) + quantity,
      )
      return linesByVariant
    }, new Map<string, number>()),
    ([catalogItemVariantId, quantity]) => ({
      catalogItemVariantId,
      quantity,
    }),
  )

  if (normalizedLines.length === 0) {
    throw new RetailOpsSaleError(
      "PRODUCT_VARIANT_NOT_FOUND",
      "Add at least one catalog item to the sale.",
    )
  }

  return db.$transaction(async (tx) => {
    if (externalId) {
      const existingOrder = await tx.order.findFirst({
        where: {
          storeId: input.storeId,
          tenantId: input.tenantId,
          AND: [
            {
              metadata: {
                path: ["retailOps", "source"],
                equals: "retail_ops_catalog_sale",
              },
            },
            {
              metadata: {
                path: ["retailOps", "externalId"],
                equals: externalId,
              },
            },
          ],
        },
        select: {
          id: true,
          orderNumber: true,
          paymentStatus: true,
          status: true,
          totalMinor: true,
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              kindSnapshot: true,
              nameSnapshot: true,
              productId: true,
              productVariantId: true,
              quantity: true,
              totalPriceMinor: true,
              unitPriceMinor: true,
              productVariant: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          receipts: {
            orderBy: { issuedAt: "desc" },
            take: 1,
            select: {
              id: true,
              receiptNumber: true,
              totalMinor: true,
            },
          },
          serviceJob: {
            select: {
              id: true,
              status: true,
              trackingToken: true,
            },
          },
        },
      })

      if (existingOrder) {
        return {
          inventoryEffects: [],
          lines: existingOrder.items.map((line) => ({
            catalogItemId: line.productId,
            catalogItemName: line.nameSnapshot,
            catalogItemVariantId:
              line.productVariantId ?? line.productVariant?.id ?? "",
            grossMinor: line.totalPriceMinor,
            kind: fromDurableCatalogItemKind(line.kindSnapshot),
            quantity: line.quantity,
            variantName: line.productVariant?.name ?? "Standard",
            unitPriceMinor: line.unitPriceMinor,
          })),
          order: {
            id: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            paymentStatus: existingOrder.paymentStatus,
            status: existingOrder.status,
            totalMinor: existingOrder.totalMinor,
          },
          receipt: existingOrder.receipts[0] ?? null,
          serviceJob: existingOrder.serviceJob
            ? {
                id: existingOrder.serviceJob.id,
                status: fromDurableServiceJobStatus(
                  existingOrder.serviceJob.status,
                ),
                trackingToken: existingOrder.serviceJob.trackingToken,
              }
            : null,
        }
      }
    }

    if (input.cashierSessionId) {
      const cashierSession = await tx.cashierSession.findFirst({
        where: {
          id: input.cashierSessionId,
          status: "OPEN",
          storeId: input.storeId,
          tenantId: input.tenantId,
          userId: input.actorUserId,
        },
        select: { id: true },
      })

      if (!cashierSession) {
        throw new RetailOpsSaleError(
          "CASHIER_SESSION_NOT_FOUND",
          "Open cashier session not found for this store.",
        )
      }
    }

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

    if (!store) {
      throw new RetailOpsSaleError(
        "PRODUCT_VARIANT_NOT_FOUND",
        "Store not found for this sale.",
      )
    }

    const variants = await tx.productVariant.findMany({
      where: {
        id: {
          in: normalizedLines.map((line) => line.catalogItemVariantId),
        },
        isActive: true,
        product: {
          status: { not: "ARCHIVED" },
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      },
      select: {
        id: true,
        metadata: true,
        name: true,
        priceMinor: true,
        sku: true,
        product: {
          select: {
            currencyCode: true,
            id: true,
            kind: true,
            name: true,
            serviceProfile: {
              select: {
                estimatedTurnaroundHours: true,
                fulfillmentMode: true,
              },
            },
          },
        },
      },
    })
    const variantsById = new Map(
      variants.map((variant) => [variant.id, variant]),
    )

    if (variantsById.size !== normalizedLines.length) {
      throw new RetailOpsSaleError(
        "PRODUCT_VARIANT_NOT_FOUND",
        "One or more catalog item variants were not found for this store.",
      )
    }

    const preparedLines: Array<{
      inventory: {
        id: string
        onHandQuantity: number
        reservedQuantity: number
      } | null
      quantity: number
      staffWalletBalance: ReturnType<typeof getRetailOpsStaffStockWalletBalance>
      unitPrice: Awaited<ReturnType<typeof resolveRetailOpsProductUnitPriceAt>>
      variant: (typeof variants)[number]
    }> = []

    for (const line of normalizedLines) {
      const variant = variantsById.get(line.catalogItemVariantId)

      if (!variant) {
        throw new RetailOpsSaleError(
          "PRODUCT_VARIANT_NOT_FOUND",
          "Catalog item variant not found for this store.",
        )
      }

      const isProduct = variant.product.kind === "PRODUCT"
      const inventory = isProduct
        ? await tx.inventoryItem.findFirst({
            where: {
              productVariantId: variant.id,
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
            select: {
              id: true,
              onHandQuantity: true,
              reservedQuantity: true,
            },
          })
        : null
      const staffWalletBalance = isProduct
        ? getRetailOpsStaffStockWalletBalance(store.metadata, {
            productVariantId: variant.id,
            staffUserId: input.actorUserId,
          })
        : null

      if (
        isProduct &&
        staffWalletBalance &&
        staffWalletBalance.quantity < line.quantity
      ) {
        throw new RetailOpsSaleError(
          "INSUFFICIENT_STOCK",
          `Not enough assigned stock is available for ${variant.product.name}.`,
        )
      }

      if (
        isProduct &&
        !staffWalletBalance &&
        (!inventory ||
          inventory.onHandQuantity - inventory.reservedQuantity < line.quantity)
      ) {
        throw new RetailOpsSaleError(
          "INSUFFICIENT_STOCK",
          `Not enough stock is available for ${variant.product.name}.`,
        )
      }

      const unitPrice = await resolveRetailOpsProductUnitPriceAt(tx, {
        currentPriceMinor: variant.priceMinor,
        effectiveAt: soldAt,
        metadata: variant.metadata,
        productVariantId: variant.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })

      preparedLines.push({
        inventory,
        quantity: line.quantity,
        staffWalletBalance,
        unitPrice,
        variant,
      })
    }

    const inventoryEffects: CreatedRetailOpsCatalogSale["inventoryEffects"] = []

    for (const line of preparedLines) {
      if (line.variant.product.kind !== "PRODUCT" || line.staffWalletBalance) {
        continue
      }

      const inventory = line.inventory

      if (!inventory) {
        throw new RetailOpsSaleError(
          "INSUFFICIENT_STOCK",
          `No stock record exists for ${line.variant.product.name}.`,
        )
      }

      const stockUpdate = await tx.inventoryItem.updateMany({
        where: {
          id: inventory.id,
          onHandQuantity: {
            gte: inventory.reservedQuantity + line.quantity,
          },
          reservedQuantity: inventory.reservedQuantity,
        },
        data: {
          onHandQuantity: { decrement: line.quantity },
          updatedByUserId: input.actorUserId,
        },
      })

      if (stockUpdate.count !== 1) {
        throw new RetailOpsSaleError(
          "INSUFFICIENT_STOCK",
          `Not enough stock is available for ${line.variant.product.name}.`,
        )
      }

      const updated = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: inventory.id },
        select: { onHandQuantity: true },
      })

      inventoryEffects.push({
        catalogItemVariantId: line.variant.id,
        onHandQuantity: updated.onHandQuantity,
        previousOnHandQuantity: inventory.onHandQuantity,
      })
    }

    const totalMinor = preparedLines.reduce(
      (total, line) => total + line.unitPrice.priceMinor * line.quantity,
      0,
    )
    const paymentState =
      input.paymentMethod === "credit" ? "credit_pending" : "paid"
    const creditDueAt =
      input.paymentMethod === "credit" ? input.creditDueAt : undefined
    const creditTermsNote =
      input.paymentMethod === "credit"
        ? input.creditTermsNote?.trim() || null
        : null
    const order = await tx.order.create({
      data: {
        createdAt: soldAt,
        currencyCode: preparedLines[0]?.variant.product.currencyCode ?? "NGN",
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        metadata: {
          retailOps: {
            actorUserId: input.actorUserId,
            cashierSessionId: input.cashierSessionId ?? null,
            creditDueAt: creditDueAt?.toISOString() ?? null,
            creditTermsNote,
            externalId,
            paymentMethod: input.paymentMethod,
            paymentState,
            source: "retail_ops_catalog_sale",
          },
        },
        notes: input.notes,
        orderNumber: createReference("SALE"),
        paymentStatus: input.paymentMethod === "credit" ? "PENDING" : "PAID",
        status: "COMPLETED",
        storeId: input.storeId,
        subtotalMinor: totalMinor,
        tenantId: input.tenantId,
        totalMinor,
        items: {
          create: preparedLines.map((line) => ({
            kindSnapshot: line.variant.product.kind,
            metadata: {
              retailOps: {
                itemKind: fromDurableCatalogItemKind(line.variant.product.kind),
                unitPriceEffectiveAt: line.unitPrice.effectiveAt,
                unitPriceSource: line.unitPrice.source,
                unitName: line.variant.name,
              },
            },
            nameSnapshot: line.variant.product.name,
            productId: line.variant.product.id,
            productVariantId: line.variant.id,
            quantity: line.quantity,
            skuSnapshot:
              line.variant.product.kind === "PRODUCT" ? line.variant.sku : null,
            totalPriceMinor: line.unitPrice.priceMinor * line.quantity,
            unitPriceMinor: line.unitPrice.priceMinor,
          })),
        },
      },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        status: true,
        totalMinor: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            kindSnapshot: true,
            nameSnapshot: true,
            productId: true,
            productVariantId: true,
            quantity: true,
            totalPriceMinor: true,
            unitPriceMinor: true,
          },
        },
      },
    })

    let nextStoreMetadata: unknown = store.metadata
    const staffWalletSales = new Map<string, RetailOpsStaffStockWalletSale>()

    for (const line of preparedLines) {
      if (line.variant.product.kind !== "PRODUCT" || !line.staffWalletBalance) {
        continue
      }

      const walletResult = withRetailOpsStaffStockWalletSale(
        nextStoreMetadata,
        {
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
          },
          productVariantId: line.variant.id,
          quantity: line.quantity,
          soldAt,
          staffUserId: input.actorUserId,
        },
      )
      if (!walletResult) continue

      nextStoreMetadata = walletResult.metadata
      staffWalletSales.set(line.variant.id, walletResult.sale)
    }

    if (staffWalletSales.size > 0) {
      await tx.store.update({
        where: { id: store.id },
        data: { metadata: nextStoreMetadata as Prisma.InputJsonValue },
        select: { id: true },
      })
    }

    for (const line of preparedLines) {
      if (line.variant.product.kind !== "PRODUCT") continue

      const orderItem = order.items.find(
        (item) => item.productVariantId === line.variant.id,
      )

      if (!orderItem) continue

      const inventoryEffect = inventoryEffects.find(
        (effect) => effect.catalogItemVariantId === line.variant.id,
      )
      const staffWalletSale = staffWalletSales.get(line.variant.id) ?? null

      await writeDurableSaleDeductionMovement(tx, {
        actorUserId: input.actorUserId,
        cashierSessionId: input.cashierSessionId ?? null,
        externalId: externalId ? `${externalId}:${line.variant.id}` : null,
        inventoryItemId: line.staffWalletBalance
          ? null
          : (line.inventory?.id ?? null),
        note: input.notes?.trim() || null,
        onHandQuantity: inventoryEffect?.onHandQuantity ?? null,
        orderId: order.id,
        orderItemId: orderItem.id,
        previousOnHandQuantity: inventoryEffect?.previousOnHandQuantity ?? null,
        previousStaffWalletQuantity: staffWalletSale?.previousQuantity ?? null,
        productId: line.variant.product.id,
        productVariantId: line.variant.id,
        quantity: line.quantity,
        soldAt,
        staffUserId: line.staffWalletBalance ? input.actorUserId : null,
        staffWalletQuantity: staffWalletSale?.remainingQuantity ?? null,
        stockSource: line.staffWalletBalance ? "staff_wallet" : "store",
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
    }

    const serviceLines = preparedLines.filter(
      (line) => line.variant.product.kind === "SERVICE",
    )
    const estimatedTurnaroundHours = serviceLines.reduce(
      (maximum, line) =>
        line.variant.product.serviceProfile?.fulfillmentMode === "TRACKED"
          ? Math.max(
              maximum,
              line.variant.product.serviceProfile.estimatedTurnaroundHours ?? 0,
            )
          : maximum,
      0,
    )
    const derivedServiceDueAt =
      estimatedTurnaroundHours > 0
        ? new Date(
            soldAt.getTime() + estimatedTurnaroundHours * 60 * 60 * 1_000,
          )
        : null
    const serviceJob =
      serviceLines.length === 0
        ? null
        : await tx.serviceJob.create({
            data: {
              completedAt: serviceLines.every(
                (line) =>
                  line.variant.product.serviceProfile?.fulfillmentMode ===
                  "IMMEDIATE",
              )
                ? soldAt
                : null,
              dueAt: input.serviceDueAt ?? derivedServiceDueAt,
              events: {
                create: {
                  actorUserId: input.actorUserId,
                  happenedAt: soldAt,
                  toStatus: serviceLines.every(
                    (line) =>
                      line.variant.product.serviceProfile?.fulfillmentMode ===
                      "IMMEDIATE",
                  )
                    ? "COMPLETED"
                    : "RECEIVED",
                  type: "CREATED",
                },
              },
              lines: {
                create: serviceLines.flatMap((line) => {
                  const orderItem = order.items.find(
                    (item) => item.productVariantId === line.variant.id,
                  )

                  return orderItem
                    ? [
                        {
                          nameSnapshot: line.variant.product.name,
                          orderItemId: orderItem.id,
                          productId: line.variant.product.id,
                          productVariantId: line.variant.id,
                          quantity: line.quantity,
                          totalPriceMinor:
                            line.unitPrice.priceMinor * line.quantity,
                          unitPriceMinor: line.unitPrice.priceMinor,
                          variantNameSnapshot: line.variant.name,
                        },
                      ]
                    : []
                }),
              },
              orderId: order.id,
              source: "sale",
              status: serviceLines.every(
                (line) =>
                  line.variant.product.serviceProfile?.fulfillmentMode ===
                  "IMMEDIATE",
              )
                ? "COMPLETED"
                : "RECEIVED",
              storeId: input.storeId,
              tenantId: input.tenantId,
              trackingToken: randomUUID().replace(/-/g, ""),
            },
            select: {
              id: true,
              status: true,
              trackingToken: true,
            },
          })
    const receipt =
      input.paymentMethod === "credit"
        ? null
        : await tx.receipt.create({
            data: {
              cashierSessionId: input.cashierSessionId,
              issuedAt: soldAt,
              issuedByUserId: input.actorUserId,
              orderId: order.id,
              paymentMethod: getPaymentMethodLabel(input.paymentMethod),
              receiptNumber: createReference("RCPT"),
              storeId: input.storeId,
              subtotalMinor: totalMinor,
              tenantId: input.tenantId,
              totalMinor,
            },
            select: {
              id: true,
              receiptNumber: true,
              totalMinor: true,
            },
          })

    return {
      inventoryEffects,
      lines: preparedLines.map((line) => ({
        catalogItemId: line.variant.product.id,
        catalogItemName: line.variant.product.name,
        catalogItemVariantId: line.variant.id,
        grossMinor: line.unitPrice.priceMinor * line.quantity,
        kind: fromDurableCatalogItemKind(line.variant.product.kind),
        quantity: line.quantity,
        variantName: line.variant.name,
        unitPriceMinor: line.unitPrice.priceMinor,
      })),
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        status: order.status,
        totalMinor: order.totalMinor,
      },
      receipt,
      serviceJob: serviceJob
        ? {
            id: serviceJob.id,
            status: fromDurableServiceJobStatus(serviceJob.status),
            trackingToken: serviceJob.trackingToken,
          }
        : null,
    }
  })
}

export async function createRetailOpsSale(
  db: PrismaClient,
  input: CreateRetailOpsSaleInput,
): Promise<CreatedRetailOpsSale> {
  const soldAt = input.soldAt ?? new Date()
  const externalId = input.externalId?.trim() || null

  return db.$transaction(async (tx) => {
    if (externalId) {
      const existingOrder = await tx.order.findFirst({
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          AND: [
            {
              metadata: {
                path: ["retailOps", "source"],
                equals: "retail_ops_sale",
              },
            },
            {
              metadata: {
                path: ["retailOps", "externalId"],
                equals: externalId,
              },
            },
          ],
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          orderNumber: true,
          paymentStatus: true,
          status: true,
          totalMinor: true,
          items: {
            orderBy: {
              createdAt: "asc",
            },
            take: 1,
            select: {
              metadata: true,
              nameSnapshot: true,
              productId: true,
              productVariantId: true,
              quantity: true,
              totalPriceMinor: true,
              unitPriceMinor: true,
              productVariant: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          receipts: {
            orderBy: {
              issuedAt: "desc",
            },
            take: 1,
            select: {
              id: true,
              receiptNumber: true,
              totalMinor: true,
            },
          },
        },
      })
      const existingLine = existingOrder?.items[0] ?? null

      if (existingOrder && existingLine) {
        const inventoryItem = await tx.inventoryItem.findFirst({
          where: {
            productVariantId:
              existingLine.productVariantId ?? input.productVariantId,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
          select: {
            onHandQuantity: true,
          },
        })
        const onHandQuantity = inventoryItem?.onHandQuantity ?? 0

        return {
          inventory: {
            onHandQuantity,
            previousOnHandQuantity: onHandQuantity,
            productVariantId:
              existingLine.productVariantId ?? input.productVariantId,
          },
          staffWallet: null,
          line: {
            grossMinor: existingLine.totalPriceMinor,
            productId: existingLine.productId,
            productName: existingLine.nameSnapshot,
            quantity: existingLine.quantity,
            unitName:
              getRetailOpsLineUnitName(existingLine.metadata) ??
              existingLine.productVariant?.name ??
              "Unit",
            unitPriceMinor: existingLine.unitPriceMinor,
          },
          order: {
            id: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            paymentStatus: existingOrder.paymentStatus,
            status: existingOrder.status,
            totalMinor: existingOrder.totalMinor,
          },
          receipt: existingOrder.receipts[0] ?? null,
        }
      }
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
        metadata: true,
        name: true,
        priceMinor: true,
        sku: true,
        product: {
          select: {
            id: true,
            name: true,
            currencyCode: true,
          },
        },
      },
    })

    if (!productVariant) {
      throw new RetailOpsSaleError(
        "PRODUCT_VARIANT_NOT_FOUND",
        "Product variant not found for this store.",
      )
    }

    const [store, inventoryItem] = await Promise.all([
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
      tx.inventoryItem.findFirst({
        where: {
          productVariantId: input.productVariantId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        select: {
          id: true,
          onHandQuantity: true,
          reservedQuantity: true,
        },
      }),
    ])
    const staffWalletBalance = store
      ? getRetailOpsStaffStockWalletBalance(store.metadata, {
          productVariantId: input.productVariantId,
          staffUserId: input.actorUserId,
        })
      : null

    if (staffWalletBalance && staffWalletBalance.quantity < input.quantity) {
      throw new RetailOpsSaleError(
        "INSUFFICIENT_STOCK",
        "Not enough assigned staff stock is available for this sale.",
      )
    }

    if (
      !staffWalletBalance &&
      (!inventoryItem ||
        inventoryItem.onHandQuantity - inventoryItem.reservedQuantity <
          input.quantity)
    ) {
      throw new RetailOpsSaleError(
        "INSUFFICIENT_STOCK",
        "Not enough stock is available for this sale.",
      )
    }

    if (input.cashierSessionId) {
      const cashierSession = await tx.cashierSession.findFirst({
        where: {
          id: input.cashierSessionId,
          status: "OPEN",
          storeId: input.storeId,
          tenantId: input.tenantId,
          userId: input.actorUserId,
        },
        select: {
          id: true,
        },
      })

      if (!cashierSession) {
        throw new RetailOpsSaleError(
          "CASHIER_SESSION_NOT_FOUND",
          "Open cashier session not found for this store.",
        )
      }
    }

    let updatedInventory = {
      onHandQuantity: inventoryItem?.onHandQuantity ?? 0,
    }
    const previousOnHandQuantity = inventoryItem?.onHandQuantity ?? 0

    if (!staffWalletBalance && inventoryItem) {
      const stockUpdate = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          onHandQuantity: {
            gte: inventoryItem.reservedQuantity + input.quantity,
          },
          reservedQuantity: inventoryItem.reservedQuantity,
        },
        data: {
          onHandQuantity: { decrement: input.quantity },
          updatedByUserId: input.actorUserId,
        },
      })

      if (stockUpdate.count !== 1) {
        throw new RetailOpsSaleError(
          "INSUFFICIENT_STOCK",
          "Not enough stock is available for this sale.",
        )
      }

      updatedInventory = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: inventoryItem.id },
        select: {
          onHandQuantity: true,
        },
      })
    }

    const unitPrice = await resolveRetailOpsProductUnitPriceAt(tx, {
      currentPriceMinor: productVariant.priceMinor,
      effectiveAt: soldAt,
      metadata: productVariant.metadata,
      productVariantId: productVariant.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
    const totalMinor = unitPrice.priceMinor * input.quantity
    const paymentState =
      input.paymentMethod === "credit" ? "credit_pending" : "paid"
    const creditDueAt =
      input.paymentMethod === "credit" ? input.creditDueAt : undefined
    const creditTermsNote =
      input.paymentMethod === "credit"
        ? input.creditTermsNote?.trim() || null
        : null

    const order = await tx.order.create({
      data: {
        createdAt: soldAt,
        currencyCode: productVariant.product.currencyCode,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        metadata: {
          retailOps: {
            actorUserId: input.actorUserId,
            cashierSessionId: input.cashierSessionId ?? null,
            creditDueAt: creditDueAt?.toISOString() ?? null,
            creditTermsNote,
            externalId,
            paymentMethod: input.paymentMethod,
            paymentState,
            unitPriceEffectiveAt: unitPrice.effectiveAt,
            unitPriceSource: unitPrice.source,
            source: "retail_ops_sale",
            stockSource: staffWalletBalance ? "staff_wallet" : "store",
          },
        },
        notes: input.notes,
        orderNumber: createReference("SALE"),
        paymentStatus: input.paymentMethod === "credit" ? "PENDING" : "PAID",
        status: "COMPLETED",
        storeId: input.storeId,
        subtotalMinor: totalMinor,
        tenantId: input.tenantId,
        totalMinor,
        items: {
          create: {
            metadata: {
              retailOps: {
                stockMovement: {
                  onHandQuantity: staffWalletBalance
                    ? staffWalletBalance.quantity - input.quantity
                    : updatedInventory.onHandQuantity,
                  previousOnHandQuantity: staffWalletBalance
                    ? staffWalletBalance.quantity
                    : previousOnHandQuantity,
                  source: staffWalletBalance ? "staff_wallet" : "store",
                  type: "sale",
                },
                unitPriceEffectiveAt: unitPrice.effectiveAt,
                unitPriceSource: unitPrice.source,
                unitName: productVariant.name,
              },
            },
            nameSnapshot: productVariant.product.name,
            productId: productVariant.product.id,
            productVariantId: productVariant.id,
            quantity: input.quantity,
            skuSnapshot: productVariant.sku,
            totalPriceMinor: totalMinor,
            unitPriceMinor: unitPrice.priceMinor,
          },
        },
      },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        status: true,
        totalMinor: true,
      },
    })
    const staffWalletSale =
      staffWalletBalance && store
        ? withRetailOpsStaffStockWalletSale(store.metadata, {
            order: {
              id: order.id,
              orderNumber: order.orderNumber,
            },
            productVariantId: input.productVariantId,
            quantity: input.quantity,
            soldAt,
            staffUserId: input.actorUserId,
          })
        : null

    if (staffWalletSale && store) {
      await tx.store.update({
        where: {
          id: store.id,
        },
        data: {
          metadata: staffWalletSale.metadata,
        },
        select: {
          id: true,
        },
      })
    }

    const orderItem = await tx.orderItem.findFirstOrThrow({
      where: {
        orderId: order.id,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
      },
    })

    await writeDurableSaleDeductionMovement(tx, {
      actorUserId: input.actorUserId,
      cashierSessionId: input.cashierSessionId ?? null,
      externalId,
      inventoryItemId: staffWalletBalance ? null : (inventoryItem?.id ?? null),
      note: input.notes?.trim() || null,
      onHandQuantity: staffWalletBalance
        ? null
        : updatedInventory.onHandQuantity,
      orderId: order.id,
      orderItemId: orderItem.id,
      previousOnHandQuantity: staffWalletBalance
        ? null
        : previousOnHandQuantity,
      previousStaffWalletQuantity:
        staffWalletSale?.sale.previousQuantity ?? null,
      productId: productVariant.product.id,
      productVariantId: productVariant.id,
      quantity: input.quantity,
      soldAt,
      staffUserId: staffWalletBalance ? input.actorUserId : null,
      staffWalletQuantity: staffWalletSale?.sale.remainingQuantity ?? null,
      stockSource: staffWalletBalance ? "staff_wallet" : "store",
      storeId: input.storeId,
      tenantId: input.tenantId,
    })

    const receipt =
      input.paymentMethod === "credit"
        ? null
        : await tx.receipt.create({
            data: {
              cashierSessionId: input.cashierSessionId,
              issuedAt: soldAt,
              issuedByUserId: input.actorUserId,
              orderId: order.id,
              paymentMethod: getPaymentMethodLabel(input.paymentMethod),
              receiptNumber: createReference("RCPT"),
              storeId: input.storeId,
              subtotalMinor: totalMinor,
              tenantId: input.tenantId,
              totalMinor,
            },
            select: {
              id: true,
              receiptNumber: true,
              totalMinor: true,
            },
          })

    return {
      inventory: {
        onHandQuantity: updatedInventory.onHandQuantity,
        previousOnHandQuantity,
        productVariantId: productVariant.id,
      },
      staffWallet: staffWalletSale?.sale ?? null,
      line: {
        grossMinor: totalMinor,
        productId: productVariant.product.id,
        productName: productVariant.product.name,
        quantity: input.quantity,
        unitName: productVariant.name,
        unitPriceMinor: unitPrice.priceMinor,
      },
      order,
      receipt,
    }
  })
}

export async function cancelRetailOpsOrderLine(
  db: PrismaClient,
  input: CancelRetailOpsOrderLineInput,
): Promise<CancelledRetailOpsOrderLine> {
  const cancelledAt = new Date()
  const externalId = input.externalId?.trim() || null
  const note = input.note?.trim() || null
  const refundAmountMinor = input.refundAmountMinor ?? 0

  if (!Number.isInteger(refundAmountMinor) || refundAmountMinor < 0) {
    throw new RetailOpsSaleError(
      "REFUND_AMOUNT_INVALID",
      "Refund amount must be a non-negative whole minor-unit amount.",
    )
  }

  return db.$transaction(async (tx) => {
    const line = await tx.orderItem.findFirst({
      where: {
        id: input.orderItemId,
        order: {
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      },
      select: {
        cancelledAt: true,
        cancellationReason: true,
        id: true,
        kindSnapshot: true,
        nameSnapshot: true,
        productId: true,
        productVariantId: true,
        quantity: true,
        totalPriceMinor: true,
        order: {
          select: {
            id: true,
            items: {
              select: {
                cancelledAt: true,
                id: true,
              },
            },
            metadata: true,
            orderNumber: true,
            paymentEvents: {
              where: {
                type: DurableOrderPaymentEventType.REFUND,
              },
              select: {
                amountMinor: true,
                externalId: true,
                happenedAt: true,
                id: true,
                metadata: true,
                paymentMethod: true,
              },
            },
            paymentStatus: true,
            receipts: {
              select: {
                totalMinor: true,
              },
            },
            serviceJob: {
              select: {
                id: true,
                lines: {
                  select: {
                    cancelledAt: true,
                    id: true,
                    orderItemId: true,
                  },
                },
                status: true,
              },
            },
            status: true,
            totalMinor: true,
          },
        },
      },
    })

    if (!line) {
      throw new RetailOpsSaleError(
        "ORDER_LINE_NOT_FOUND",
        "Order line not found for this store.",
      )
    }

    const existingRefund = line.order.paymentEvents.find((event) => {
      if (!externalId || event.externalId !== externalId) return false
      return (
        isRecord(event.metadata) &&
        getStringField(event.metadata.orderItemId) === line.id
      )
    })
    if (line.cancelledAt) {
      return {
        alreadyCancelled: true,
        inventory: null,
        line: {
          cancelledAt: line.cancelledAt,
          id: line.id,
          kind: fromDurableCatalogItemKind(line.kindSnapshot),
          name: line.nameSnapshot,
          quantity: line.quantity,
          totalMinor: line.totalPriceMinor,
        },
        order: {
          id: line.order.id,
          orderNumber: line.order.orderNumber,
          paymentStatus: line.order.paymentStatus,
          status: line.order.status,
          totalMinor: line.order.totalMinor,
        },
        refund: existingRefund
          ? {
              amountMinor: existingRefund.amountMinor,
              externalId: existingRefund.externalId,
              happenedAt: existingRefund.happenedAt,
              id: existingRefund.id,
              paymentMethod: existingRefund.paymentMethod,
            }
          : null,
        serviceJob: line.order.serviceJob
          ? {
              id: line.order.serviceJob.id,
              status: fromDurableServiceJobStatus(line.order.serviceJob.status),
            }
          : null,
      }
    }

    if (refundAmountMinor > line.totalPriceMinor) {
      throw new RetailOpsSaleError(
        "REFUND_AMOUNT_INVALID",
        "Refund amount cannot exceed the cancelled line total.",
      )
    }

    const isService = line.kindSnapshot === "SERVICE"
    const serviceJob = line.order.serviceJob
    if (isService && serviceJob?.status === DurableServiceJobStatus.COMPLETED) {
      throw new RetailOpsSaleError(
        "ORDER_LINE_CANCELLATION_NOT_ALLOWED",
        "Completed service work cannot be cancelled.",
      )
    }

    const paidMinor = line.order.receipts.reduce(
      (total, receipt) => total + Math.max(receipt.totalMinor, 0),
      0,
    )
    const previouslyRefundedMinor = line.order.paymentEvents.reduce(
      (total, event) => total + event.amountMinor,
      0,
    )
    if (previouslyRefundedMinor + refundAmountMinor > paidMinor) {
      throw new RetailOpsSaleError(
        "REFUND_AMOUNT_INVALID",
        "Refund amount cannot exceed the amount paid on this order.",
      )
    }

    let inventory: CancelledRetailOpsOrderLine["inventory"] = null
    if (!isService) {
      if (!line.productVariantId) {
        throw new RetailOpsSaleError(
          "ORDER_LINE_CANCELLATION_NOT_ALLOWED",
          "This product line no longer has a stock unit to reverse.",
        )
      }
      const currentInventory = await tx.inventoryItem.findUnique({
        where: {
          productVariantId: line.productVariantId,
        },
        select: {
          id: true,
          onHandQuantity: true,
        },
      })
      const updatedInventory = await tx.inventoryItem.upsert({
        where: {
          productVariantId: line.productVariantId,
        },
        create: {
          onHandQuantity: line.quantity,
          productVariantId: line.productVariantId,
          storeId: input.storeId,
          tenantId: input.tenantId,
          updatedByUserId: input.actorUserId,
        },
        update: {
          onHandQuantity: {
            increment: line.quantity,
          },
          updatedByUserId: input.actorUserId,
        },
        select: {
          id: true,
          onHandQuantity: true,
        },
      })
      const previousOnHandQuantity = currentInventory?.onHandQuantity ?? 0
      inventory = {
        onHandQuantity: updatedInventory.onHandQuantity,
        previousOnHandQuantity,
        productVariantId: line.productVariantId,
      }
      await tx.inventoryMovement.create({
        data: {
          actorUserId: input.actorUserId,
          direction: DurableInventoryMovementDirection.INBOUND,
          externalId: externalId ? `sale-reversal:${externalId}` : null,
          happenedAt: cancelledAt,
          inventoryItemId: updatedInventory.id,
          metadata: {
            retailOps: {
              cancellationReason: note,
              source: "retail_ops_order_line_cancellation",
            },
          },
          movementGroupId: `sale_reversal:${line.order.id}:${line.id}`,
          note,
          onHandQuantity: updatedInventory.onHandQuantity,
          orderId: line.order.id,
          orderItemId: line.id,
          previousOnHandQuantity,
          productId: line.productId,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          source: DurableInventoryMovementSource.SALE,
          sourceReferenceId: line.order.id,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: DurableInventoryMovementType.SALE_REVERSAL,
        },
        select: {
          id: true,
        },
      })
    }

    if (isService && serviceJob) {
      await tx.serviceJobLine.updateMany({
        where: {
          cancelledAt: null,
          orderItemId: line.id,
          serviceJobId: serviceJob.id,
        },
        data: {
          cancelledAt,
          cancelledByUserId: input.actorUserId,
          cancellationNote: note,
        },
      })
      const remainingServiceLineCount = serviceJob.lines.filter(
        (jobLine) => jobLine.orderItemId !== line.id && !jobLine.cancelledAt,
      ).length
      if (
        remainingServiceLineCount === 0 &&
        serviceJob.status !== DurableServiceJobStatus.CANCELLED
      ) {
        await tx.serviceJob.update({
          where: {
            id: serviceJob.id,
          },
          data: {
            cancelledAt,
            status: DurableServiceJobStatus.CANCELLED,
          },
          select: {
            id: true,
          },
        })
        await tx.serviceJobEvent.create({
          data: {
            actorUserId: input.actorUserId,
            fromStatus: serviceJob.status,
            happenedAt: cancelledAt,
            note: note ?? "All service lines on the order were cancelled.",
            serviceJobId: serviceJob.id,
            toStatus: DurableServiceJobStatus.CANCELLED,
            type: DurableServiceJobEventType.STATUS_CHANGED,
          },
          select: {
            id: true,
          },
        })
      } else {
        await tx.serviceJobEvent.create({
          data: {
            actorUserId: input.actorUserId,
            happenedAt: cancelledAt,
            metadata: {
              eventKind: "line_cancelled",
              orderItemId: line.id,
            },
            note: note ?? `${line.nameSnapshot} was cancelled on the order.`,
            serviceJobId: serviceJob.id,
            type: DurableServiceJobEventType.NOTE_ADDED,
          },
          select: {
            id: true,
          },
        })
      }
    }

    await tx.orderItem.update({
      where: {
        id: line.id,
      },
      data: {
        cancelledAt,
        cancelledByUserId: input.actorUserId,
        cancellationReason: note,
      },
      select: {
        id: true,
      },
    })

    const allLinesCancelled = line.order.items.every(
      (orderLine) => orderLine.id === line.id || Boolean(orderLine.cancelledAt),
    )
    const totalRefundedMinor = previouslyRefundedMinor + refundAmountMinor
    const refund =
      refundAmountMinor > 0
        ? await tx.orderPaymentEvent.create({
            data: {
              actorUserId: input.actorUserId,
              amountMinor: refundAmountMinor,
              externalId,
              happenedAt: cancelledAt,
              metadata: {
                orderItemId: line.id,
              },
              note,
              orderId: line.order.id,
              paymentMethod: input.refundMethod ?? null,
              storeId: input.storeId,
              tenantId: input.tenantId,
              type: DurableOrderPaymentEventType.REFUND,
            },
            select: {
              amountMinor: true,
              externalId: true,
              happenedAt: true,
              id: true,
              paymentMethod: true,
            },
          })
        : null
    const updatedOrder = await tx.order.update({
      where: {
        id: line.order.id,
      },
      data: {
        metadata: withOrderLineCancellation(line.order.metadata, {
          actorUserId: input.actorUserId,
          cancelledAt,
          note,
          orderItemId: line.id,
          refundedMinor: refundAmountMinor,
          totalRefundedMinor,
        }),
        paymentStatus:
          totalRefundedMinor >= line.order.totalMinor &&
          line.order.totalMinor > 0
            ? "REFUNDED"
            : line.order.paymentStatus,
        status: allLinesCancelled ? "CANCELLED" : line.order.status,
      },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        status: true,
        totalMinor: true,
        serviceJob: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    })

    return {
      alreadyCancelled: false,
      inventory,
      line: {
        cancelledAt,
        id: line.id,
        kind: fromDurableCatalogItemKind(line.kindSnapshot),
        name: line.nameSnapshot,
        quantity: line.quantity,
        totalMinor: line.totalPriceMinor,
      },
      order: {
        id: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        paymentStatus: updatedOrder.paymentStatus,
        status: updatedOrder.status,
        totalMinor: updatedOrder.totalMinor,
      },
      refund,
      serviceJob: updatedOrder.serviceJob
        ? {
            id: updatedOrder.serviceJob.id,
            status: fromDurableServiceJobStatus(updatedOrder.serviceJob.status),
          }
        : null,
    }
  })
}

export async function recordRetailOpsCreditPayment(
  db: PrismaClient,
  input: RecordRetailOpsCreditPaymentInput,
): Promise<RecordedRetailOpsCreditPayment> {
  const paidAt = input.paidAt ?? new Date()
  const externalId = input.externalId?.trim() || null

  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        id: input.orderId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        status: true,
        totalMinor: true,
        metadata: true,
      },
    })

    if (!order) {
      throw new RetailOpsSaleError(
        "CREDIT_ORDER_NOT_FOUND",
        "Credit sale not found for this store.",
      )
    }

    const metadata = getRetailOpsMetadata(order.metadata)
    const isRetailOpsCreditSale =
      (metadata?.source === "retail_ops_sale" ||
        metadata?.source === "retail_ops_catalog_sale") &&
      getRepPaymentBucket({
        paymentMethod: metadata.paymentMethod,
        paymentState: metadata.paymentState,
        paymentStatus: order.paymentStatus,
      }) === "credit"

    if (!isRetailOpsCreditSale) {
      throw new RetailOpsSaleError(
        "CREDIT_ORDER_NOT_FOUND",
        "Credit sale not found for this store.",
      )
    }

    if (externalId) {
      const existingPayment = findCreditPaymentByExternalId(
        order.metadata,
        externalId,
      )

      if (existingPayment) {
        return buildRecordedCreditPaymentResult(
          {
            id: order.id,
            orderNumber: order.orderNumber,
            paymentStatus: order.paymentStatus,
            status: order.status,
            totalMinor: order.totalMinor,
          },
          existingPayment,
          getCreditPayments(order.metadata),
        )
      }
    }

    if (order.paymentStatus !== "PENDING") {
      throw new RetailOpsSaleError(
        "CREDIT_PAYMENT_NOT_ALLOWED",
        "This credit sale is no longer awaiting payment.",
      )
    }

    if (input.cashierSessionId) {
      const cashierSession = await tx.cashierSession.findFirst({
        where: {
          id: input.cashierSessionId,
          status: "OPEN",
          storeId: input.storeId,
          tenantId: input.tenantId,
          userId: input.actorUserId,
        },
        select: {
          id: true,
        },
      })

      if (!cashierSession) {
        throw new RetailOpsSaleError(
          "CASHIER_SESSION_NOT_FOUND",
          "Open cashier session not found for this store.",
        )
      }
    }

    const existingPayments = getCreditPayments(order.metadata)
    const previousPaidMinor = getCreditPaidMinor(existingPayments)
    const previousBalanceMinor = Math.max(
      order.totalMinor - previousPaidMinor,
      0,
    )

    if (input.amountMinor > previousBalanceMinor) {
      throw new RetailOpsSaleError(
        "CREDIT_PAYMENT_OVERPAID",
        "Credit payment cannot exceed the outstanding balance.",
      )
    }

    const receipt = await tx.receipt.create({
      data: {
        cashierSessionId: input.cashierSessionId,
        issuedAt: paidAt,
        issuedByUserId: input.actorUserId,
        orderId: order.id,
        paymentMethod: getPaymentMethodLabel(input.paymentMethod),
        receiptNumber: createReference("RCPT"),
        storeId: input.storeId,
        subtotalMinor: input.amountMinor,
        tenantId: input.tenantId,
        totalMinor: input.amountMinor,
      },
      select: {
        id: true,
        receiptNumber: true,
        totalMinor: true,
      },
    })
    const paidMinor = previousPaidMinor + input.amountMinor
    const balanceMinor = Math.max(order.totalMinor - paidMinor, 0)
    const paymentStatus = balanceMinor === 0 ? "PAID" : "PENDING"
    const paymentState =
      balanceMinor === 0 ? "credit_paid" : "credit_partially_paid"
    const payment: RetailOpsCreditPayment = {
      amountMinor: input.amountMinor,
      balanceMinor,
      cashierSessionId: input.cashierSessionId ?? null,
      externalId,
      id: createReference("PAY"),
      note: input.notes?.trim() || null,
      paidAt,
      paymentMethod: input.paymentMethod,
      previousPaidMinor,
      receipt,
      receivedByUserId: input.actorUserId,
      totalMinor: order.totalMinor,
    }
    const updatedOrder = await tx.order.update({
      where: {
        id: order.id,
      },
      data: {
        metadata: withCreditPayment(order.metadata, {
          balanceMinor,
          paidMinor,
          payment,
          paymentState,
        }),
        paymentStatus,
      },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        status: true,
        totalMinor: true,
      },
    })

    return buildRecordedCreditPaymentResult(updatedOrder, payment, [
      payment,
      ...existingPayments,
    ])
  })
}
