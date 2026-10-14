import { createHash } from "node:crypto"
import { z } from "zod"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { StaffDirectoryError } from "./staff-directory"

/**
 * S05 daily operational activity: a read projection over canonical records
 * that already carry their actor. Nothing is inferred: work is attributed only
 * through the recorded actor, approver or assignment, never the current
 * assignee, and a missing historical actor stays unknown. Counts are full
 * aggregates for the filters, never the displayed page.
 */
export const staffActivityStreams = [
  "ORDER",
  "PAYMENT",
  "STOCK_OPERATION",
  "STOCK_COUNT",
  "ORDER_AMENDMENT",
  "PRODUCT_RETURN",
  "SERVICE_FULFILLMENT",
  "SERVICE_AUTHORIZATION",
  "SERVICE_WORK",
  "SERVICE_ASSIGNMENT",
  "PRICE_CHANGE",
  "FINANCE_POSTING",
] as const
export type StaffActivityStream = (typeof staffActivityStreams)[number]
export type StaffActivityRelation = "PERFORMED" | "APPROVED" | "ASSIGNED"
const relationOf: Record<StaffActivityStream, StaffActivityRelation> = {
  ORDER: "PERFORMED",
  PAYMENT: "PERFORMED",
  STOCK_OPERATION: "PERFORMED",
  STOCK_COUNT: "PERFORMED",
  ORDER_AMENDMENT: "PERFORMED",
  PRODUCT_RETURN: "PERFORMED",
  SERVICE_FULFILLMENT: "PERFORMED",
  SERVICE_AUTHORIZATION: "APPROVED",
  SERVICE_WORK: "PERFORMED",
  SERVICE_ASSIGNMENT: "ASSIGNED",
  PRICE_CHANGE: "PERFORMED",
  FINANCE_POSTING: "PERFORMED",
}
/**
 * Finance-originated postings only. Postings that mirror sales, stock, service
 * or purchase receipt work (cost of goods, order billing, stock moves) are
 * already shown under those activities and would be counted twice.
 */
export const financeActivitySourceKinds = [
  "EXPENSE_BILL",
  "BILL_PAYMENT",
  "OWNER_BILL_PAYMENT",
  "TRANSFER",
  "MONEY_REVERSAL",
  "OWNER_CONTRIBUTION",
  "OWNER_WITHDRAWAL",
  "CASH_COUNT_ADJUSTMENT",
  "CASH_COUNT_ADJUSTMENT_REVERSAL",
  "CUSTOMER_RECEIPT",
  "CUSTOMER_CREDIT_ALLOCATION",
  "CUSTOMER_ALLOCATION_RELEASE",
  "CUSTOMER_HELD_CREDIT_REFUND",
  "CUSTOMER_LEDGER_REVERSAL",
  "CUSTOMER_LEDGER_OPENING",
  "CUSTOMER_OPENING",
  "PURCHASE_BILL",
  "PURCHASE_PAYMENT",
  "PURCHASE_PAYMENT_REVERSAL",
  "PURCHASE_RECEIPT_RECOGNITION",
  "PURCHASE_RECOGNITION_REVERSAL",
  "SUPPLIER_ADVANCE",
  "SUPPLIER_ADVANCE_ALLOCATION",
  "SUPPLIER_ALLOCATION_RELEASE",
  "SUPPLIER_OPENING_PAYABLE",
  "SUPPLIER_ENTRY_REVERSAL",
  "OPENING_BALANCE",
  "INVENTORY_COST_REVIEW",
] as const
/** Catalog prices apply across Stores; a Store filter cannot attribute them. */
const tenantWide = new Set<StaffActivityStream>(["PRICE_CHANGE"])
const maxWindowMs = 92 * 24 * 60 * 60 * 1000
/** Mirrors the Prisma `StockOperationType` enum. */
const stockOperationTypes = [
  "OPENING_STOCK",
  "RECEIPT",
  "RESERVATION_COMMIT",
  "SALE_FULFILLMENT",
  "RETURN",
  "COUNT_RECONCILIATION",
  "ADJUSTMENT",
  "TRANSFER",
  "TRANSFORMATION",
  "STOCK_TRANSITION",
  "CUSTODY_ASSIGNMENT",
  "CUSTODY_RETURN",
  "CORRECTION",
  "CORRECTION_REVERSAL",
  "CORRECTION_REPLACEMENT",
] as const

const id = z.string().trim().min(1).max(160)
const filters = z.object({
  membershipId: id.optional(),
  storeId: id.optional(),
  stream: z.enum(staffActivityStreams).optional(),
  relation: z.enum(["PERFORMED", "APPROVED", "ASSIGNED"]).optional(),
  /** "Who changed this price?": price changes of one Product. */
  catalogItemId: id.optional(),
  /** "Stock adjustments by staff": one stock operation type, rows and counts. */
  stockOperationType: z.enum(stockOperationTypes).optional(),
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
})
const pageFields = filters.extend({
  cursor: z.string().min(1).max(2048).optional(),
  limit: z.number().int().min(1).max(100).default(25),
})
export const staffActivityPageInput = pageFields
  .strict()
  .superRefine((value, ctx) => {
    const span = new Date(value.to).getTime() - new Date(value.from).getTime()
    if (span <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "End must follow start; the end time is exclusive.",
      })
    else if (span > maxWindowMs)
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "Choose a period of 92 days or less.",
      })
    if (value.stockOperationType && value.stream !== "STOCK_OPERATION")
      ctx.addIssue({
        code: "custom",
        path: ["stockOperationType"],
        message: "An operation type filter applies to stock operations only.",
      })
    if (value.catalogItemId && value.stream !== "PRICE_CHANGE")
      ctx.addIssue({
        code: "custom",
        path: ["catalogItemId"],
        message: "A Product filter applies to price changes only.",
      })
    if (
      value.stream &&
      value.relation &&
      relationOf[value.stream] !== value.relation
    )
      ctx.addIssue({
        code: "custom",
        path: ["relation"],
        message: "Choose a relation the selected activity type records.",
      })
  })
export type StaffActivityPageInput = z.input<typeof staffActivityPageInput> & {
  tenantId: string
  viewerUserId: string
  /**
   * Stores the viewer may read, resolved by the caller from current Store
   * access; null means every Store and is accepted only for Owner/Admin.
   */
  storeIds: readonly string[] | null
  /**
   * Finance Books the viewer may read, resolved by the caller with the
   * canonical finance entitlement; null leaves finance postings out.
   */
  financeBookIds: readonly string[] | null
}

type Position = { at: Date; id: string; stream: StaffActivityStream }
const positionSchema = z
  .object({
    at: z.iso.datetime(),
    id,
    stream: z.enum(staffActivityStreams),
    filterKey: z.string().length(64),
  })
  .strict()
function filterKey(input: {
  tenantId: string
  storeIds: readonly string[] | null
  financeBookIds: readonly string[] | null
  filters: z.infer<typeof filters>
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: input.tenantId,
        storeIds: input.storeIds ? [...input.storeIds].sort() : null,
        financeBookIds: input.financeBookIds
          ? [...input.financeBookIds].sort()
          : null,
        ...input.filters,
      }),
    )
    .digest("hex")
}
function decodeCursor(cursor: string | undefined, key: string) {
  if (!cursor) return undefined
  try {
    const value = positionSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    )
    if (value.filterKey !== key) throw Error("Changed filters")
    return { at: new Date(value.at), id: value.id, stream: value.stream }
  } catch {
    throw new StaffDirectoryError(
      "BAD_REQUEST",
      "Continue with the original staff activity filters and cursor.",
    )
  }
}
/** Rows after the cursor in (time desc, stream asc, id desc) order. */
function afterWhere(
  stream: StaffActivityStream,
  after: Position | undefined,
  field: string,
) {
  if (!after) return {}
  if (stream > after.stream) return { [field]: { lte: after.at } }
  if (stream < after.stream) return { [field]: { lt: after.at } }
  return {
    OR: [
      { [field]: { lt: after.at } },
      { [field]: after.at, id: { lt: after.id } },
    ],
  }
}

type Scope = {
  tenantId: string
  financeBookIds?: string[]
  catalogItemId?: string
  stockOperationType?: (typeof stockOperationTypes)[number]
  subjectUserId?: string
  storeIds?: string[]
  /** Restricts a stream to exact event identities (re-reading shown events). */
  ids?: string[]
  time: { gte: Date; lt: Date }
}
export type StaffActivityRecord =
  | { kind: "order"; id: string; label: string }
  | { kind: "payment"; id: string; orderId: string; label: string }
  | { kind: "stock_operation"; id: string; label: string }
  | { kind: "stock_count"; id: string; label: string }
  | { kind: "service_job"; id: string; orderId: string; label: string }
  | { kind: "product"; id: string; offeringId: string; label: string }
  | { kind: "finance_entry"; id: string; bookId: string; label: string }
type Projected = {
  id: string
  at: Date
  storeId: string | null
  actorUserId: string | null
  record: StaffActivityRecord
  /** The recorded fact at the time, not current eligibility or status. */
  outcome: string
  amount: { minor: number; currencyCode: string } | null
}
type Loader = (
  tx: Prisma.TransactionClient,
  scope: Scope,
  page: { after?: Position; take: number },
) => Promise<[Projected[], number]>

const words = (value: string) => value.toLowerCase().replaceAll("_", " ")
const quantity = (value: Prisma.Decimal) => value.toString()
const store = (scope: Scope) =>
  scope.storeIds ? { storeId: { in: scope.storeIds } } : {}
const only = (scope: Scope) => (scope.ids ? { id: { in: scope.ids } } : {})

const loaders: Record<StaffActivityStream, Loader> = {
  ORDER: async (tx, scope, page) => {
    const where: Prisma.CommercialOrderWhereInput = {
      ...only(scope),
      tenantId: scope.tenantId,
      ...store(scope),
      ...(scope.subjectUserId ? { createdByUserId: scope.subjectUserId } : {}),
      createdAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.commercialOrder.findMany({
        where: { AND: [where, afterWhere("ORDER", page.after, "createdAt")] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          storeId: true,
          createdByUserId: true,
          createdAt: true,
          orderNumber: true,
          totalMinor: true,
          currencyCode: true,
        },
      }),
      tx.commercialOrder.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.createdAt,
        storeId: row.storeId,
        actorUserId: row.createdByUserId,
        record: { kind: "order", id: row.id, label: row.orderNumber },
        outcome: "Order recorded",
        amount: { minor: row.totalMinor, currencyCode: row.currencyCode },
      })),
      total,
    ]
  },
  PAYMENT: async (tx, scope, page) => {
    const where: Prisma.CommercialOrderPaymentWhereInput = {
      ...only(scope),
      tenantId: scope.tenantId,
      ...store(scope),
      ...(scope.subjectUserId ? { recordedByUserId: scope.subjectUserId } : {}),
      recordedAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.commercialOrderPayment.findMany({
        where: {
          AND: [where, afterWhere("PAYMENT", page.after, "recordedAt")],
        },
        orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          storeId: true,
          orderId: true,
          recordedByUserId: true,
          recordedAt: true,
          type: true,
          method: true,
          amountMinor: true,
          order: { select: { orderNumber: true, currencyCode: true } },
        },
      }),
      tx.commercialOrderPayment.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.recordedAt,
        storeId: row.storeId,
        actorUserId: row.recordedByUserId,
        record: {
          kind: "payment",
          id: row.id,
          orderId: row.orderId,
          label: row.order.orderNumber,
        },
        outcome: `${row.type === "REFUND" ? "Refund" : "Payment"} recorded · ${words(row.method)}`,
        amount: {
          minor: row.amountMinor,
          currencyCode: row.order.currencyCode,
        },
      })),
      total,
    ]
  },
  STOCK_OPERATION: async (tx, scope, page) => {
    const where: Prisma.StockOperationWhereInput = {
      ...only(scope),
      tenantId: scope.tenantId,
      ...store(scope),
      ...(scope.stockOperationType ? { type: scope.stockOperationType } : {}),
      ...(scope.subjectUserId ? { actorUserId: scope.subjectUserId } : {}),
      createdAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.stockOperation.findMany({
        where: {
          AND: [where, afterWhere("STOCK_OPERATION", page.after, "createdAt")],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          storeId: true,
          actorUserId: true,
          createdAt: true,
          effectiveAt: true,
          type: true,
          reason: true,
          correctionOfOperationId: true,
        },
      }),
      tx.stockOperation.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.createdAt,
        storeId: row.storeId,
        actorUserId: row.actorUserId,
        record: {
          kind: "stock_operation",
          id: row.id,
          label: words(row.type),
        },
        outcome: [
          `Stock ${words(row.type)} recorded`,
          row.correctionOfOperationId ? "corrects an earlier operation" : null,
          row.effectiveAt.getTime() !== row.createdAt.getTime()
            ? `effective ${row.effectiveAt.toISOString()}`
            : null,
          row.reason,
        ]
          .filter(Boolean)
          .join(" · "),
        amount: null,
      })),
      total,
    ]
  },
  STOCK_COUNT: async (tx, scope, page) => {
    const where: Prisma.StockCountWhereInput = {
      ...only(scope),
      tenantId: scope.tenantId,
      ...store(scope),
      ...(scope.subjectUserId ? { actorUserId: scope.subjectUserId } : {}),
      createdAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.stockCount.findMany({
        where: {
          AND: [where, afterWhere("STOCK_COUNT", page.after, "createdAt")],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          storeId: true,
          actorUserId: true,
          createdAt: true,
          reason: true,
        },
      }),
      tx.stockCount.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.createdAt,
        storeId: row.storeId,
        actorUserId: row.actorUserId,
        record: { kind: "stock_count", id: row.id, label: "Stock count" },
        // Finalisation is a separate stock operation with its own actor.
        outcome: ["Stock count started", row.reason]
          .filter(Boolean)
          .join(" · "),
        amount: null,
      })),
      total,
    ]
  },
  ORDER_AMENDMENT: async (tx, scope, page) => {
    const where: Prisma.CommercialOrderAmendmentWhereInput = {
      ...only(scope),
      tenantId: scope.tenantId,
      ...(scope.storeIds ? { order: { storeId: { in: scope.storeIds } } } : {}),
      ...(scope.subjectUserId ? { actorUserId: scope.subjectUserId } : {}),
      createdAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.commercialOrderAmendment.findMany({
        where: {
          AND: [where, afterWhere("ORDER_AMENDMENT", page.after, "createdAt")],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          orderId: true,
          actorUserId: true,
          createdAt: true,
          kind: true,
          reason: true,
          order: { select: { storeId: true, orderNumber: true } },
        },
      }),
      tx.commercialOrderAmendment.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.createdAt,
        storeId: row.order.storeId,
        actorUserId: row.actorUserId,
        record: {
          kind: "order",
          id: row.orderId,
          label: row.order.orderNumber,
        },
        outcome: `Order ${words(row.kind)} · ${row.reason}`,
        amount: null,
      })),
      total,
    ]
  },
  PRODUCT_RETURN: async (tx, scope, page) => {
    const where: Prisma.ProductReturnWhereInput = {
      ...only(scope),
      tenantId: scope.tenantId,
      ...store(scope),
      ...(scope.subjectUserId ? { actorUserId: scope.subjectUserId } : {}),
      createdAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.productReturn.findMany({
        where: {
          AND: [where, afterWhere("PRODUCT_RETURN", page.after, "createdAt")],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          storeId: true,
          orderId: true,
          actorUserId: true,
          createdAt: true,
          quantity: true,
          disposition: true,
          order: { select: { orderNumber: true } },
        },
      }),
      tx.productReturn.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.createdAt,
        storeId: row.storeId,
        actorUserId: row.actorUserId,
        record: {
          kind: "order",
          id: row.orderId,
          label: row.order.orderNumber,
        },
        outcome: `Return of ${quantity(row.quantity)} recorded · ${words(row.disposition)}`,
        amount: null,
      })),
      total,
    ]
  },
  SERVICE_FULFILLMENT: async (tx, scope, page) => {
    const where: Prisma.CommercialServiceFulfillmentWhereInput = {
      ...only(scope),
      tenantId: scope.tenantId,
      ...(scope.storeIds ? { order: { storeId: { in: scope.storeIds } } } : {}),
      ...(scope.subjectUserId ? { actorUserId: scope.subjectUserId } : {}),
      performedAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.commercialServiceFulfillment.findMany({
        where: {
          AND: [
            where,
            afterWhere("SERVICE_FULFILLMENT", page.after, "performedAt"),
          ],
        },
        orderBy: [{ performedAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          orderId: true,
          actorUserId: true,
          performedAt: true,
          quantity: true,
          order: { select: { storeId: true, orderNumber: true } },
        },
      }),
      tx.commercialServiceFulfillment.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.performedAt,
        storeId: row.order.storeId,
        actorUserId: row.actorUserId,
        record: {
          kind: "order",
          id: row.orderId,
          label: row.order.orderNumber,
        },
        outcome: `Service fulfilled · quantity ${quantity(row.quantity)}`,
        amount: null,
      })),
      total,
    ]
  },
  SERVICE_AUTHORIZATION: async (tx, scope, page) => {
    const where: Prisma.CommercialServiceAuthorizationWhereInput = {
      ...only(scope),
      tenantId: scope.tenantId,
      ...(scope.storeIds ? { order: { storeId: { in: scope.storeIds } } } : {}),
      ...(scope.subjectUserId ? { actorUserId: scope.subjectUserId } : {}),
      authorizedAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.commercialServiceAuthorization.findMany({
        where: {
          AND: [
            where,
            afterWhere("SERVICE_AUTHORIZATION", page.after, "authorizedAt"),
          ],
        },
        orderBy: [{ authorizedAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          orderId: true,
          actorUserId: true,
          authorizedAt: true,
          quantity: true,
          order: { select: { storeId: true, orderNumber: true } },
        },
      }),
      tx.commercialServiceAuthorization.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.authorizedAt,
        storeId: row.order.storeId,
        actorUserId: row.actorUserId,
        record: {
          kind: "order",
          id: row.orderId,
          label: row.order.orderNumber,
        },
        outcome: `Service approved · quantity ${quantity(row.quantity)}`,
        amount: null,
      })),
      total,
    ]
  },
  SERVICE_WORK: async (tx, scope, page) => {
    const where: Prisma.ServiceWorkEventWhereInput = {
      ...only(scope),
      tenantId: scope.tenantId,
      ...(scope.storeIds
        ? { serviceJob: { storeId: { in: scope.storeIds } } }
        : {}),
      ...(scope.subjectUserId ? { actorUserId: scope.subjectUserId } : {}),
      createdAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.serviceWorkEvent.findMany({
        where: {
          AND: [where, afterWhere("SERVICE_WORK", page.after, "createdAt")],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          serviceJobId: true,
          actorUserId: true,
          createdAt: true,
          type: true,
          toStatus: true,
          serviceJob: {
            select: {
              storeId: true,
              commercialOrderId: true,
              commercialOrder: { select: { orderNumber: true } },
            },
          },
        },
      }),
      tx.serviceWorkEvent.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.createdAt,
        storeId: row.serviceJob.storeId,
        actorUserId: row.actorUserId,
        record: {
          kind: "service_job",
          id: row.serviceJobId,
          orderId: row.serviceJob.commercialOrderId,
          label: row.serviceJob.commercialOrder.orderNumber,
        },
        outcome: [
          `Service work ${words(row.type)}`,
          row.toStatus ? `to ${words(row.toStatus)}` : null,
        ]
          .filter(Boolean)
          .join(" "),
        amount: null,
      })),
      total,
    ]
  },
  SERVICE_ASSIGNMENT: async (tx, scope, page) => {
    // Assigned-to records only; the job's current assignee is never history.
    const where: Prisma.ServiceWorkAssignmentWhereInput = {
      ...only(scope),
      serviceJob: {
        tenantId: scope.tenantId,
        ...(scope.storeIds ? { storeId: { in: scope.storeIds } } : {}),
      },
      ...(scope.subjectUserId ? { assignedUserId: scope.subjectUserId } : {}),
      assignedAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.serviceWorkAssignment.findMany({
        where: {
          AND: [
            where,
            afterWhere("SERVICE_ASSIGNMENT", page.after, "assignedAt"),
          ],
        },
        orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          serviceJobId: true,
          assignedUserId: true,
          assignedAt: true,
          endedAt: true,
          serviceJob: {
            select: {
              storeId: true,
              commercialOrderId: true,
              commercialOrder: { select: { orderNumber: true } },
            },
          },
        },
      }),
      tx.serviceWorkAssignment.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.assignedAt,
        storeId: row.serviceJob.storeId,
        actorUserId: row.assignedUserId,
        record: {
          kind: "service_job",
          id: row.serviceJobId,
          orderId: row.serviceJob.commercialOrderId,
          label: row.serviceJob.commercialOrder.orderNumber,
        },
        outcome: row.endedAt
          ? `Assigned service work · ended ${row.endedAt.toISOString()}`
          : "Assigned service work",
        amount: null,
      })),
      total,
    ]
  },
  PRICE_CHANGE: async (tx, scope, page) => {
    const where: Prisma.CatalogPriceChangeWhereInput = {
      ...only(scope),
      tenantId: scope.tenantId,
      ...(scope.subjectUserId ? { changedByUserId: scope.subjectUserId } : {}),
      ...(scope.catalogItemId
        ? { offering: { catalogItemId: scope.catalogItemId } }
        : {}),
      createdAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.catalogPriceChange.findMany({
        where: {
          AND: [where, afterWhere("PRICE_CHANGE", page.after, "createdAt")],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          offeringId: true,
          changedByUserId: true,
          createdAt: true,
          previousPriceMinor: true,
          priceMinor: true,
          currencyCode: true,
          reason: true,
          offering: { select: { name: true, catalogItemId: true } },
        },
      }),
      tx.catalogPriceChange.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.createdAt,
        storeId: null,
        actorUserId: row.changedByUserId,
        record: {
          kind: "product",
          id: row.offering.catalogItemId,
          offeringId: row.offeringId,
          label: row.offering.name,
        },
        outcome: [
          row.previousPriceMinor === null
            ? "Price set"
            : `Price changed from ${row.previousPriceMinor}`,
          `to ${row.priceMinor} (minor units)`,
          row.reason,
        ]
          .filter(Boolean)
          .join(" · "),
        amount: { minor: row.priceMinor, currencyCode: row.currencyCode },
      })),
      total,
    ]
  },
  FINANCE_POSTING: async (tx, scope, page) => {
    const where: Prisma.FinanceJournalEntryWhereInput = {
      ...only(scope),
      bookId: { in: scope.financeBookIds ?? [] },
      book: { tenantId: scope.tenantId },
      sourceKind: { in: [...financeActivitySourceKinds] },
      // Business-wide postings have no Store; a Store view leaves them out.
      ...(scope.storeIds ? { storeId: { in: scope.storeIds } } : {}),
      ...(scope.subjectUserId ? { actorUserId: scope.subjectUserId } : {}),
      recordedAt: scope.time,
    }
    const [rows, total] = await Promise.all([
      tx.financeJournalEntry.findMany({
        where: {
          AND: [where, afterWhere("FINANCE_POSTING", page.after, "recordedAt")],
        },
        orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
        take: page.take,
        select: {
          id: true,
          bookId: true,
          storeId: true,
          actorUserId: true,
          recordedAt: true,
          effectiveAt: true,
          sequence: true,
          sourceKind: true,
          description: true,
          reversalOfId: true,
        },
      }),
      tx.financeJournalEntry.count({ where }),
    ])
    return [
      rows.map((row) => ({
        id: row.id,
        at: row.recordedAt,
        storeId: row.storeId,
        actorUserId: row.actorUserId,
        record: {
          kind: "finance_entry",
          id: row.id,
          bookId: row.bookId,
          label: `Journal ${row.sequence.toString()}`,
        },
        outcome: [
          row.reversalOfId ? "Reversal" : null,
          `${words(row.sourceKind)} posted`,
          row.effectiveAt.getTime() !== row.recordedAt.getTime()
            ? `effective ${row.effectiveAt.toISOString()}`
            : null,
          row.description,
        ]
          .filter(Boolean)
          .join(" · "),
        amount: null,
      })),
      total,
    ]
  },
}

type Identity =
  | {
      coverage: "available" | "historical_profile"
      membershipId: string | null
      userId: string
      name: string
    }
  | {
      coverage: "unknown" | "unavailable"
      membershipId: null
      userId: null
      name: null
    }
const unknownActor = {
  coverage: "unknown" as const,
  membershipId: null,
  userId: null,
  name: null,
}
const hiddenActor = {
  coverage: "unavailable" as const,
  membershipId: null,
  userId: null,
  name: null,
}

/**
 * The page's authority path, shared by every read: current viewer role, Store
 * scope and existence, subject membership, tenant-wide and finance exclusions.
 */
async function authorizeActivity(
  tx: Prisma.TransactionClient,
  input: Omit<StaffActivityPageInput, "cursor" | "limit">,
  parsed: z.output<typeof staffActivityPageInput>,
) {
  const viewer = await tx.membership.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.viewerUserId,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    select: { role: true },
  })
  if (!viewer || !["OWNER", "ADMIN", "MANAGER"].includes(viewer.role))
    throw new StaffDirectoryError(
      "FORBIDDEN",
      "Owner, Admin or Manager access is required for staff activity.",
    )
  if (input.storeIds === null && !["OWNER", "ADMIN"].includes(viewer.role))
    throw new StaffDirectoryError(
      "FORBIDDEN",
      "Choose a Store you manage to read staff activity.",
    )
  if (
    parsed.storeId &&
    input.storeIds &&
    !input.storeIds.includes(parsed.storeId)
  )
    throw new StaffDirectoryError(
      "FORBIDDEN",
      "Staff activity is limited to Stores you can access.",
    )
  const stores = parsed.storeId
    ? [parsed.storeId]
    : input.storeIds
      ? [...input.storeIds]
      : undefined
  if (stores) {
    const found = await tx.store.count({
      where: { tenantId: input.tenantId, id: { in: stores } },
    })
    if (found !== new Set(stores).size)
      throw new StaffDirectoryError(
        "NOT_FOUND",
        "Store not found for this business.",
      )
  }
  const subject = parsed.membershipId
    ? await tx.membership.findFirst({
        where: { id: parsed.membershipId, tenantId: input.tenantId },
        select: { id: true, userId: true },
      })
    : null
  if (parsed.membershipId && !subject)
    throw new StaffDirectoryError(
      "NOT_FOUND",
      "Staff membership not found for this business.",
    )
  const requested = staffActivityStreams.filter(
    (stream) =>
      (!parsed.stream || parsed.stream === stream) &&
      (!parsed.relation || relationOf[stream] === parsed.relation),
  )
  // Tenant-wide records have no Store attribution and stay out of Store views.
  const excluded = stores ? requested.filter((s) => tenantWide.has(s)) : []
  // Finance postings need the caller's finance entitlement and Books.
  const financeHidden =
    requested.includes("FINANCE_POSTING") && !input.financeBookIds
  const streams = requested.filter(
    (stream) =>
      !excluded.includes(stream) &&
      (stream !== "FINANCE_POSTING" || !financeHidden),
  )
  const scope: Scope = {
    tenantId: input.tenantId,
    catalogItemId: parsed.catalogItemId,
    stockOperationType: parsed.stockOperationType,
    financeBookIds: input.financeBookIds
      ? [...input.financeBookIds]
      : undefined,
    subjectUserId: subject?.userId,
    storeIds: stores,
    time: { gte: new Date(parsed.from), lt: new Date(parsed.to) },
  }
  return { stores, requested, excluded, financeHidden, streams, scope }
}

/** Actor identities and Store names for projected events, never inferred. */
async function projectEvents(
  tx: Prisma.TransactionClient,
  tenantId: string,
  page: Array<Projected & { stream: StaffActivityStream }>,
) {
  const userIds = [...new Set(page.flatMap((event) => event.actorUserId ?? []))]
  const storeIds = [...new Set(page.flatMap((event) => event.storeId ?? []))]
  const [members, profiles, storeRows] = await Promise.all([
    userIds.length
      ? tx.membership.findMany({
          where: { tenantId: tenantId, userId: { in: userIds } },
          select: {
            id: true,
            userId: true,
            user: { select: { name: true, displayName: true } },
          },
        })
      : [],
    userIds.length
      ? tx.retailOpsStaffProfile.findMany({
          where: { tenantId: tenantId, userId: { in: userIds } },
          select: {
            userId: true,
            displayName: true,
            user: { select: { name: true } },
          },
        })
      : [],
    storeIds.length
      ? tx.store.findMany({
          where: { tenantId: tenantId, id: { in: storeIds } },
          select: { id: true, name: true },
        })
      : [],
  ])
  const identities = new Map<string, Identity>()
  for (const profile of profiles)
    identities.set(profile.userId, {
      coverage: "historical_profile",
      membershipId: null,
      userId: profile.userId,
      name: profile.displayName || profile.user.name,
    })
  for (const member of members)
    identities.set(member.userId, {
      coverage: "available",
      membershipId: member.id,
      userId: member.userId,
      name: member.user.displayName || member.user.name,
    })
  const storeNames = new Map<string, string>(
    storeRows.map((row: { id: string; name: string }): [string, string] => [
      row.id,
      row.name,
    ]),
  )
  const data = page.map((event) => ({
    id: event.id,
    at: event.at.toISOString(),
    stream: event.stream,
    relation: relationOf[event.stream],
    store: event.storeId
      ? { id: event.storeId, name: storeNames.get(event.storeId) ?? null }
      : null,
    // A missing historical actor is unknown; a user outside this business is hidden.
    actor: event.actorUserId
      ? (identities.get(event.actorUserId) ?? hiddenActor)
      : unknownActor,
    record: event.record,
    outcome: event.outcome,
    amount: event.amount,
  }))
  return data
}

/** Caller owns the transaction (RepeatableRead keeps page and counts consistent). */
export async function listStaffActivityPageInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffActivityPageInput,
) {
  const parsed = staffActivityPageInput.parse({
    membershipId: input.membershipId,
    storeId: input.storeId,
    stream: input.stream,
    relation: input.relation,
    catalogItemId: input.catalogItemId,
    stockOperationType: input.stockOperationType,
    from: input.from,
    to: input.to,
    cursor: input.cursor,
    limit: input.limit,
  })
  const { stores, requested, excluded, financeHidden, streams, scope } =
    await authorizeActivity(tx, input, parsed)
  const key = filterKey({
    tenantId: input.tenantId,
    storeIds: input.storeIds,
    financeBookIds: input.financeBookIds,
    filters: filters.parse(parsed),
  })
  const after = decodeCursor(parsed.cursor, key)
  const loaded = await Promise.all(
    streams.map(async (stream) => {
      const [rows, total] = await loaders[stream](tx, scope, {
        after,
        take: parsed.limit + 1,
      })
      return { stream, rows, total }
    }),
  )
  const events = loaded
    .flatMap(({ stream, rows }) => rows.map((row) => ({ ...row, stream })))
    .sort(
      (a, b) =>
        b.at.getTime() - a.at.getTime() ||
        (a.stream < b.stream ? -1 : a.stream > b.stream ? 1 : 0) ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    )
    .slice(0, parsed.limit + 1)
  const page = events.slice(0, parsed.limit)
  const data = await projectEvents(tx, input.tenantId, page)
  const last = page.at(-1)
  const byStream = Object.fromEntries(
    loaded.map(({ stream, total }) => [stream, total]),
  ) as Partial<Record<StaffActivityStream, number>>
  return {
    data,
    total: loaded.reduce((sum, item) => sum + item.total, 0),
    byStream,
    nextCursor:
      events.length > parsed.limit && last
        ? Buffer.from(
            JSON.stringify({
              at: last.at.toISOString(),
              id: last.id,
              stream: last.stream,
              filterKey: key,
            }),
          ).toString("base64url")
        : null,
    asOf: new Date().toISOString(),
    period: { from: parsed.from, to: parsed.to },
    scope: stores ? ("stores" as const) : ("business" as const),
    coverage: {
      streams: streams,
      excluded: [
        ...excluded.map((stream) => ({
          stream,
          reason: "not_store_attributed" as const,
        })),
        ...(stores && streams.includes("FINANCE_POSTING")
          ? [
              {
                stream: "FINANCE_POSTING" as const,
                reason: "business_wide_postings_hidden" as const,
              },
            ]
          : []),
      ],
      unknownActors: data.some((event) => event.actor.coverage === "unknown"),
      notIncluded: [
        ...(financeHidden || !requested.includes("FINANCE_POSTING")
          ? (["finance_actions"] as const)
          : []),
        "sign_in_and_device_activity" as const,
        "attendance_and_payroll" as const,
      ],
      detail:
        "Only canonical records with a recorded actor, approver or assignment are shown. Records written before attribution existed show an unknown actor and never count toward a person. Counts cover every matching record; amounts are per record and are not totals. Finance postings that mirror sales, stock or service work are shown under those activities, not again as finance.",
    },
  }
}

export async function listStaffActivityPage(
  db: PrismaClient,
  input: StaffActivityPageInput,
) {
  return db.$transaction(
    (tx) => listStaffActivityPageInTransaction(tx, input),
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}

export const staffActivityShownInput = z
  .array(z.object({ stream: z.enum(staffActivityStreams), id }).strict())
  .min(1)
  .max(10)
/** Procedure input: the answer's filters plus the exact identities it showed. */
export const staffActivityShownRequest = filters
  .extend({ events: staffActivityShownInput })
  .strict()
export type StaffActivityShownInput = Omit<
  StaffActivityPageInput,
  "cursor" | "limit"
> & { events: z.input<typeof staffActivityShownInput> }

/**
 * Re-reads exactly the events an answer showed, under the viewer's current
 * authority and the answer's filters. Never substitutes other records: an
 * identity that is gone or no longer readable is returned as withheld.
 */
export async function readStaffActivityShownInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffActivityShownInput,
) {
  const events = staffActivityShownInput.parse(input.events)
  const parsed = staffActivityPageInput.parse({
    membershipId: input.membershipId,
    storeId: input.storeId,
    stream: input.stream,
    relation: input.relation,
    catalogItemId: input.catalogItemId,
    stockOperationType: input.stockOperationType,
    from: input.from,
    to: input.to,
    limit: events.length,
  })
  const { streams, scope } = await authorizeActivity(tx, input, parsed)
  const wanted = new Map<StaffActivityStream, string[]>()
  for (const event of events)
    if (streams.includes(event.stream))
      wanted.set(event.stream, [...(wanted.get(event.stream) ?? []), event.id])
  const loaded = await Promise.all(
    [...wanted].map(async ([stream, ids]) => {
      const [rows] = await loaders[stream](
        tx,
        { ...scope, ids },
        { take: ids.length },
      )
      return rows.map((row) => ({ ...row, stream }))
    }),
  )
  const found = new Map(
    loaded.flat().map((row) => [`${row.stream}:${row.id}`, row]),
  )
  // Keep the answer's order; never append records it did not show.
  const ordered = events.flatMap((event) => {
    const row = found.get(`${event.stream}:${event.id}`)
    return row ? [row] : []
  })
  return {
    data: await projectEvents(tx, input.tenantId, ordered),
    withheld: events.filter(
      (event) => !found.has(`${event.stream}:${event.id}`),
    ),
    asOf: new Date().toISOString(),
  }
}

export async function readStaffActivityShown(
  db: PrismaClient,
  input: StaffActivityShownInput,
) {
  return db.$transaction(
    (tx) => readStaffActivityShownInTransaction(tx, input),
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
