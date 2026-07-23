import { createHash, randomUUID } from "node:crypto"

import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CatalogRecordStatus,
  InventoryUnitStockBehavior,
  OfferingPricingPolicy,
  OrderStatus,
  PaymentStatus,
  ProductReturnDisposition,
  SellableOfferingKind,
  ServiceJobLineStatus,
  ServicePriority,
  ServiceWorkEventType,
  ServiceWorkPolicy,
  StockBalanceKind,
  StockOperationType,
  WorkAuthorizationPolicy,
  WorkAuthorizationStatus,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import {
  commitCatalogStockReservationInTransaction,
  reserveCatalogOfferingStockInTransaction,
} from "./catalog-inventory"
import { effectiveCommercialAmountPaid } from "./commercial-payments"

export type CreateCommercialOrderInput = {
  actorUserId: string
  clientOrderId: string
  customerEmail?: string
  customerName?: string
  customerPhone?: string
  createTrackedServiceWork?: boolean
  discountMinor?: number
  lines: Array<{
    approvedQuotePriceMinor?: number
    expectedBalanceRevision?: number
    expectedConfigurationVersionId?: string
    expectedFixedPriceMinor?: number
    offeringId: string
    quantity: string
    trustedUnitPriceMinor?: number
  }>
  notes?: string
  schemaVersion: number
  serviceChargeMinor?: number
  storeId: string
  taxMinor?: number
  tenantId: string
}

const orderGraph = {
  lines: {
    include: {
      productFulfillments: true,
      productReturns: true,
      snapshot: true,
      stockReservation: true,
    },
    orderBy: { createdAt: "asc" },
  },
  payments: { orderBy: { recordedAt: "asc" } },
} satisfies Prisma.CommercialOrderInclude

type OrderGraph = Prisma.CommercialOrderGetPayload<{
  include: typeof orderGraph
}>

function stableJson(value: unknown): string {
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function payloadHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function assertSchemaVersion(schemaVersion: number) {
  if (schemaVersion !== 1) {
    throw new CatalogError(
      "INVALID_ORDER",
      "CLIENT_SCHEMA_UNSUPPORTED: Commercial Orders require schema version 1.",
    )
  }
}

function assertMoney(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000) {
    throw new CatalogError(
      "INVALID_ORDER",
      `${label} must be a non-negative minor-unit amount.`,
    )
  }
}

function exactLineTotal(unitPriceMinor: number, quantity: string) {
  const total = multiplyExactDecimals(String(unitPriceMinor), quantity)
  if (!/^\d+$/.test(total)) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Line total must resolve to a whole minor currency unit.",
    )
  }
  const value = Number(total)
  assertMoney(value, "Line total")
  return value
}

function serializeOrder(order: OrderGraph) {
  const amountPaidMinor = effectiveCommercialAmountPaid({
    amountPaidMinor: order.amountPaidMinor,
    paymentCount: order.payments.length,
    paymentStatus: order.paymentStatus,
    totalMinor: order.totalMinor,
  })
  return {
    amountPaidMinor,
    balanceDueMinor: Math.max(0, order.totalMinor - amountPaidMinor),
    clientOrderId: order.clientOrderId,
    createdAt: order.createdAt,
    currencyCode: order.currencyCode,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    discountMinor: order.discountMinor,
    id: order.id,
    lines: order.lines.map((line) => ({
      discountMinor: line.discountMinor,
      id: line.id,
      kind:
        line.kind === SellableOfferingKind.PRODUCT_UNIT
          ? ("product" as const)
          : ("service" as const),
      offeringId: line.offeringId,
      productFulfillments: line.productFulfillments.map((fulfillment) => ({
        id: fulfillment.id,
        quantity: fulfillment.quantity.toString(),
        stockOperationId: fulfillment.stockOperationId,
      })),
      productReturns: line.productReturns.map((productReturn) => ({
        disposition: productReturn.disposition,
        id: productReturn.id,
        quantity: productReturn.quantity.toString(),
        stockOperationId: productReturn.stockOperationId,
      })),
      quantity: line.quantity.toString(),
      reservation: line.stockReservation
        ? {
            balanceSourceId: line.stockReservation.balanceSourceId,
            id: line.stockReservation.id,
            status: line.stockReservation.status,
          }
        : null,
      snapshot: line.snapshot
        ? {
            balanceSourceId: line.snapshot.balanceSourceId,
            catalogItemName: line.snapshot.catalogItemName,
            configurationVersionId: line.snapshot.configurationVersionId,
            currencyCode: line.snapshot.currencyCode,
            inventoryUnitId: line.snapshot.inventoryUnitId,
            inventoryUnitName: line.snapshot.inventoryUnitName,
            transactionScale: line.snapshot.transactionScale,
            sku: line.snapshot.sku,
            barcode: line.snapshot.barcode,
            offeringKind:
              line.snapshot.offeringKind === SellableOfferingKind.PRODUCT_UNIT
                ? ("product" as const)
                : ("service" as const),
            offeringName: line.snapshot.offeringName,
            optionSelections: line.snapshot.optionSelections,
            pricingPolicy:
              line.snapshot.pricingPolicy === OfferingPricingPolicy.FIXED
                ? ("fixed" as const)
                : ("quote_required" as const),
            stockBehavior: line.snapshot.stockBehavior,
            unitFactor: line.snapshot.unitFactor?.toString() ?? null,
            variantName: line.snapshot.variantName,
          }
        : null,
      taxMinor: line.taxMinor,
      totalMinor: line.totalMinor,
      unitPriceMinor: line.unitPriceMinor,
    })),
    notes: order.notes,
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    payments: order.payments.map((payment) => ({
      amountMinor: payment.amountMinor,
      id: payment.id,
      method: payment.method,
      note: payment.note,
      recordedAt: payment.recordedAt,
      reference: payment.reference,
      type: payment.type,
    })),
    serviceChargeMinor: order.serviceChargeMinor,
    status: order.status,
    storeId: order.storeId,
    subtotalMinor: order.subtotalMinor,
    taxMinor: order.taxMinor,
    totalMinor: order.totalMinor,
  }
}

export async function createCommercialOrderInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateCommercialOrderInput,
) {
  assertSchemaVersion(input.schemaVersion)
  if (input.lines.length === 0) {
    throw new CatalogError(
      "INVALID_ORDER",
      "A Commercial Order requires at least one line.",
    )
  }
  const hash = payloadHash(input)

  const previous = await tx.commercialOrder.findUnique({
    include: orderGraph,
    where: {
      tenantId_clientOrderId: {
        clientOrderId: input.clientOrderId,
        tenantId: input.tenantId,
      },
    },
  })
  if (previous) {
    if (previous.payloadHash !== hash) {
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This Commercial Order identity was already used with different input.",
      )
    }
    return serializeOrder(previous)
  }

  const store = await tx.store.findFirst({
    where: { id: input.storeId, tenantId: input.tenantId },
    select: { currencyCode: true, id: true },
  })
  if (!store) {
    throw new CatalogError(
      "STORE_NOT_FOUND",
      "Store not found for this business.",
    )
  }

  const resolvedLines: Array<{
    input: CreateCommercialOrderInput["lines"][number]
    offering: Awaited<ReturnType<typeof tx.sellableOffering.findFirst>> & {
      catalogItem: { id: string; name: string }
      productUnitOffering: null | {
        inventoryUnit: {
          configurationVersionId: string
          factor: Prisma.Decimal
          id: string
          name: string
          stockBehavior: InventoryUnitStockBehavior
          transactionScale: number
        }
        barcode: string | null
        sku: string | null
      }
      serviceOffering: null | { quantityScale: number }
      storeAvailability: Array<{ isAvailable: boolean }>
      variant: {
        id: string
        name: string
        selections: Array<{
          group: { key: string; name: string }
          value: { key: string; label: string }
        }>
      }
    }
    quantity: string
    totalMinor: number
    unitPriceMinor: number
  }> = []

  for (const lineInput of input.lines) {
    const offering = await tx.sellableOffering.findFirst({
      include: {
        catalogItem: { select: { id: true, name: true } },
        productUnitOffering: { include: { inventoryUnit: true } },
        serviceOffering: true,
        storeAvailability: { where: { storeId: store.id } },
        variant: {
          include: {
            selections: { include: { group: true, value: true } },
          },
        },
      },
      where: {
        id: lineInput.offeringId,
        status: CatalogRecordStatus.ACTIVE,
        tenantId: input.tenantId,
      },
    })
    if (!offering || !offering.storeAvailability[0]?.isAvailable) {
      throw new CatalogError(
        "OFFERING_UNAVAILABLE",
        "An Order line selected an unavailable Offering.",
      )
    }

    let unitPriceMinor: number
    if (lineInput.trustedUnitPriceMinor !== undefined) {
      assertMoney(lineInput.trustedUnitPriceMinor, "Trusted snapshot price")
      unitPriceMinor = lineInput.trustedUnitPriceMinor
    } else if (offering.pricingPolicy === OfferingPricingPolicy.FIXED) {
      if (offering.fixedPriceMinor === null) {
        throw new CatalogError(
          "INVALID_ORDER",
          "Fixed-price Offering has no current price.",
        )
      }
      if (
        lineInput.expectedFixedPriceMinor !== undefined &&
        lineInput.expectedFixedPriceMinor !== offering.fixedPriceMinor
      ) {
        throw new CatalogError(
          "OFFERING_UNAVAILABLE",
          "The Offering price changed before Order confirmation.",
        )
      }
      unitPriceMinor = offering.fixedPriceMinor
    } else {
      if (
        offering.kind !== SellableOfferingKind.SERVICE ||
        lineInput.approvedQuotePriceMinor === undefined
      ) {
        throw new CatalogError(
          "INVALID_ORDER",
          "Quote-required Service Offering needs an approved price.",
        )
      }
      assertMoney(lineInput.approvedQuotePriceMinor, "Approved quote")
      unitPriceMinor = lineInput.approvedQuotePriceMinor
    }

    const quantity = parseExactDecimal(lineInput.quantity, {
      allowZero: false,
      maxScale:
        offering.kind === SellableOfferingKind.SERVICE
          ? (offering.serviceOffering?.quantityScale ?? 0)
          : 6,
    })
    resolvedLines.push({
      input: lineInput,
      offering,
      quantity,
      totalMinor: exactLineTotal(unitPriceMinor, quantity),
      unitPriceMinor,
    })
  }

  const subtotalMinor = resolvedLines.reduce(
    (total, line) => total + line.totalMinor,
    0,
  )
  const discountMinor = input.discountMinor ?? 0
  const serviceChargeMinor = input.serviceChargeMinor ?? 0
  const taxMinor = input.taxMinor ?? 0
  assertMoney(subtotalMinor, "Subtotal")
  assertMoney(discountMinor, "Discount")
  assertMoney(serviceChargeMinor, "Service charge")
  assertMoney(taxMinor, "Tax")
  const totalMinor =
    subtotalMinor + serviceChargeMinor - discountMinor + taxMinor
  if (totalMinor < 0) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Order discount cannot exceed subtotal plus tax.",
    )
  }

  const order = await tx.commercialOrder.create({
    data: {
      clientOrderId: input.clientOrderId,
      createdByUserId: input.actorUserId,
      currencyCode: store.currencyCode,
      customerEmail: input.customerEmail?.trim() || null,
      customerName: input.customerName?.trim() || null,
      customerPhone: input.customerPhone?.trim() || null,
      discountMinor,
      notes: input.notes?.trim() || null,
      orderNumber: `EO-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      payloadHash: hash,
      schemaVersion: input.schemaVersion,
      serviceChargeMinor,
      status: OrderStatus.CONFIRMED,
      storeId: store.id,
      subtotalMinor,
      taxMinor,
      tenantId: input.tenantId,
      totalMinor,
    },
  })

  for (const [index, resolved] of resolvedLines.entries()) {
    const line = await tx.commercialOrderLine.create({
      data: {
        kind: resolved.offering.kind,
        offeringId: resolved.offering.id,
        orderId: order.id,
        quantity: resolved.quantity,
        totalMinor: resolved.totalMinor,
        unitPriceMinor: resolved.unitPriceMinor,
      },
    })

    let reservation:
      | Awaited<ReturnType<typeof reserveCatalogOfferingStockInTransaction>>
      | undefined
    if (resolved.offering.kind === SellableOfferingKind.PRODUCT_UNIT) {
      if (
        !resolved.input.expectedConfigurationVersionId ||
        !resolved.offering.productUnitOffering
      ) {
        throw new CatalogError(
          "STALE_CONFIGURATION",
          "Product Order lines require the expected Current unit configuration.",
        )
      }
      reservation = await reserveCatalogOfferingStockInTransaction(tx, {
        clientReservationId: `${input.clientOrderId}:line:${index + 1}`,
        commercialOrderLineId: line.id,
        enteredQuantity: resolved.quantity,
        expectedBalanceRevision: resolved.input.expectedBalanceRevision,
        expectedConfigurationVersionId:
          resolved.input.expectedConfigurationVersionId,
        offeringId: resolved.offering.id,
        schemaVersion: input.schemaVersion,
        storeId: store.id,
        tenantId: input.tenantId,
      })
    }

    const productUnit = resolved.offering.productUnitOffering?.inventoryUnit
    await tx.offeringSnapshot.create({
      data: {
        balanceSourceId: reservation?.balanceSourceId,
        catalogItemId: resolved.offering.catalogItem.id,
        catalogItemName: resolved.offering.catalogItem.name,
        configurationVersionId: reservation?.configurationVersionId,
        currencyCode: resolved.offering.currencyCode,
        inventoryUnitId: productUnit?.id,
        inventoryUnitName: productUnit?.name,
        transactionScale: productUnit?.transactionScale,
        sku: resolved.offering.productUnitOffering?.sku,
        barcode: resolved.offering.productUnitOffering?.barcode,
        offeringId: resolved.offering.id,
        offeringKind: resolved.offering.kind,
        offeringName: resolved.offering.name,
        optionSelections: resolved.offering.variant.selections.map(
          (selection) => ({
            groupKey: selection.group.key,
            groupName: selection.group.name,
            valueKey: selection.value.key,
            valueLabel: selection.value.label,
          }),
        ),
        orderLineId: line.id,
        pricingPolicy: resolved.offering.pricingPolicy,
        quantity: resolved.quantity,
        stockBehavior: productUnit?.stockBehavior,
        totalMinor: resolved.totalMinor,
        unitFactor: productUnit?.factor,
        unitPriceMinor: resolved.unitPriceMinor,
        variantId: resolved.offering.variant.id,
        variantName: resolved.offering.variant.name,
      },
    })
  }

  if (input.createTrackedServiceWork !== false) {
    const trackedLines = await tx.commercialOrderLine.findMany({
      include: {
        offering: { include: { serviceOffering: true } },
        snapshot: true,
      },
      where: {
        orderId: order.id,
        offering: {
          serviceOffering: { workPolicy: ServiceWorkPolicy.TRACKED },
        },
      },
    })
    if (trackedLines.length > 0) {
      const job = await tx.serviceJob.create({
        data: {
          clientJobId: `${input.clientOrderId}:job:1`,
          commercialOrderId: order.id,
          createdByUserId: input.actorUserId,
          priority: ServicePriority.NORMAL,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      for (const orderLine of trackedLines) {
        const policy = orderLine.offering.serviceOffering!.authorizationPolicy
        const authorizationStatus =
          policy === WorkAuthorizationPolicy.ON_ORDER_CONFIRMATION
            ? WorkAuthorizationStatus.AUTHORIZED
            : policy === WorkAuthorizationPolicy.AFTER_REQUIRED_PAYMENT
              ? WorkAuthorizationStatus.PENDING_PAYMENT
              : WorkAuthorizationStatus.PENDING_RELEASE
        const workLine = await tx.serviceJobLine.create({
          data: {
            allocatedQuantity: orderLine.quantity,
            allocationSnapshot: JSON.parse(
              JSON.stringify(orderLine.snapshot),
            ) as Prisma.InputJsonValue,
            authorizationPolicy: policy,
            authorizationSource:
              authorizationStatus === WorkAuthorizationStatus.AUTHORIZED
                ? "order_confirmation"
                : null,
            authorizationStatus,
            authorizedAt:
              authorizationStatus === WorkAuthorizationStatus.AUTHORIZED
                ? new Date()
                : null,
            commercialOrderLineId: orderLine.id,
            serviceJobId: job.id,
            status: ServiceJobLineStatus.QUEUED,
          },
        })
        await tx.serviceWorkEvent.create({
          data: {
            actorUserId: input.actorUserId,
            serviceJobId: job.id,
            serviceJobLineId: workLine.id,
            source: "commercial_order",
            tenantId: input.tenantId,
            type: ServiceWorkEventType.CREATED,
          },
        })
      }
    }
  }

  const created = await tx.commercialOrder.findUniqueOrThrow({
    include: orderGraph,
    where: { id: order.id },
  })
  return serializeOrder(created)
}

export async function createCommercialOrder(
  db: PrismaClient,
  input: CreateCommercialOrderInput,
) {
  return db.$transaction((tx) => createCommercialOrderInTransaction(tx, input))
}

export async function getCommercialOrder(
  db: PrismaClient,
  input: { orderId: string; tenantId: string },
) {
  const order = await db.commercialOrder.findFirst({
    include: orderGraph,
    where: { id: input.orderId, tenantId: input.tenantId },
  })
  return order ? serializeOrder(order) : null
}

export async function listCommercialOrders(
  db: PrismaClient,
  input: { limit?: number; storeId?: string; tenantId: string },
) {
  const orders = await db.commercialOrder.findMany({
    include: orderGraph,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 50, 1), 100),
    where: { storeId: input.storeId, tenantId: input.tenantId },
  })
  return orders.map(serializeOrder)
}

export async function countCommercialOrderCustomers(
  db: PrismaClient,
  input: { storeId?: string; tenantId: string },
) {
  const storeFilter = input.storeId
    ? Prisma.sql`AND "storeId" = ${input.storeId}`
    : Prisma.empty
  const rows = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(DISTINCT COALESCE(
      CASE WHEN BTRIM("customerEmail") <> ''
        THEN 'email:' || LOWER(BTRIM("customerEmail")) END,
      CASE WHEN REGEXP_REPLACE(COALESCE("customerPhone", ''), '[^0-9+]', '', 'g') <> ''
        THEN 'phone:' || REGEXP_REPLACE("customerPhone", '[^0-9+]', '', 'g') END,
      CASE WHEN BTRIM("customerName") <> ''
        THEN 'name:' || LOWER(BTRIM("customerName")) END
    ))::bigint AS count
    FROM "CommercialOrder"
    WHERE "tenantId" = ${input.tenantId}
    ${storeFilter}
  `)

  return Number(rows[0]?.count ?? 0)
}

export async function listCommercialOrdersPage(
  db: PrismaClient,
  input: {
    createdAfter?: Date
    cursor?: string
    limit?: number
    query?: string
    queryMode?: "all" | "customer"
    statuses?: OrderStatus[]
    storeId?: string
    tenantId: string
  },
) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const normalizedQuery = input.query?.trim()
  const baseWhere: Prisma.CommercialOrderWhereInput = {
    createdAt: input.createdAfter ? { gte: input.createdAfter } : undefined,
    status: input.statuses?.length ? { in: input.statuses } : undefined,
    storeId: input.storeId,
    tenantId: input.tenantId,
  }
  const where: Prisma.CommercialOrderWhereInput = normalizedQuery
    ? {
        ...baseWhere,
        OR: [
          ...(input.queryMode === "customer"
            ? []
            : [
                {
                  orderNumber: {
                    contains: normalizedQuery,
                    mode: "insensitive" as const,
                  },
                },
              ]),
          { customerName: { contains: normalizedQuery, mode: "insensitive" } },
          {
            customerPhone: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            customerEmail: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          ...(input.queryMode === "customer"
            ? []
            : [
                {
                  lines: {
                    some: {
                      snapshot: {
                        is: {
                          catalogItemName: {
                            contains: normalizedQuery,
                            mode: "insensitive" as const,
                          },
                        },
                      },
                    },
                  },
                },
              ]),
        ],
      }
    : baseWhere
  const [records, totalCount] = await Promise.all([
    db.commercialOrder.findMany({
      cursor: input.cursor ? { id: input.cursor } : undefined,
      include: orderGraph,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: input.cursor ? 1 : 0,
      take: limit + 1,
      where,
    }),
    db.commercialOrder.count({ where: baseWhere }),
  ])
  const hasNextPage = records.length > limit
  const pageRecords = hasNextPage ? records.slice(0, limit) : records

  return {
    items: pageRecords.map(serializeOrder),
    nextCursor: hasNextPage ? pageRecords.at(-1)?.id : undefined,
    totalCount,
  }
}

export async function fulfillCommercialOrderProductLine(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    orderLineId: string
    reason?: string
    schemaVersion: number
    tenantId: string
  },
) {
  assertSchemaVersion(input.schemaVersion)
  return db.$transaction(async (tx) => {
    const line = await tx.commercialOrderLine.findFirst({
      include: { order: true, stockReservation: true },
      where: {
        id: input.orderLineId,
        kind: SellableOfferingKind.PRODUCT_UNIT,
        order: { tenantId: input.tenantId },
      },
    })
    if (!line?.stockReservation) {
      throw new CatalogError(
        "ORDER_NOT_FOUND",
        "Reserved Product Order line not found.",
      )
    }
    const operation = await commitCatalogStockReservationInTransaction(tx, {
      actorUserId: input.actorUserId,
      clientOperationId: input.clientOperationId,
      operationType: "sale_fulfillment",
      reason: input.reason,
      reservationId: line.stockReservation.id,
      schemaVersion: input.schemaVersion,
      source: "commercial_order",
      tenantId: input.tenantId,
    })
    const fulfillment = await tx.productFulfillment.upsert({
      create: {
        orderLineId: line.id,
        quantity: line.quantity,
        reservationId: line.stockReservation.id,
        stockOperationId: operation.id,
      },
      update: {},
      where: {
        orderLineId_reservationId: {
          orderLineId: line.id,
          reservationId: line.stockReservation.id,
        },
      },
    })
    await tx.commercialOrder.update({
      data: { status: OrderStatus.FULFILLING },
      where: { id: line.orderId },
    })
    return {
      id: fulfillment.id,
      quantity: fulfillment.quantity.toString(),
      stockOperationId: fulfillment.stockOperationId,
    }
  })
}

export async function returnCommercialOrderProductLine(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientReturnId: string
    destinationBalanceSourceId?: string
    disposition: "damaged" | "no_restock" | "quarantine" | "restock"
    orderLineId: string
    quantity: string
    reason: string
    schemaVersion: number
    tenantId: string
  },
) {
  assertSchemaVersion(input.schemaVersion)
  const hash = payloadHash(input)
  return db.$transaction(async (tx) => {
    const previous = await tx.productReturn.findUnique({
      where: {
        tenantId_clientReturnId: {
          clientReturnId: input.clientReturnId,
          tenantId: input.tenantId,
        },
      },
    })
    if (previous) {
      if (previous.payloadHash !== hash) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This Product Return identity was already used with different input.",
        )
      }
      return previous
    }

    const line = await tx.commercialOrderLine.findFirst({
      include: {
        order: true,
        productFulfillments: true,
        productReturns: true,
        snapshot: { include: { inventoryUnit: true } },
      },
      where: {
        id: input.orderLineId,
        kind: SellableOfferingKind.PRODUCT_UNIT,
        order: { tenantId: input.tenantId },
      },
    })
    if (!line?.snapshot || line.productFulfillments.length === 0) {
      throw new CatalogError(
        "ORDER_NOT_FOUND",
        "Fulfilled Product Order line not found.",
      )
    }
    const quantity = parseExactDecimal(input.quantity, {
      allowZero: false,
      maxScale: 6,
    })
    const fulfilledQuantity = line.productFulfillments.reduce(
      (total, fulfillment) =>
        addExactDecimals(total, fulfillment.quantity.toString()),
      "0",
    )
    const returnedQuantity = line.productReturns.reduce(
      (total, productReturn) =>
        addExactDecimals(total, productReturn.quantity.toString()),
      "0",
    )
    if (
      compareExactDecimals(
        addExactDecimals(returnedQuantity, quantity),
        fulfilledQuantity,
      ) > 0
    ) {
      throw new CatalogError(
        "INVALID_ORDER",
        "Return quantity exceeds fulfilled quantity not already returned.",
      )
    }

    const disposition =
      input.disposition === "restock"
        ? ProductReturnDisposition.RESTOCK
        : input.disposition === "quarantine"
          ? ProductReturnDisposition.QUARANTINE
          : input.disposition === "damaged"
            ? ProductReturnDisposition.DAMAGED
            : ProductReturnDisposition.NO_RESTOCK
    let destinationBalanceSourceId: string | null = null
    let stockOperationId: string | null = null

    if (disposition === ProductReturnDisposition.RESTOCK) {
      destinationBalanceSourceId =
        input.destinationBalanceSourceId ?? line.snapshot.balanceSourceId
      if (!destinationBalanceSourceId || !line.snapshot.unitFactor) {
        throw new CatalogError(
          "INVALID_ORDER",
          "Restock disposition requires the original or an explicit compatible Balance Source.",
        )
      }
      const balance = await tx.stockBalanceSource.findFirst({
        include: { inventoryUnit: true },
        where: {
          id: destinationBalanceSourceId,
          storeId: line.order.storeId,
          tenantId: input.tenantId,
        },
      })
      const isOriginalBalance = balance?.id === line.snapshot.balanceSourceId
      const isCompatiblePackagedDestination =
        balance?.kind === StockBalanceKind.PACKAGED_STOCK &&
        balance.inventoryUnitId === line.snapshot.inventoryUnitId
      if (
        !balance ||
        (!isOriginalBalance && !isCompatiblePackagedDestination)
      ) {
        throw new CatalogError(
          "INVALID_ORDER",
          "Return destination must preserve the original Inventory Unit meaning.",
        )
      }
      const canonicalQuantity = multiplyExactDecimals(
        quantity,
        line.snapshot.unitFactor.toString(),
      )
      const balanceQuantity =
        balance.kind === StockBalanceKind.SHARED_POOL
          ? canonicalQuantity
          : quantity
      const resultingOnHand = addExactDecimals(
        balance.onHandQuantity.toString(),
        balanceQuantity,
      )
      const update = await tx.stockBalanceSource.updateMany({
        data: { onHandQuantity: resultingOnHand, revision: { increment: 1 } },
        where: { id: balance.id, revision: balance.revision },
      })
      if (update.count !== 1) {
        throw new CatalogError(
          "REVISION_CONFLICT",
          "The return Balance Source changed while posting.",
        )
      }
      const operation = await tx.stockOperation.create({
        data: {
          actorUserId: input.actorUserId,
          clientOperationId: `${input.clientReturnId}:stock`,
          payloadHash: hash,
          reason: input.reason.trim(),
          source: "commercial_order_return",
          storeId: line.order.storeId,
          tenantId: input.tenantId,
          type: StockOperationType.RETURN,
        },
      })
      stockOperationId = operation.id
      await tx.stockMovement.create({
        data: {
          balanceSourceId: balance.id,
          configurationVersionId:
            line.snapshot.configurationVersionId ??
            balance.inventoryUnit.configurationVersionId,
          enteredInventoryUnitId:
            line.snapshot.inventoryUnitId ?? balance.inventoryUnitId,
          enteredQuantity: quantity,
          operationId: operation.id,
          previousOnHandQuantity: balance.onHandQuantity,
          resultingOnHandQuantity: resultingOnHand,
          signedCanonicalEffect: canonicalQuantity,
          transactionScaleSnapshot:
            line.snapshot.transactionScale ??
            line.snapshot.inventoryUnit?.transactionScale ??
            balance.inventoryUnit.transactionScale,
          unitFactorSnapshot: line.snapshot.unitFactor,
        },
      })
    }

    return tx.productReturn.create({
      data: {
        actorUserId: input.actorUserId,
        clientReturnId: input.clientReturnId,
        destinationBalanceSourceId,
        disposition,
        orderId: line.orderId,
        orderLineId: line.id,
        payloadHash: hash,
        quantity,
        reason: input.reason.trim(),
        schemaVersion: input.schemaVersion,
        stockOperationId,
        storeId: line.order.storeId,
        tenantId: input.tenantId,
      },
    })
  })
}
