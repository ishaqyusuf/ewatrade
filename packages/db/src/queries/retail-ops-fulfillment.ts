import type {
  DeliveryRequestStatus,
  Prisma,
  PrismaClient,
} from "../../generated/prisma/client"

type JsonRecord = Record<string, unknown>

export type RetailOpsDeliveryRequestStatus =
  | "assigned"
  | "cancelled"
  | "delivered"
  | "draft"
  | "open"
  | "picked_up"

export type RetailOpsDeliveryRequestStatusFilter =
  | "all"
  | RetailOpsDeliveryRequestStatus

export type RetailOpsDeliveryRequestStatusUpdate =
  | "assigned"
  | "cancelled"
  | "delivered"
  | "picked_up"

export type RetailOpsDeliveryRequest = {
  assignedAt: Date | null
  assignment: {
    assignedDriverName: string | null
    assignedDriverPhone: string | null
    dispatchTenantId: string
    id: string
    providerName: string | null
    status: string
  } | null
  bidCount: number
  completedAt: Date | null
  createdAt: Date
  customer: {
    email: string | null
    name: string | null
    phone: string | null
  }
  dropoff: {
    address: string
    name: string
    phone: string | null
  }
  id: string
  notes: string | null
  order: {
    currencyCode: string
    id: string
    orderNumber: string
    paymentStatus: string
    status: string
    totalMinor: number
  }
  pickup: {
    address: string
    name: string
    phone: string | null
  }
  requestedAt: Date
  shareLink: {
    createdByUserId: string | null
    id: string | null
    token: string | null
  }
  source: "durable" | "metadata"
  status: RetailOpsDeliveryRequestStatus
  trackingEventCount: number
  updatedAt: Date
}

export type ListRetailOpsDeliveryRequestsInput = {
  actorUserId: string
  canManageAllRequests: boolean
  from?: Date
  limit?: number
  status?: RetailOpsDeliveryRequestStatusFilter
  storeId: string
  tenantId: string
  to?: Date
}

export type CreateRetailOpsDeliveryRequestInput = {
  actorUserId: string
  canManageAllRequests: boolean
  dropoffAddress: string
  dropoffName: string
  dropoffPhone?: string
  notes?: string
  orderId: string
  pickupAddress: string
  pickupName: string
  pickupPhone?: string
  requestedAt?: Date
  storeId: string
  tenantId: string
}

export type UpdateRetailOpsDeliveryRequestStatusInput = {
  actorUserId: string
  assignedDriverName?: string
  assignedDriverPhone?: string
  canManageAllRequests: boolean
  deliveryRequestId: string
  happenedAt?: Date
  note?: string
  status: RetailOpsDeliveryRequestStatusUpdate
  storeId: string
  tenantId: string
}

export type RetailOpsFulfillmentErrorCode =
  | "DELIVERY_REQUEST_NOT_FOUND"
  | "DELIVERY_REQUEST_UNAVAILABLE"
  | "ORDER_NOT_DELIVERY_ELIGIBLE"
  | "ORDER_NOT_FOUND"
  | "ORDER_REQUEST_FORBIDDEN"

export class RetailOpsFulfillmentError extends Error {
  code: RetailOpsFulfillmentErrorCode

  constructor(code: RetailOpsFulfillmentErrorCode, message: string) {
    super(message)
    this.name = "RetailOpsFulfillmentError"
    this.code = code
  }
}

const deliveryRequestSelect = {
  _count: {
    select: {
      bids: true,
      trackingEvents: true,
    },
  },
  assignedAt: true,
  assignment: {
    select: {
      assignedDriverName: true,
      assignedDriverPhone: true,
      dispatchTenantId: true,
      id: true,
      providerProfile: {
        select: {
          displayName: true,
        },
      },
      status: true,
    },
  },
  completedAt: true,
  createdAt: true,
  dropoffAddress: true,
  dropoffName: true,
  dropoffPhone: true,
  id: true,
  notes: true,
  order: {
    select: {
      createdAt: true,
      currencyCode: true,
      customerEmail: true,
      customerName: true,
      customerPhone: true,
      id: true,
      metadata: true,
      orderNumber: true,
      paymentStatus: true,
      status: true,
      totalMinor: true,
      updatedAt: true,
    },
  },
  orderId: true,
  pickupAddress: true,
  pickupName: true,
  pickupPhone: true,
  requestedAt: true,
  status: true,
  tenantId: true,
  updatedAt: true,
} satisfies Prisma.DeliveryRequestSelect

const deliveryOrderSelect = {
  createdAt: true,
  currencyCode: true,
  customerEmail: true,
  customerName: true,
  customerPhone: true,
  id: true,
  metadata: true,
  orderNumber: true,
  paymentStatus: true,
  status: true,
  totalMinor: true,
  updatedAt: true,
} satisfies Prisma.OrderSelect

type DeliveryRequestRow = Prisma.DeliveryRequestGetPayload<{
  select: typeof deliveryRequestSelect
}>

type DeliveryOrderRow = Prisma.OrderGetPayload<{
  select: typeof deliveryOrderSelect
}>

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return value as JsonRecord
}

function getStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function getDateField(value: unknown) {
  const stringValue = getStringField(value)

  if (!stringValue) return null

  const date = new Date(stringValue)

  return Number.isNaN(date.getTime()) ? null : date
}

function getErrorCode(error: unknown) {
  return getStringField(asRecord(error).code)
}

function isDurableFulfillmentTableUnavailable(error: unknown) {
  const code = getErrorCode(error)

  return code === "P2021" || code === "P2022"
}

function isUniqueConstraintError(error: unknown) {
  return getErrorCode(error) === "P2002"
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

function normalizeDeliveryRequestStatus(
  status: string | null | undefined,
): RetailOpsDeliveryRequestStatus {
  const normalized = status?.trim().toLowerCase()

  if (
    normalized === "assigned" ||
    normalized === "cancelled" ||
    normalized === "delivered" ||
    normalized === "draft" ||
    normalized === "open" ||
    normalized === "picked_up"
  ) {
    return normalized
  }

  return "open"
}

function mapDeliveryRequestStatusFilter(
  status: RetailOpsDeliveryRequestStatusFilter | undefined,
): DeliveryRequestStatus | null {
  if (!status || status === "all") return null

  return status.toUpperCase() as DeliveryRequestStatus
}

function mapDeliveryRequestUpdateStatus(
  status: RetailOpsDeliveryRequestStatusUpdate,
): DeliveryRequestStatus {
  return status.toUpperCase() as DeliveryRequestStatus
}

function mapAssignmentStatus(status: RetailOpsDeliveryRequestStatusUpdate) {
  if (status === "assigned") return "ACCEPTED" as const
  if (status === "picked_up") return "IN_TRANSIT" as const
  if (status === "delivered") return "COMPLETED" as const

  return "CANCELLED" as const
}

function getSharedLinkOrderMetadata(metadata: unknown) {
  const retailOps = asRecord(asRecord(metadata).retailOps)

  return {
    shareLinkCreatorUserId: getStringField(retailOps.shareLinkCreatorUserId),
    shareLinkId: getStringField(retailOps.shareLinkId),
    shareToken: getStringField(retailOps.shareToken),
    source: getStringField(retailOps.source),
  }
}

function getFulfillmentMetadata(metadata: unknown) {
  const retailOps = asRecord(asRecord(metadata).retailOps)
  const fulfillment = asRecord(retailOps.fulfillment)

  return {
    method: getStringField(fulfillment.method),
    note: getStringField(fulfillment.note),
    status: getStringField(fulfillment.status),
  }
}

function getDeliveryRequestMetadata(metadata: unknown) {
  const retailOps = asRecord(asRecord(metadata).retailOps)
  const deliveryRequest = asRecord(retailOps.deliveryRequest)

  return {
    assignedAt: getDateField(deliveryRequest.assignedAt),
    completedAt: getDateField(deliveryRequest.completedAt),
    createdAt: getDateField(deliveryRequest.createdAt),
    createdByUserId: getStringField(deliveryRequest.createdByUserId),
    dropoffAddress: getStringField(deliveryRequest.dropoffAddress),
    dropoffName: getStringField(deliveryRequest.dropoffName),
    dropoffPhone: getStringField(deliveryRequest.dropoffPhone),
    id: getStringField(deliveryRequest.id),
    notes: getStringField(deliveryRequest.notes),
    pickupAddress: getStringField(deliveryRequest.pickupAddress),
    pickupName: getStringField(deliveryRequest.pickupName),
    pickupPhone: getStringField(deliveryRequest.pickupPhone),
    requestedAt: getDateField(deliveryRequest.requestedAt),
    source: getStringField(deliveryRequest.source),
    status: normalizeDeliveryRequestStatus(
      getStringField(deliveryRequest.status),
    ),
    updatedAt: getDateField(deliveryRequest.updatedAt),
  }
}

function withDeliveryRequestMetadata(
  metadata: unknown,
  deliveryRequest: JsonRecord,
): Prisma.InputJsonValue {
  const existingMetadata = asRecord(metadata)
  const retailOps = asRecord(existingMetadata.retailOps)
  const fulfillment = asRecord(retailOps.fulfillment)

  return {
    ...existingMetadata,
    retailOps: {
      ...retailOps,
      deliveryRequest,
      fulfillment: {
        ...fulfillment,
        method: "delivery",
        status: getStringField(fulfillment.status) ?? "pending",
      },
    },
  } as Prisma.InputJsonValue
}

function withDeliveryRequestStatusMetadata(
  metadata: unknown,
  input: {
    actorUserId: string
    assignedAt?: Date | null
    assignedDriverName?: string
    assignedDriverPhone?: string
    completedAt?: Date | null
    deliveryRequestId: string
    happenedAt: Date
    note?: string
    status: RetailOpsDeliveryRequestStatusUpdate
  },
): Prisma.InputJsonValue {
  const existingMetadata = asRecord(metadata)
  const retailOps = asRecord(existingMetadata.retailOps)
  const existingDeliveryRequest = asRecord(retailOps.deliveryRequest)
  const existingFulfillment = asRecord(retailOps.fulfillment)
  const happenedAt = input.happenedAt.toISOString()
  const assignedAt =
    input.assignedAt?.toISOString() ?? getStringField(existingDeliveryRequest.assignedAt)
  const pickedUpAt =
    input.status === "picked_up" || input.status === "delivered"
      ? happenedAt
      : getStringField(existingDeliveryRequest.pickedUpAt)
  const deliveredAt =
    input.status === "delivered"
      ? happenedAt
      : getStringField(existingDeliveryRequest.deliveredAt)
  const cancelledAt =
    input.status === "cancelled"
      ? happenedAt
      : getStringField(existingDeliveryRequest.cancelledAt)
  const fulfillmentStatus =
    input.status === "assigned"
      ? (getStringField(existingFulfillment.status) ?? "pending")
      : input.status === "cancelled"
        ? "cancelled"
        : input.status

  return {
    ...existingMetadata,
    retailOps: {
      ...retailOps,
      deliveryRequest: {
        ...existingDeliveryRequest,
        assignedAt,
        assignedDriverName:
          input.assignedDriverName ??
          getStringField(existingDeliveryRequest.assignedDriverName),
        assignedDriverPhone:
          input.assignedDriverPhone ??
          getStringField(existingDeliveryRequest.assignedDriverPhone),
        cancelledAt,
        completedAt:
          input.completedAt?.toISOString() ??
          getStringField(existingDeliveryRequest.completedAt),
        deliveredAt,
        id: input.deliveryRequestId,
        lastStatusNote: input.note?.trim() || null,
        pickedUpAt,
        status: input.status,
        statusUpdatedAt: happenedAt,
        statusUpdatedByUserId: input.actorUserId,
        updatedAt: happenedAt,
      },
      fulfillment: {
        ...existingFulfillment,
        fulfilledAt:
          input.status === "delivered"
            ? happenedAt
            : getStringField(existingFulfillment.fulfilledAt),
        fulfilledByUserId:
          input.status === "delivered"
            ? input.actorUserId
            : getStringField(existingFulfillment.fulfilledByUserId),
        method: "delivery",
        note:
          input.note?.trim() ||
          getStringField(existingFulfillment.note) ||
          null,
        status: fulfillmentStatus,
      },
    },
  } as Prisma.InputJsonValue
}

function assertSharedLinkDeliveryOrderAccess(
  order: DeliveryOrderRow,
  input: {
    actorUserId: string
    canManageAllRequests: boolean
  },
) {
  const sharedLinkMetadata = getSharedLinkOrderMetadata(order.metadata)

  if (sharedLinkMetadata.source !== "retail_ops_share_link_order_request") {
    throw new RetailOpsFulfillmentError(
      "ORDER_NOT_FOUND",
      "Shared-link order request not found.",
    )
  }

  if (
    !input.canManageAllRequests &&
    sharedLinkMetadata.shareLinkCreatorUserId !== input.actorUserId
  ) {
    throw new RetailOpsFulfillmentError(
      "ORDER_REQUEST_FORBIDDEN",
      "You can only manage delivery requests from links you created.",
    )
  }

  const fulfillment = getFulfillmentMetadata(order.metadata)

  if (fulfillment.method && fulfillment.method !== "delivery") {
    throw new RetailOpsFulfillmentError(
      "ORDER_NOT_DELIVERY_ELIGIBLE",
      "This shared-link order is not marked for delivery.",
    )
  }
}

function toDeliveryRequestOrder(order: DeliveryOrderRow) {
  return {
    currencyCode: order.currencyCode,
    id: order.id,
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    status: order.status,
    totalMinor: order.totalMinor,
  }
}

function toDeliveryRequestCustomer(order: DeliveryOrderRow) {
  return {
    email: order.customerEmail,
    name: order.customerName,
    phone: order.customerPhone,
  }
}

function toDeliveryRequestShareLink(order: DeliveryOrderRow) {
  const metadata = getSharedLinkOrderMetadata(order.metadata)

  return {
    createdByUserId: metadata.shareLinkCreatorUserId,
    id: metadata.shareLinkId,
    token: metadata.shareToken,
  }
}

function toRetailOpsDeliveryRequestFromDurable(
  request: DeliveryRequestRow,
): RetailOpsDeliveryRequest {
  return {
    assignedAt: request.assignedAt,
    assignment: request.assignment
      ? {
          assignedDriverName: request.assignment.assignedDriverName,
          assignedDriverPhone: request.assignment.assignedDriverPhone,
          dispatchTenantId: request.assignment.dispatchTenantId,
          id: request.assignment.id,
          providerName: request.assignment.providerProfile?.displayName ?? null,
          status: request.assignment.status.toLowerCase(),
        }
      : null,
    bidCount: request._count.bids,
    completedAt: request.completedAt,
    createdAt: request.createdAt,
    customer: toDeliveryRequestCustomer(request.order),
    dropoff: {
      address: request.dropoffAddress,
      name: request.dropoffName,
      phone: request.dropoffPhone,
    },
    id: request.id,
    notes: request.notes,
    order: toDeliveryRequestOrder(request.order),
    pickup: {
      address: request.pickupAddress,
      name: request.pickupName,
      phone: request.pickupPhone,
    },
    requestedAt: request.requestedAt,
    shareLink: toDeliveryRequestShareLink(request.order),
    source: "durable",
    status: normalizeDeliveryRequestStatus(request.status),
    trackingEventCount: request._count.trackingEvents,
    updatedAt: request.updatedAt,
  }
}

function toRetailOpsDeliveryRequestFromMetadata(
  order: DeliveryOrderRow,
): RetailOpsDeliveryRequest | null {
  const deliveryRequest = getDeliveryRequestMetadata(order.metadata)

  if (!deliveryRequest.id) return null

  const requestedAt = deliveryRequest.requestedAt ?? order.updatedAt
  const createdAt = deliveryRequest.createdAt ?? requestedAt
  const updatedAt = deliveryRequest.updatedAt ?? requestedAt

  return {
    assignedAt: deliveryRequest.assignedAt,
    assignment: null,
    bidCount: 0,
    completedAt: deliveryRequest.completedAt,
    createdAt,
    customer: toDeliveryRequestCustomer(order),
    dropoff: {
      address: deliveryRequest.dropoffAddress ?? "",
      name: deliveryRequest.dropoffName ?? "Customer",
      phone: deliveryRequest.dropoffPhone,
    },
    id: deliveryRequest.id,
    notes: deliveryRequest.notes,
    order: toDeliveryRequestOrder(order),
    pickup: {
      address: deliveryRequest.pickupAddress ?? "",
      name: deliveryRequest.pickupName ?? "Pickup",
      phone: deliveryRequest.pickupPhone,
    },
    requestedAt,
    shareLink: toDeliveryRequestShareLink(order),
    source: "metadata",
    status: deliveryRequest.status,
    trackingEventCount: 0,
    updatedAt,
  }
}

function compareDeliveryRequests(
  left: RetailOpsDeliveryRequest,
  right: RetailOpsDeliveryRequest,
) {
  return right.requestedAt.getTime() - left.requestedAt.getTime()
}

function mergeDeliveryRequests(input: {
  durableRequests: RetailOpsDeliveryRequest[]
  fallbackRequests: RetailOpsDeliveryRequest[]
  limit: number
}) {
  const seenOrderIds = new Set<string>()

  return [...input.durableRequests, ...input.fallbackRequests]
    .filter((request) => {
      if (seenOrderIds.has(request.order.id)) return false

      seenOrderIds.add(request.order.id)

      return true
    })
    .sort(compareDeliveryRequests)
    .slice(0, input.limit)
}

async function findSharedLinkDeliveryOrder(
  db: PrismaClient,
  input: {
    orderId: string
    storeId: string
    tenantId: string
  },
) {
  return db.order.findFirst({
    where: {
      id: input.orderId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: deliveryOrderSelect,
  })
}

async function findDurableRetailOpsDeliveryRequestByOrder(
  db: PrismaClient,
  input: {
    orderId: string
    tenantId: string
  },
): Promise<RetailOpsDeliveryRequest | null> {
  try {
    const deliveryRequest = await db.deliveryRequest.findFirst({
      where: {
        orderId: input.orderId,
        tenantId: input.tenantId,
      },
      select: deliveryRequestSelect,
    })

    return deliveryRequest
      ? toRetailOpsDeliveryRequestFromDurable(deliveryRequest)
      : null
  } catch (error) {
    if (isDurableFulfillmentTableUnavailable(error)) return null

    throw error
  }
}

async function findDurableRetailOpsDeliveryRequestById(
  db: PrismaClient,
  input: UpdateRetailOpsDeliveryRequestStatusInput,
): Promise<DeliveryRequestRow | null> {
  try {
    return await db.deliveryRequest.findFirst({
      where: {
        id: input.deliveryRequestId,
        order: {
          AND: [
            {
              metadata: {
                equals: "retail_ops_share_link_order_request",
                path: ["retailOps", "source"],
              },
            },
            input.canManageAllRequests
              ? {}
              : {
                  metadata: {
                    equals: input.actorUserId,
                    path: ["retailOps", "shareLinkCreatorUserId"],
                  },
                },
          ],
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        tenantId: input.tenantId,
      },
      select: deliveryRequestSelect,
    })
  } catch (error) {
    if (isDurableFulfillmentTableUnavailable(error)) return null

    throw error
  }
}

async function findMetadataDeliveryOrderByRequestId(
  db: PrismaClient,
  input: UpdateRetailOpsDeliveryRequestStatusInput,
) {
  const orderId = input.deliveryRequestId.startsWith("metadata:")
    ? input.deliveryRequestId.slice("metadata:".length)
    : null

  return db.order.findFirst({
    where: {
      ...(orderId
        ? {
            id: orderId,
          }
        : {
            metadata: {
              equals: input.deliveryRequestId,
              path: ["retailOps", "deliveryRequest", "id"],
            },
          }),
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: deliveryOrderSelect,
  })
}

async function createMetadataRetailOpsDeliveryRequest(
  db: PrismaClient,
  input: CreateRetailOpsDeliveryRequestInput,
  order: DeliveryOrderRow,
): Promise<RetailOpsDeliveryRequest> {
  const now = input.requestedAt ?? new Date()
  const deliveryRequest = {
    createdAt: now.toISOString(),
    createdByUserId: input.actorUserId,
    dropoffAddress: input.dropoffAddress,
    dropoffName: input.dropoffName,
    dropoffPhone: input.dropoffPhone ?? null,
    id: `metadata:${input.orderId}`,
    notes: input.notes?.trim() || null,
    pickupAddress: input.pickupAddress,
    pickupName: input.pickupName,
    pickupPhone: input.pickupPhone ?? null,
    requestedAt: now.toISOString(),
    source: "metadata",
    status: "open",
    updatedAt: now.toISOString(),
  } satisfies JsonRecord

  const updatedOrder = await db.order.update({
    where: {
      id: input.orderId,
    },
    data: {
      metadata: withDeliveryRequestMetadata(order.metadata, deliveryRequest),
    },
    select: deliveryOrderSelect,
  })
  const request = toRetailOpsDeliveryRequestFromMetadata(updatedOrder)

  if (!request) {
    throw new RetailOpsFulfillmentError(
      "DELIVERY_REQUEST_UNAVAILABLE",
      "Delivery request could not be recorded.",
    )
  }

  return request
}

async function createDurableRetailOpsDeliveryRequest(
  db: PrismaClient,
  input: CreateRetailOpsDeliveryRequestInput,
  order: DeliveryOrderRow,
): Promise<RetailOpsDeliveryRequest | null> {
  try {
    const request = await db.$transaction(async (tx) => {
      const createdRequest = await tx.deliveryRequest.create({
        data: {
          dropoffAddress: input.dropoffAddress,
          dropoffName: input.dropoffName,
          dropoffPhone: input.dropoffPhone,
          notes: input.notes?.trim() || null,
          orderId: input.orderId,
          pickupAddress: input.pickupAddress,
          pickupName: input.pickupName,
          pickupPhone: input.pickupPhone,
          requestedAt: input.requestedAt,
          status: "OPEN",
          tenantId: input.tenantId,
        },
        select: deliveryRequestSelect,
      })

      await tx.order.update({
        where: {
          id: input.orderId,
        },
        data: {
          metadata: withDeliveryRequestMetadata(order.metadata, {
            createdAt: createdRequest.createdAt.toISOString(),
            createdByUserId: input.actorUserId,
            dropoffAddress: createdRequest.dropoffAddress,
            dropoffName: createdRequest.dropoffName,
            dropoffPhone: createdRequest.dropoffPhone,
            id: createdRequest.id,
            notes: createdRequest.notes,
            pickupAddress: createdRequest.pickupAddress,
            pickupName: createdRequest.pickupName,
            pickupPhone: createdRequest.pickupPhone,
            requestedAt: createdRequest.requestedAt.toISOString(),
            source: "durable",
            status: "open",
            updatedAt: createdRequest.updatedAt.toISOString(),
          }),
        },
      })

      return createdRequest
    })

    return toRetailOpsDeliveryRequestFromDurable(request)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return findDurableRetailOpsDeliveryRequestByOrder(db, input)
    }

    if (isDurableFulfillmentTableUnavailable(error)) return null

    throw error
  }
}

async function listDurableRetailOpsDeliveryRequests(
  db: PrismaClient,
  input: ListRetailOpsDeliveryRequestsInput,
  options: {
    limit: number
    range: {
      from: Date
      to: Date
    }
    status: RetailOpsDeliveryRequestStatusFilter
  },
): Promise<RetailOpsDeliveryRequest[] | null> {
  const mappedStatus = mapDeliveryRequestStatusFilter(options.status)
  const where: Prisma.DeliveryRequestWhereInput = {
    order: {
      AND: [
        {
          metadata: {
            equals: "retail_ops_share_link_order_request",
            path: ["retailOps", "source"],
          },
        },
        input.canManageAllRequests
          ? {}
          : {
              metadata: {
                equals: input.actorUserId,
                path: ["retailOps", "shareLinkCreatorUserId"],
              },
            },
      ],
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    requestedAt: {
      gte: options.range.from,
      lte: options.range.to,
    },
    tenantId: input.tenantId,
    ...(mappedStatus ? { status: mappedStatus } : {}),
  }

  try {
    const requests = await db.deliveryRequest.findMany({
      where,
      orderBy: [
        {
          requestedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: options.limit,
      select: deliveryRequestSelect,
    })

    return requests.map(toRetailOpsDeliveryRequestFromDurable)
  } catch (error) {
    if (isDurableFulfillmentTableUnavailable(error)) return null

    throw error
  }
}

async function listMetadataRetailOpsDeliveryRequests(
  db: PrismaClient,
  input: ListRetailOpsDeliveryRequestsInput,
  options: {
    limit: number
    lookbackLimit: number
    range: {
      from: Date
      to: Date
    }
    status: RetailOpsDeliveryRequestStatusFilter
  },
): Promise<RetailOpsDeliveryRequest[]> {
  const orders = await db.order.findMany({
    where: {
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: options.lookbackLimit,
    select: deliveryOrderSelect,
  })

  return orders
    .flatMap((order) => {
      const sharedLinkMetadata = getSharedLinkOrderMetadata(order.metadata)

      if (
        sharedLinkMetadata.source !== "retail_ops_share_link_order_request"
      ) {
        return []
      }

      if (
        !input.canManageAllRequests &&
        sharedLinkMetadata.shareLinkCreatorUserId !== input.actorUserId
      ) {
        return []
      }

      const request = toRetailOpsDeliveryRequestFromMetadata(order)

      if (!request) return []

      if (
        options.status !== "all" &&
        normalizeDeliveryRequestStatus(options.status) !== request.status
      ) {
        return []
      }

      if (
        request.requestedAt < options.range.from ||
        request.requestedAt > options.range.to
      ) {
        return []
      }

      return [request]
    })
    .sort(compareDeliveryRequests)
    .slice(0, options.limit)
}

export async function listRetailOpsDeliveryRequests(
  db: PrismaClient,
  input: ListRetailOpsDeliveryRequestsInput,
): Promise<RetailOpsDeliveryRequest[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  const lookbackLimit = Math.max(limit * 5, 100)
  const range = getRange(input)
  const status = input.status ?? "all"
  const durableRequests = await listDurableRetailOpsDeliveryRequests(db, input, {
    limit,
    range,
    status,
  })
  const fallbackRequests = await listMetadataRetailOpsDeliveryRequests(
    db,
    input,
    {
      limit,
      lookbackLimit,
      range,
      status,
    },
  )

  if (!durableRequests) return fallbackRequests

  return mergeDeliveryRequests({
    durableRequests,
    fallbackRequests,
    limit,
  })
}

export async function createRetailOpsDeliveryRequest(
  db: PrismaClient,
  input: CreateRetailOpsDeliveryRequestInput,
): Promise<RetailOpsDeliveryRequest> {
  const order = await findSharedLinkDeliveryOrder(db, input)

  if (!order) {
    throw new RetailOpsFulfillmentError(
      "ORDER_NOT_FOUND",
      "Shared-link order request not found.",
    )
  }

  assertSharedLinkDeliveryOrderAccess(order, input)

  const metadataRequest = toRetailOpsDeliveryRequestFromMetadata(order)

  if (metadataRequest) return metadataRequest

  const durableRequest = await findDurableRetailOpsDeliveryRequestByOrder(
    db,
    input,
  )

  if (durableRequest) return durableRequest

  const createdDurableRequest = await createDurableRetailOpsDeliveryRequest(
    db,
    input,
    order,
  )

  if (createdDurableRequest) return createdDurableRequest

  return createMetadataRetailOpsDeliveryRequest(db, input, order)
}

export async function updateRetailOpsDeliveryRequestStatus(
  db: PrismaClient,
  input: UpdateRetailOpsDeliveryRequestStatusInput,
): Promise<RetailOpsDeliveryRequest> {
  const happenedAt = input.happenedAt ?? new Date()
  const durableRequest = await findDurableRetailOpsDeliveryRequestById(
    db,
    input,
  )

  if (durableRequest) {
    assertSharedLinkDeliveryOrderAccess(durableRequest.order, input)

    const updatedRequest = await db.$transaction(async (tx) => {
      const assignedAt =
        durableRequest.assignedAt ??
        (input.status === "assigned" ||
        input.status === "picked_up" ||
        input.status === "delivered"
          ? happenedAt
          : null)
      const completedAt =
        input.status === "delivered" ? happenedAt : durableRequest.completedAt

      await tx.deliveryRequest.update({
        where: {
          id: durableRequest.id,
        },
        data: {
          assignedAt: assignedAt ?? undefined,
          completedAt: completedAt ?? undefined,
          status: mapDeliveryRequestUpdateStatus(input.status),
        },
        select: deliveryRequestSelect,
      })

      if (input.status !== "cancelled" || durableRequest.assignment) {
        await tx.deliveryAssignment.upsert({
          where: {
            requestId: durableRequest.id,
          },
          create: {
            assignedDriverName: input.assignedDriverName,
            assignedDriverPhone: input.assignedDriverPhone,
            deliveredAt:
              input.status === "delivered" ? happenedAt : undefined,
            dispatchTenantId: input.tenantId,
            pickedUpAt:
              input.status === "picked_up" || input.status === "delivered"
                ? happenedAt
                : undefined,
            requestId: durableRequest.id,
            status: mapAssignmentStatus(input.status),
          },
          update: {
            assignedDriverName: input.assignedDriverName,
            assignedDriverPhone: input.assignedDriverPhone,
            deliveredAt:
              input.status === "delivered" ? happenedAt : undefined,
            pickedUpAt:
              input.status === "picked_up" || input.status === "delivered"
                ? happenedAt
                : undefined,
            status: mapAssignmentStatus(input.status),
          },
        })
      }

      await tx.trackingEvent.create({
        data: {
          description: input.note?.trim() || null,
          eventType: input.status,
          happenedAt,
          requestId: durableRequest.id,
        },
      })

      await tx.order.update({
        where: {
          id: durableRequest.order.id,
        },
        data: {
          metadata: withDeliveryRequestStatusMetadata(
            durableRequest.order.metadata,
            {
              actorUserId: input.actorUserId,
              assignedAt,
              assignedDriverName: input.assignedDriverName,
              assignedDriverPhone: input.assignedDriverPhone,
              completedAt,
              deliveryRequestId: durableRequest.id,
              happenedAt,
              note: input.note,
              status: input.status,
            },
          ),
        },
      })

      return tx.deliveryRequest.findUniqueOrThrow({
        where: {
          id: durableRequest.id,
        },
        select: deliveryRequestSelect,
      })
    })

    return toRetailOpsDeliveryRequestFromDurable(updatedRequest)
  }

  const order = await findMetadataDeliveryOrderByRequestId(db, input)

  if (!order) {
    throw new RetailOpsFulfillmentError(
      "DELIVERY_REQUEST_NOT_FOUND",
      "Delivery request not found.",
    )
  }

  assertSharedLinkDeliveryOrderAccess(order, input)

  const request = toRetailOpsDeliveryRequestFromMetadata(order)

  if (!request) {
    throw new RetailOpsFulfillmentError(
      "DELIVERY_REQUEST_NOT_FOUND",
      "Delivery request not found.",
    )
  }

  const assignedAt =
    request.assignedAt ??
    (input.status === "assigned" ||
    input.status === "picked_up" ||
    input.status === "delivered"
      ? happenedAt
      : null)
  const completedAt =
    input.status === "delivered" ? happenedAt : request.completedAt
  const updatedOrder = await db.order.update({
    where: {
      id: order.id,
    },
    data: {
      metadata: withDeliveryRequestStatusMetadata(order.metadata, {
        actorUserId: input.actorUserId,
        assignedAt,
        assignedDriverName: input.assignedDriverName,
        assignedDriverPhone: input.assignedDriverPhone,
        completedAt,
        deliveryRequestId: request.id,
        happenedAt,
        note: input.note,
        status: input.status,
      }),
    },
    select: deliveryOrderSelect,
  })
  const updatedRequest = toRetailOpsDeliveryRequestFromMetadata(updatedOrder)

  if (!updatedRequest) {
    throw new RetailOpsFulfillmentError(
      "DELIVERY_REQUEST_UNAVAILABLE",
      "Delivery request could not be updated.",
    )
  }

  return updatedRequest
}
