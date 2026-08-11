import {
  type ServiceCommerceDeliveryStatus,
  type ServiceCommerceFulfillmentContext,
  type ServiceCommerceFulfillmentProjection,
  type ServiceCommercePickupStatus,
  deriveServiceCommerceFulfillmentGates,
  deriveServiceCommerceFulfillmentNextOperations,
  projectServiceCommerceFulfillmentEvent,
  serviceCommercePickupExceptionCodeSchema,
} from "@ewatrade/service-commerce"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  type CommerceQuoteAvailabilityOutcome,
  CommerceQuoteFulfilmentType,
  type CommerceQuoteLineOutcome,
  CommerceQuoteSourceType,
  CommerceQuoteVersionStatus,
  OrderStatus,
  PaymentStatus,
} from "../../generated/prisma/enums"
import { resolveCommerceQuotePayableState } from "./commerce-quotes"

const SOURCE_KIND_BY_TYPE = {
  [CommerceQuoteSourceType.COMMERCE_INQUIRY]: "commerce_inquiry",
  [CommerceQuoteSourceType.PRESCRIPTION_REQUEST]: "prescription",
  [CommerceQuoteSourceType.SERVICE_REQUEST]: "service",
} as const satisfies Record<
  CommerceQuoteSourceType,
  ServiceCommerceFulfillmentContext["source"]["kind"]
>

const FULFILLMENT_TYPE_BY_VALUE = {
  DELIVERY: "delivery",
  PICKUP: "pickup",
  UNSPECIFIED: "unspecified",
} as const

const ORDER_STATUS_BY_VALUE = {
  [OrderStatus.CANCELLED]: "cancelled",
  [OrderStatus.COMPLETED]: "completed",
  [OrderStatus.CONFIRMED]: "confirmed",
  [OrderStatus.DRAFT]: "draft",
  [OrderStatus.FULFILLING]: "fulfilling",
  [OrderStatus.OUT_FOR_DELIVERY]: "out_for_delivery",
  [OrderStatus.PENDING]: "pending",
  [OrderStatus.READY_FOR_PICKUP]: "ready_for_pickup",
  [OrderStatus.REFUNDED]: "refunded",
} as const satisfies Record<OrderStatus, string>

const SOURCE_TYPE_BY_KIND = {
  commerce_inquiry: CommerceQuoteSourceType.COMMERCE_INQUIRY,
  prescription: CommerceQuoteSourceType.PRESCRIPTION_REQUEST,
  service: CommerceQuoteSourceType.SERVICE_REQUEST,
} as const satisfies Record<
  ServiceCommerceFulfillmentContext["source"]["kind"],
  CommerceQuoteSourceType
>

function safePickupExceptionCode(value: string | null) {
  const parsed = serviceCommercePickupExceptionCodeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export class ServiceCommerceFulfillmentError extends Error {
  constructor(
    readonly code:
      | "FULFILLMENT_BLOCKED"
      | "FULFILLMENT_NOT_FOUND"
      | "SOURCE_MISMATCH",
    message: string,
  ) {
    super(message)
    this.name = "ServiceCommerceFulfillmentError"
  }
}

export async function assertServiceCommerceFulfillmentAttendantInTransaction(
  tx: Prisma.TransactionClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const assignment = await tx.serviceCommerceStoreTeamAssignment.findFirst({
    select: { id: true },
    where: {
      capability: "ATTENDANT",
      membership: {
        acceptedAt: { not: null },
        status: "ACTIVE",
        tenantId: input.tenantId,
        userId: input.actorUserId,
      },
      status: "ACTIVE",
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!assignment) {
    throw new ServiceCommerceFulfillmentError(
      "FULFILLMENT_BLOCKED",
      "An active Store attendant assignment is required.",
    )
  }
}

async function loadServiceCommerceFulfillmentOrderInTransaction(
  tx: Prisma.TransactionClient,
  input: Pick<
    ServiceCommerceFulfillmentContext,
    "orderId" | "storeId" | "tenantId"
  >,
) {
  const order = await tx.commercialOrder.findFirst({
    select: {
      acceptedCommerceQuoteVersion: {
        select: {
          fulfilmentPromise: true,
          fulfilmentType: true,
          id: true,
          quote: { select: { sourceId: true, sourceType: true } },
          status: true,
          totalMinor: true,
        },
      },
      currencyCode: true,
      id: true,
      paymentStatus: true,
      prescriptionDeliveryAddress: { select: { packedAt: true } },
      prescriptionDeliveryAssignment: {
        select: {
          events: {
            orderBy: { effectiveAt: "desc" },
            select: { effectiveAt: true },
            take: 1,
          },
          failureCode: true,
          proofReference: true,
          revision: true,
          status: true,
        },
      },
      prescriptionPickupFulfillment: {
        select: {
          events: {
            orderBy: { effectiveAt: "desc" },
            select: { effectiveAt: true },
            take: 1,
          },
          exceptionCode: true,
          packedAt: true,
          revision: true,
          status: true,
        },
      },
      status: true,
      totalMinor: true,
    },
    where: {
      id: input.orderId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const version = order?.acceptedCommerceQuoteVersion
  if (
    !order ||
    !version ||
    version.status !== CommerceQuoteVersionStatus.ACCEPTED
  ) {
    throw new ServiceCommerceFulfillmentError(
      "FULFILLMENT_NOT_FOUND",
      "An accepted Commerce Order was not found for fulfilment.",
    )
  }
  const resolvedSource = {
    id: version.quote.sourceId,
    kind: SOURCE_KIND_BY_TYPE[version.quote.sourceType],
  }
  const pickup = order.prescriptionPickupFulfillment
  const delivery = order.prescriptionDeliveryAssignment
  const deliveryStatus = delivery?.status
    .toLowerCase()
    .replace("returned_to_pharmacy", "returned_to_store") as
    | ServiceCommerceDeliveryStatus
    | undefined
  const pickupOperationalState = pickup
    ? (() => {
        const status =
          pickup.status.toLowerCase() as ServiceCommercePickupStatus
        return {
          kind: "pickup" as const,
          latestEvent: pickup.events[0]
            ? projectServiceCommerceFulfillmentEvent({
                effectiveAt: pickup.events[0].effectiveAt,
                kind: "pickup",
                reasonCode: safePickupExceptionCode(pickup.exceptionCode),
                status,
              })
            : null,
          nextOperations: [
            ...deriveServiceCommerceFulfillmentNextOperations({
              kind: "pickup",
              status,
            }),
          ],
          preparedAt: pickup.packedAt,
          proofPresent: false as const,
          revision: pickup.revision,
          status,
        }
      })()
    : null
  const operationalState = pickupOperationalState
    ? pickupOperationalState
    : order.prescriptionDeliveryAddress
      ? {
          kind: "delivery" as const,
          latestEvent:
            delivery?.events[0] && deliveryStatus
              ? projectServiceCommerceFulfillmentEvent({
                  effectiveAt: delivery.events[0].effectiveAt,
                  kind: "delivery",
                  reasonCode: delivery.failureCode,
                  status: deliveryStatus,
                })
              : null,
          nextOperations: [
            ...deriveServiceCommerceFulfillmentNextOperations({
              kind: "delivery",
              status: deliveryStatus ?? null,
            }),
          ],
          preparedAt: order.prescriptionDeliveryAddress.packedAt,
          proofPresent: Boolean(delivery?.proofReference),
          revision: delivery?.revision ?? null,
          status: deliveryStatus ?? null,
        }
      : null
  return {
    currencyCode: order.currencyCode,
    fulfilmentPromise: version.fulfilmentPromise,
    fulfilmentType: FULFILLMENT_TYPE_BY_VALUE[version.fulfilmentType],
    orderId: order.id,
    orderStatus: ORDER_STATUS_BY_VALUE[order.status],
    operationalState,
    paid: order.paymentStatus === PaymentStatus.PAID,
    quoteVersionId: version.id,
    source: resolvedSource,
    totalMinor: order.totalMinor,
  }
}

export async function resolveServiceCommerceFulfillmentOrderInTransaction(
  tx: Prisma.TransactionClient,
  input: ServiceCommerceFulfillmentContext,
) {
  const projection = await loadServiceCommerceFulfillmentOrderInTransaction(
    tx,
    input,
  )
  if (
    projection.source.id !== input.source.id ||
    projection.source.kind !== input.source.kind
  ) {
    throw new ServiceCommerceFulfillmentError(
      "SOURCE_MISMATCH",
      "The fulfilment source does not match the accepted Order Quote.",
    )
  }
  return projection
}

export async function assertServiceCommerceFulfillmentSourceInTransaction(
  tx: Prisma.TransactionClient,
  input: Pick<
    ServiceCommerceFulfillmentContext,
    "orderId" | "storeId" | "tenantId"
  > & {
    expectedSourceKind: ServiceCommerceFulfillmentContext["source"]["kind"]
    source?: ServiceCommerceFulfillmentContext["source"]
  },
) {
  const projection = input.source
    ? await resolveServiceCommerceFulfillmentOrderInTransaction(tx, {
        orderId: input.orderId,
        source: input.source,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
    : await loadServiceCommerceFulfillmentOrderInTransaction(tx, input)
  if (projection.source.kind !== input.expectedSourceKind) {
    throw new ServiceCommerceFulfillmentError(
      "SOURCE_MISMATCH",
      "The fulfilment source is not eligible for this vertical adapter.",
    )
  }
  return projection
}

export async function reviseServiceCommerceQuoteForFulfillmentInTransaction(
  tx: Prisma.TransactionClient,
  input: Omit<ServiceCommerceFulfillmentContext, "orderId"> & {
    acceptanceTokenDigest: string
    clientVersionId: string
    createdByUserId: string
    expectedVersionId: string
    fulfilmentFeeMinor: number
    fulfilmentPromise: string
    fulfilmentType: "delivery" | "pickup"
    label: string
    payloadHash: string
  },
) {
  const current = await tx.commerceQuoteVersion.findFirst({
    include: {
      lines: true,
      optionSelection: true,
      options: { include: { lines: true }, orderBy: { position: "asc" } },
      quote: true,
    },
    where: {
      id: input.expectedVersionId,
      quote: {
        is: {
          sourceId: input.source.id,
          sourceType: SOURCE_TYPE_BY_KIND[input.source.kind],
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      },
    },
  })
  if (
    !current ||
    current.quote.currentVersionId !== current.id ||
    current.status !== CommerceQuoteVersionStatus.ISSUED
  ) {
    throw new ServiceCommerceFulfillmentError(
      "FULFILLMENT_BLOCKED",
      "The Quote changed before fulfilment could be revised.",
    )
  }
  const payableState = resolveCommerceQuotePayableState(current)
  if (!payableState.payable || payableState.requiresSelection) {
    throw new ServiceCommerceFulfillmentError(
      "FULFILLMENT_BLOCKED",
      "Choose one Offer Option before revising fulfilment.",
    )
  }
  const payable = payableState.payable
  const fulfilmentType =
    input.fulfilmentType === "delivery"
      ? CommerceQuoteFulfilmentType.DELIVERY
      : CommerceQuoteFulfilmentType.PICKUP
  if (
    !Number.isSafeInteger(input.fulfilmentFeeMinor) ||
    input.fulfilmentFeeMinor < 0
  ) {
    throw new ServiceCommerceFulfillmentError(
      "FULFILLMENT_BLOCKED",
      "The fulfilment fee must be a non-negative minor-unit amount.",
    )
  }
  const totalMinor =
    payable.subtotalMinor -
    payable.discountMinor +
    payable.taxMinor +
    input.fulfilmentFeeMinor
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) {
    throw new ServiceCommerceFulfillmentError(
      "FULFILLMENT_BLOCKED",
      "The revised fulfilment total is invalid.",
    )
  }
  const version = await tx.commerceQuoteVersion.create({
    data: {
      acceptanceTokenDigest: input.acceptanceTokenDigest,
      availabilityOutcome:
        payable.availabilityOutcome as CommerceQuoteAvailabilityOutcome,
      clientVersionId: input.clientVersionId,
      createdByUserId: input.createdByUserId,
      currencyCode: current.currencyCode,
      customerNote: payable.customerNote ?? null,
      discountMinor: payable.discountMinor,
      expiresAt: current.expiresAt,
      fulfilmentFeeMinor: input.fulfilmentFeeMinor,
      fulfilmentPromise: input.fulfilmentPromise,
      fulfilmentType,
      issuedAt: new Date(),
      payloadHash: input.payloadHash,
      quoteId: current.quoteId,
      status: CommerceQuoteVersionStatus.ISSUED,
      subtotalMinor: payable.subtotalMinor,
      taxMinor: payable.taxMinor,
      totalMinor,
      version: current.version + 1,
    },
  })
  const option = await tx.commerceQuoteOption.create({
    data: {
      availabilityOutcome:
        payable.availabilityOutcome as CommerceQuoteAvailabilityOutcome,
      clientOptionId: `${input.clientVersionId}:default`,
      currencyCode: current.currencyCode,
      customerNote: payable.customerNote ?? null,
      discountMinor: payable.discountMinor,
      fulfilmentFeeMinor: input.fulfilmentFeeMinor,
      fulfilmentPromise: input.fulfilmentPromise,
      fulfilmentType,
      label: input.label,
      position: 0,
      quoteVersionId: version.id,
      subtotalMinor: payable.subtotalMinor,
      taxMinor: payable.taxMinor,
      totalMinor,
    },
  })
  await tx.commerceQuoteLine.createMany({
    data: payable.lines.map((line) => ({
      availabilityAttestationId: line.availabilityAttestationId,
      balanceRevision: line.balanceRevision,
      catalogItemName: line.catalogItemName,
      configurationVersionId: line.configurationVersionId,
      customerNote: line.customerNote,
      offeringId: line.offeringId,
      offeringName: line.offeringName,
      optionSelections: line.optionSelections as Prisma.InputJsonValue,
      outcome: line.outcome as CommerceQuoteLineOutcome,
      quantity: line.quantity,
      quoteOptionId: option.id,
      quoteVersionId: version.id,
      sourceLineId: line.sourceLineId,
      totalMinor: line.totalMinor,
      unitPriceMinor: line.unitPriceMinor,
      variantName: line.variantName,
    })),
  })
  const superseded = await tx.commerceQuoteVersion.updateMany({
    data: {
      acceptanceTokenDigest: null,
      status: CommerceQuoteVersionStatus.SUPERSEDED,
      supersededAt: new Date(),
    },
    where: {
      id: current.id,
      quoteId: current.quoteId,
      status: CommerceQuoteVersionStatus.ISSUED,
    },
  })
  const advanced = await tx.commerceQuote.updateMany({
    data: { currentVersionId: version.id },
    where: {
      currentVersionId: current.id,
      id: current.quoteId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (superseded.count !== 1 || advanced.count !== 1) {
    throw new ServiceCommerceFulfillmentError(
      "FULFILLMENT_BLOCKED",
      "The Quote changed before fulfilment could be revised.",
    )
  }
  return { payable, version }
}

export async function assertServiceCommerceFulfillmentGatesInTransaction(
  tx: Prisma.TransactionClient,
  input: ServiceCommerceFulfillmentContext & {
    authorize: (tx: Prisma.TransactionClient) => Promise<void>
    eligible: boolean
    operation: "assign_delivery" | "complete_pickup" | "prepare"
    packed: boolean
    ready: boolean
    verticalReleaseReady: boolean
  },
) {
  await input.authorize(tx)
  const context = await resolveServiceCommerceFulfillmentOrderInTransaction(
    tx,
    input,
  )
  const gates = deriveServiceCommerceFulfillmentGates({
    actorAuthorized: true,
    eligible: input.eligible,
    packed: input.packed,
    paid: context.paid,
    ready: input.ready,
    verticalReleaseReady: input.verticalReleaseReady,
  })
  const allowed =
    input.operation === "prepare"
      ? gates.canPrepare
      : input.operation === "assign_delivery"
        ? gates.canAssignDelivery
        : gates.canCompletePickup
  if (!allowed) {
    throw new ServiceCommerceFulfillmentError(
      "FULFILLMENT_BLOCKED",
      `Fulfilment is blocked: ${gates.blockers.join(", ")}.`,
    )
  }
  return { context, gates }
}

export async function getServiceCommerceFulfillmentOrder(
  db: PrismaClient,
  input: ServiceCommerceFulfillmentContext & {
    actorUserId: string
  },
): Promise<ServiceCommerceFulfillmentProjection> {
  return db.$transaction(async (tx) => {
    await assertServiceCommerceFulfillmentAttendantInTransaction(tx, input)
    return resolveServiceCommerceFulfillmentOrderInTransaction(tx, input)
  })
}
