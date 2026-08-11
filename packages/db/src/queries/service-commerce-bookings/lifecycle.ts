import {
  SERVICE_COMMERCE_BOOKING_MANAGE_CAPABILITY_MAX_MINUTES,
  type ServiceCommerceBookingStatus,
  type ServiceCommerceSourceRef,
  assertServiceCommerceBookingTransition,
  deriveServiceCommerceBookingNextOperations,
  evaluateServiceCommerceBookingSlot,
  projectServiceCommerceBookingCancellationConsequence,
  serviceCommerceBookingHoldCommandSchema,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import {
  CommerceQuoteSourceType,
  CommerceQuoteVersionStatus,
  CommercialPaymentType,
  OrderStatus,
  type PaymentStatus,
  ServiceBookingAccessPurpose,
  ServiceBookingAccessStatus,
  ServiceBookingAvailabilityExceptionKind,
  ServiceBookingEventType,
  ServiceBookingHoldStatus,
  ServiceBookingNotificationStatus,
  ServiceBookingNotificationType,
  ServiceBookingPaymentRequirement,
  ServiceBookingPaymentStatus,
  ServiceBookingRecordStatus,
  ServiceBookingRefundOutcome,
  ServiceBookingRefundPolicy,
  ServiceBookingStatus,
  ServiceCommercePolicyChannel,
  ServiceJobLineStatus,
  ServiceNotificationChannel,
  ServiceWorkEventType,
  WorkAuthorizationStatus,
} from "../../../generated/prisma/enums"
import type { DbClient } from "../types"
import {
  BOOKING_TRANSACTION_OPTIONS,
  type BookingTransaction,
  ServiceCommerceBookingError,
  assertBookingMember,
  assertBookingPolicy,
  assertBookingRuntimeReady,
  assertBookingSource,
  bookingNotificationPolicyAllowed,
  bookingPayloadHash,
  bookingSourceRef,
  bookingSourceType,
  bookingTokenDigest,
  resolveBookingNotificationAuthorizer,
  translateBookingTransactionError,
} from "./shared"

const PUBLIC_BOOKING_ACTOR = "public:service-commerce-booking"
const MANAGE_CAPABILITY_MINUTES =
  SERVICE_COMMERCE_BOOKING_MANAGE_CAPABILITY_MAX_MINUTES

function isRetriableBookingCapacityError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  )
}

export type IssueServiceCommerceBookingCapabilityToken = (input: {
  clientOperationId: string
  purpose: "confirm" | "view_and_manage" | "view_slots"
  storeId: string
  tenantId: string
}) => string

export async function reconcileServiceCommerceBookingPaymentInTransaction(
  tx: BookingTransaction,
  input: {
    actorUserId: string
    amountPaidMinor: number
    commercialPaymentId: string
    isRefund: boolean
    orderId: string
    storeId: string
    tenantId: string
  },
) {
  const bookings = await tx.serviceBooking.findMany({
    select: {
      id: true,
      paymentStatus: true,
      requiredPaymentMinorSnapshot: true,
    },
    where: {
      commercialOrderId: input.orderId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  for (const booking of bookings) {
    const nextStatus =
      booking.requiredPaymentMinorSnapshot === 0
        ? ServiceBookingPaymentStatus.NOT_REQUIRED
        : input.isRefund && input.amountPaidMinor === 0
          ? ServiceBookingPaymentStatus.REFUNDED
          : input.amountPaidMinor >= booking.requiredPaymentMinorSnapshot
            ? ServiceBookingPaymentStatus.PAID
            : input.amountPaidMinor > 0
              ? input.isRefund
                ? ServiceBookingPaymentStatus.PARTIALLY_REFUNDED
                : ServiceBookingPaymentStatus.PARTIALLY_PAID
              : ServiceBookingPaymentStatus.PENDING
    if (nextStatus === booking.paymentStatus) continue
    const updated = await tx.serviceBooking.updateMany({
      data: { paymentStatus: nextStatus },
      where: {
        id: booking.id,
        paymentStatus: booking.paymentStatus,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (updated.count !== 1) continue
    await tx.serviceBookingEvent.create({
      data: {
        actorUserId: input.actorUserId,
        bookingId: booking.id,
        clientOperationId: `booking-payment:${input.commercialPaymentId}:${booking.id}`,
        commercialPaymentId: input.commercialPaymentId,
        payloadHash: bookingPayloadHash({
          amountPaidMinor: input.amountPaidMinor,
          commercialPaymentId: input.commercialPaymentId,
          nextStatus,
        }),
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: ServiceBookingEventType.PAYMENT_STATUS_CHANGED,
      },
    })
  }
}

function bookingStatus(
  value: ServiceBookingStatus,
): ServiceCommerceBookingStatus {
  return value.toLowerCase() as ServiceCommerceBookingStatus
}

function persistenceStatus(value: ServiceCommerceBookingStatus) {
  return value.toUpperCase() as ServiceBookingStatus
}

function policyChannel(
  value: ServiceCommercePolicyChannel,
): "staff" | "web" | "whatsapp" {
  if (value === ServiceCommercePolicyChannel.WHATSAPP) return "whatsapp"
  if (value === ServiceCommercePolicyChannel.STAFF) return "staff"
  return "web"
}

async function synchronizeBookingServiceWork(
  tx: BookingTransaction,
  input: {
    actorUserId: string
    clientOperationId: string
    commercialOrderId: string | null
    effectiveAt: Date
    operation: "complete" | "start"
    serviceJobId: string | null
    storeId: string
    tenantId: string
  },
) {
  if (!input.serviceJobId) return
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "ServiceJob"
    WHERE "id" = ${input.serviceJobId}
      AND "tenantId" = ${input.tenantId}
      AND "storeId" = ${input.storeId}
    FOR UPDATE
  `
  if (locked.length === 0) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Linked Service Job was not found.",
    )
  }
  const job = await tx.serviceJob.findFirst({
    include: { lines: true },
    where: {
      commercialOrderId: input.commercialOrderId ?? undefined,
      id: input.serviceJobId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (
    !job ||
    (input.commercialOrderId &&
      job.commercialOrderId !== input.commercialOrderId)
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Linked Service Job does not belong to this booking Order.",
    )
  }
  const activeLines = job.lines.filter(
    (line) => line.status !== ServiceJobLineStatus.CANCELLED,
  )
  if (
    activeLines.some(
      (line) => line.authorizationStatus !== WorkAuthorizationStatus.AUTHORIZED,
    )
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_BLOCKED",
      "Service work must be authorized before the appointment can progress.",
    )
  }
  const eligibleStatuses: Set<ServiceJobLineStatus> =
    input.operation === "start"
      ? new Set([ServiceJobLineStatus.QUEUED, ServiceJobLineStatus.IN_PROGRESS])
      : new Set([
          ServiceJobLineStatus.IN_PROGRESS,
          ServiceJobLineStatus.READY_FOR_HANDOFF,
          ServiceJobLineStatus.COMPLETED,
        ])
  if (activeLines.some((line) => !eligibleStatuses.has(line.status))) {
    throw new ServiceCommerceBookingError(
      "BOOKING_BLOCKED",
      input.operation === "start"
        ? "Linked Service work is not ready to start."
        : "Linked Service work is not ready to complete.",
    )
  }
  const nextStatus =
    input.operation === "start"
      ? ServiceJobLineStatus.IN_PROGRESS
      : ServiceJobLineStatus.COMPLETED
  const effectiveAt = input.effectiveAt
  let changed = 0
  for (const line of activeLines) {
    if (line.status === nextStatus) continue
    const updated = await tx.serviceJobLine.updateMany({
      data: {
        completedAt:
          nextStatus === ServiceJobLineStatus.COMPLETED
            ? effectiveAt
            : undefined,
        revision: { increment: 1 },
        status: nextStatus,
      },
      where: { id: line.id, revision: line.revision },
    })
    if (updated.count !== 1) {
      throw new ServiceCommerceBookingError(
        "BOOKING_REVISION_CONFLICT",
        "Linked Service work changed. Refresh and try again.",
      )
    }
    changed += 1
    await tx.serviceWorkEvent.create({
      data: {
        actorUserId: input.actorUserId,
        clientCommandId: `${input.clientOperationId}:service-line:${line.id}`,
        effectiveAt,
        fromStatus: line.status,
        reason: `Appointment ${input.operation}`,
        serviceJobId: job.id,
        serviceJobLineId: line.id,
        source: "service_commerce_booking",
        tenantId: input.tenantId,
        toStatus: nextStatus,
        type: ServiceWorkEventType.STATUS_CHANGED,
      },
    })
  }
  if (changed > 0) {
    await tx.serviceJob.update({
      data: {
        completedAt: input.operation === "complete" ? effectiveAt : undefined,
        revision: { increment: 1 },
      },
      where: { id: job.id },
    })
  }
  if (input.operation === "complete" && input.commercialOrderId) {
    const incomplete = await tx.serviceJobLine.count({
      where: {
        commercialOrderLine: { orderId: input.commercialOrderId },
        status: {
          notIn: [
            ServiceJobLineStatus.COMPLETED,
            ServiceJobLineStatus.CANCELLED,
          ],
        },
      },
    })
    if (incomplete === 0) {
      await tx.commercialOrder.updateMany({
        data: { status: OrderStatus.COMPLETED },
        where: {
          id: input.commercialOrderId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
    }
  }
}

function paymentStatus(value: PaymentStatus | ServiceBookingPaymentStatus) {
  if (String(value) === "PAID") {
    return ServiceBookingPaymentStatus.PAID
  }
  if (String(value) === "PARTIALLY_PAID") {
    return ServiceBookingPaymentStatus.PARTIALLY_PAID
  }
  if (String(value) === "REFUNDED") {
    return ServiceBookingPaymentStatus.REFUNDED
  }
  return ServiceBookingPaymentStatus.PENDING
}

function safeBookingProjection(booking: {
  endAt: Date
  id: string
  paymentStatus: ServiceBookingPaymentStatus
  resource?: { name: string } | null
  revision: number
  startAt: Date
  status: ServiceBookingStatus
  timezoneSnapshot: string
}) {
  const status = bookingStatus(booking.status)
  return {
    endAt: booking.endAt,
    id: booking.id,
    nextOperations: [...deriveServiceCommerceBookingNextOperations(status)],
    paymentStatus: booking.paymentStatus.toLowerCase(),
    resourceLabel: booking.resource?.name ?? null,
    revision: booking.revision,
    startAt: booking.startAt,
    status,
    timezone: booking.timezoneSnapshot,
  }
}

async function lockResource(
  tx: BookingTransaction,
  input: { resourceId: string; storeId: string; tenantId: string },
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ServiceBookingResource"
    WHERE "id" = ${input.resourceId}
      AND "tenantId" = ${input.tenantId}
      AND "storeId" = ${input.storeId}
    FOR UPDATE
  `)
  if (rows.length !== 1) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Booking resource was not found.",
    )
  }
}

async function lockBooking(
  tx: BookingTransaction,
  input: { bookingId: string; storeId: string; tenantId: string },
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ServiceBooking"
    WHERE "id" = ${input.bookingId}
      AND "tenantId" = ${input.tenantId}
      AND "storeId" = ${input.storeId}
    FOR UPDATE
  `)
  if (rows.length !== 1) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Booking was not found.",
    )
  }
}

async function resolveCapability(
  tx: BookingTransaction,
  input: {
    accessToken: string
    now: Date
    purpose: ServiceBookingAccessPurpose
    status?: ServiceBookingAccessStatus | { in: ServiceBookingAccessStatus[] }
  },
) {
  const capability = await tx.serviceBookingAccessCapability.findFirst({
    include: { booking: true, offeringConfig: true },
    where: {
      expiresAt: { gt: input.now },
      purpose: input.purpose,
      status: input.status ?? ServiceBookingAccessStatus.ACTIVE,
      tokenDigest: bookingTokenDigest(input.accessToken),
    },
  })
  if (!capability) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Booking capability is unavailable.",
    )
  }
  return capability
}

/**
 * A manage capability is intentionally also a slot-reading capability for its
 * own booking. This is what makes a public reschedule possible after the
 * confirm capability has been rotated. Its booking revision must still match,
 * so a rotated or stale token cannot inspect fresh availability.
 */
async function resolveSlotCapability(
  tx: BookingTransaction,
  input: { accessToken: string; now: Date },
) {
  const capability = await tx.serviceBookingAccessCapability.findFirst({
    include: { booking: true, offeringConfig: true },
    where: {
      expiresAt: { gt: input.now },
      purpose: {
        in: [
          ServiceBookingAccessPurpose.VIEW_SLOTS,
          ServiceBookingAccessPurpose.VIEW_AND_MANAGE,
        ],
      },
      status: ServiceBookingAccessStatus.ACTIVE,
      tokenDigest: bookingTokenDigest(input.accessToken),
    },
  })
  if (
    !capability ||
    (capability.purpose === ServiceBookingAccessPurpose.VIEW_AND_MANAGE &&
      (!capability.booking ||
        capability.stateRevision !== capability.booking.revision))
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Booking capability is unavailable.",
    )
  }
  return capability
}

export async function resolveServiceCommerceBookingCapabilityScope(
  db: DbClient,
  input: {
    accessToken: string
    now?: Date
    purpose: "confirm" | "view_and_manage" | "view_slots"
  },
) {
  const now = input.now ?? new Date()
  const capability =
    input.purpose === "view_slots"
      ? await resolveSlotCapability(db as BookingTransaction, {
          accessToken: input.accessToken,
          now,
        })
      : await db.serviceBookingAccessCapability.findFirst({
          include: { booking: true, offeringConfig: true },
          where: {
            expiresAt: { gt: now },
            purpose:
              input.purpose === "confirm"
                ? ServiceBookingAccessPurpose.CONFIRM
                : ServiceBookingAccessPurpose.VIEW_AND_MANAGE,
            status: ServiceBookingAccessStatus.ACTIVE,
            tokenDigest: bookingTokenDigest(input.accessToken),
          },
        })
  if (!capability) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Booking capability is unavailable.",
    )
  }
  return {
    bookingId: capability.bookingId,
    offeringId: capability.offeringConfig.offeringId,
    source: bookingSourceRef({
      sourceId: capability.sourceId,
      sourceType: capability.sourceType,
    }),
    stateRevision: capability.stateRevision,
    storeId: capability.storeId,
    tenantId: capability.tenantId,
  }
}

async function loadSlotFacts(
  tx: BookingTransaction,
  input: {
    configId: string
    endAt: Date
    excludeBookingId?: string
    excludeHoldId?: string
    now: Date
    resourceId: string
    startAt: Date
    storeId: string
    tenantId: string
  },
) {
  const [config, resource, holds, bookings] = await Promise.all([
    tx.serviceBookingOfferingConfig.findFirst({
      include: {
        resources: { where: { resourceId: input.resourceId } },
        store: { include: { serviceBookingSettings: true } },
      },
      where: {
        id: input.configId,
        status: ServiceBookingRecordStatus.ACTIVE,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
    tx.serviceBookingResource.findFirst({
      include: {
        availability: {
          where: { status: ServiceBookingRecordStatus.ACTIVE },
        },
        exceptions: {
          where: {
            endAt: { gt: input.startAt },
            startAt: { lt: input.endAt },
            status: ServiceBookingRecordStatus.ACTIVE,
          },
        },
      },
      where: {
        id: input.resourceId,
        status: ServiceBookingRecordStatus.ACTIVE,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
    tx.serviceBookingHold.findMany({
      where: {
        endAt: { gt: input.startAt },
        expiresAt: { gt: input.now },
        id: input.excludeHoldId ? { not: input.excludeHoldId } : undefined,
        resourceId: input.resourceId,
        startAt: { lt: input.endAt },
        status: ServiceBookingHoldStatus.HELD,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
    tx.serviceBooking.findMany({
      where: {
        endAt: { gt: input.startAt },
        id: input.excludeBookingId
          ? { not: input.excludeBookingId }
          : undefined,
        resourceId: input.resourceId,
        startAt: { lt: input.endAt },
        status: {
          in: [
            ServiceBookingStatus.SCHEDULED,
            ServiceBookingStatus.CONFIRMED,
            ServiceBookingStatus.ARRIVED,
            ServiceBookingStatus.IN_SERVICE,
          ],
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
  ])
  const settings = config?.store.serviceBookingSettings
  if (!config || !resource || !settings || config.resources.length !== 1) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Active booking configuration or resource was not found.",
    )
  }
  const rulesById = new Map<
    string,
    {
      daysOfWeek: number[]
      endLocalTime: string
      id: string
      startLocalTime: string
    }
  >()
  for (const rule of resource.availability) {
    const current = rulesById.get(rule.clientRuleId) ?? {
      daysOfWeek: [],
      endLocalTime: `${String(Math.floor(rule.endMinute / 60)).padStart(2, "0")}:${String(rule.endMinute % 60).padStart(2, "0")}`,
      id: rule.clientRuleId,
      startLocalTime: `${String(Math.floor(rule.startMinute / 60)).padStart(2, "0")}:${String(rule.startMinute % 60).padStart(2, "0")}`,
    }
    if (!current.daysOfWeek.includes(rule.dayOfWeek)) {
      current.daysOfWeek.push(rule.dayOfWeek)
    }
    rulesById.set(rule.clientRuleId, current)
  }
  return {
    bookings: bookings.map((booking) => ({
      endAt: booking.endAt,
      quantity: booking.capacity,
      startAt: booking.startAt,
      status: bookingStatus(booking.status),
    })),
    config,
    evaluation: evaluateServiceCommerceBookingSlot({
      availability: {
        exceptions: resource.exceptions.map((exception) => {
          if (
            exception.kind ===
            ServiceBookingAvailabilityExceptionKind.CAPACITY_OVERRIDE
          ) {
            return {
              capacity: exception.capacity ?? 0,
              endAt: exception.endAt,
              id: exception.clientExceptionId,
              kind: "capacity_override" as const,
              startAt: exception.startAt,
            }
          }
          return {
            endAt: exception.endAt,
            id: exception.clientExceptionId,
            kind:
              exception.kind === ServiceBookingAvailabilityExceptionKind.OPEN
                ? ("open" as const)
                : ("closed" as const),
            startAt: exception.startAt,
          }
        }),
        rules: [...rulesById.values()],
        timezone: settings.timezone,
      },
      bookings: bookings.map((booking) => ({
        endAt: booking.endAt,
        quantity: booking.capacity,
        startAt: booking.startAt,
        status: bookingStatus(booking.status),
      })),
      capacity: resource.capacity,
      endAt: input.endAt,
      holds: holds.map((hold) => ({
        endAt: hold.endAt,
        expiresAt: hold.expiresAt,
        quantity: hold.capacity,
        startAt: hold.startAt,
        status: "active" as const,
      })),
      leadTimeMinutes: config.leadTimeMinutes,
      now: input.now,
      startAt: input.startAt,
    }),
    resource,
    settings,
  }
}

export async function createServiceCommerceBookingCapability(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    expiresAt: Date
    issueCapabilityToken: IssueServiceCommerceBookingCapabilityToken
    now?: Date
    offeringId: string
    source: ServiceCommerceSourceRef
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  if (
    input.expiresAt <= now ||
    input.expiresAt > new Date(now.getTime() + 30 * 86_400_000)
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_INVALID_INPUT",
      "Booking capability expiry is invalid.",
    )
  }
  const accessToken = input.issueCapabilityToken({
    clientOperationId: input.clientOperationId,
    purpose: "view_slots",
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  const payloadHash = bookingPayloadHash({
    expiresAt: input.expiresAt,
    offeringId: input.offeringId,
    source: input.source,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  try {
    const capability = await db.$transaction(async (tx) => {
      await assertBookingMember(tx, input)
      await assertBookingPolicy(tx, {
        ...input,
        channel: "staff",
        purpose: "booking_capability_create",
      })
      await assertBookingRuntimeReady(tx, input)
      await assertBookingSource(tx, input)
      const replay = await tx.serviceBookingAccessCapability.findFirst({
        where: {
          clientOperationId: input.clientOperationId,
          tenantId: input.tenantId,
        },
      })
      if (replay) {
        if (
          replay.payloadHash !== payloadHash ||
          replay.tokenDigest !== bookingTokenDigest(accessToken)
        ) {
          throw new ServiceCommerceBookingError(
            "BOOKING_IDEMPOTENCY_MISMATCH",
            "Booking capability identity was reused with different input.",
          )
        }
        return replay
      }
      const config = await tx.serviceBookingOfferingConfig.findFirst({
        where: {
          offeringId: input.offeringId,
          status: ServiceBookingRecordStatus.ACTIVE,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!config) {
        throw new ServiceCommerceBookingError(
          "BOOKING_NOT_FOUND",
          "Active booking configuration was not found.",
        )
      }
      return tx.serviceBookingAccessCapability.create({
        data: {
          clientOperationId: input.clientOperationId,
          expiresAt: input.expiresAt,
          offeringConfigId: config.id,
          payloadHash,
          purpose: ServiceBookingAccessPurpose.VIEW_SLOTS,
          sourceId: input.source.id,
          sourceType: bookingSourceType(input.source),
          stateRevision: config.revision,
          storeId: input.storeId,
          tenantId: input.tenantId,
          tokenDigest: bookingTokenDigest(accessToken),
        },
      })
    }, BOOKING_TRANSACTION_OPTIONS)
    return {
      accessToken,
      capabilityId: capability.id,
      expiresAt: capability.expiresAt,
    }
  } catch (error) {
    return translateBookingTransactionError(error)
  }
}

export async function getPublicServiceCommerceBookingSlots(
  db: PrismaClient,
  input: {
    accessToken: string
    from: Date
    now?: Date
    to: Date
  },
) {
  const now = input.now ?? new Date()
  // The public page and API cannot share an identical clock instant. Clamp a
  // just-elapsed page boundary to the authoritative server clock so network
  // latency never invalidates an otherwise current booking link.
  const effectiveFrom = input.from < now ? now : input.from
  if (
    input.to <= effectiveFrom ||
    input.to.getTime() - effectiveFrom.getTime() > 31 * 86_400_000
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_INVALID_INPUT",
      "Booking slot window is invalid.",
    )
  }
  return db.$transaction(async (tx) => {
    const capability = await resolveSlotCapability(tx, {
      accessToken: input.accessToken,
      now,
    })
    await assertBookingPolicy(tx, {
      actorUserId: PUBLIC_BOOKING_ACTOR,
      channel: "web",
      purpose: "booking_slots_public_projection",
      storeId: capability.storeId,
      tenantId: capability.tenantId,
    })
    await assertBookingRuntimeReady(tx, capability)
    await assertBookingSource(tx, {
      source: bookingSourceRef({
        sourceId: capability.sourceId,
        sourceType: capability.sourceType,
      }),
      storeId: capability.storeId,
      tenantId: capability.tenantId,
    })
    const config = await tx.serviceBookingOfferingConfig.findFirst({
      include: {
        resources: {
          include: {
            resource: {
              include: {
                availability: {
                  where: { status: ServiceBookingRecordStatus.ACTIVE },
                },
                exceptions: {
                  where: {
                    endAt: { gt: effectiveFrom },
                    startAt: { lt: input.to },
                    status: ServiceBookingRecordStatus.ACTIVE,
                  },
                },
              },
            },
          },
        },
        store: { include: { serviceBookingSettings: true } },
      },
      where: {
        id: capability.offeringConfigId,
        revision:
          capability.purpose === ServiceBookingAccessPurpose.VIEW_SLOTS
            ? capability.stateRevision
            : undefined,
        status: ServiceBookingRecordStatus.ACTIVE,
        storeId: capability.storeId,
        tenantId: capability.tenantId,
      },
    })
    const settings = config?.store.serviceBookingSettings
    if (!config || !settings) {
      throw new ServiceCommerceBookingError(
        "BOOKING_CONFIGURATION_CONFLICT",
        "Booking configuration changed. Request a new booking link.",
      )
    }
    const horizon = new Date(
      now.getTime() + config.bookingHorizonMinutes * 60_000,
    )
    const effectiveTo = input.to < horizon ? input.to : horizon
    const resourceIds = config.resources.map((entry) => entry.resourceId)
    const [holds, bookings] = await Promise.all([
      tx.serviceBookingHold.findMany({
        where: {
          endAt: { gt: effectiveFrom },
          expiresAt: { gt: now },
          resourceId: { in: resourceIds },
          startAt: { lt: effectiveTo },
          status: ServiceBookingHoldStatus.HELD,
          storeId: capability.storeId,
          tenantId: capability.tenantId,
        },
      }),
      tx.serviceBooking.findMany({
        where: {
          endAt: { gt: effectiveFrom },
          resourceId: { in: resourceIds },
          startAt: { lt: effectiveTo },
          status: {
            in: [
              ServiceBookingStatus.SCHEDULED,
              ServiceBookingStatus.CONFIRMED,
              ServiceBookingStatus.ARRIVED,
              ServiceBookingStatus.IN_SERVICE,
            ],
          },
          storeId: capability.storeId,
          tenantId: capability.tenantId,
        },
      }),
    ])
    const slots: Array<{
      endAt: Date
      remainingCapacity: number
      resourceId: string
      resourceLabel: string
      startAt: Date
    }> = []
    const intervalMs = settings.defaultSlotInterval * 60_000
    const firstStart = new Date(
      Math.ceil(effectiveFrom.getTime() / intervalMs) * intervalMs,
    )
    for (
      let startAt = firstStart;
      startAt < effectiveTo;
      startAt = new Date(startAt.getTime() + intervalMs)
    ) {
      const endAt = new Date(
        startAt.getTime() + config.durationMinutes * 60_000,
      )
      if (endAt > effectiveTo) break
      for (const entry of config.resources) {
        const resource = entry.resource
        const rulesById = new Map<
          string,
          {
            daysOfWeek: number[]
            endLocalTime: string
            id: string
            startLocalTime: string
          }
        >()
        for (const rule of resource.availability) {
          const current = rulesById.get(rule.clientRuleId) ?? {
            daysOfWeek: [],
            endLocalTime: `${String(Math.floor(rule.endMinute / 60)).padStart(2, "0")}:${String(rule.endMinute % 60).padStart(2, "0")}`,
            id: rule.clientRuleId,
            startLocalTime: `${String(Math.floor(rule.startMinute / 60)).padStart(2, "0")}:${String(rule.startMinute % 60).padStart(2, "0")}`,
          }
          if (!current.daysOfWeek.includes(rule.dayOfWeek)) {
            current.daysOfWeek.push(rule.dayOfWeek)
          }
          rulesById.set(rule.clientRuleId, current)
        }
        const evaluation = evaluateServiceCommerceBookingSlot({
          availability: {
            exceptions: resource.exceptions.map((exception) => {
              if (
                exception.kind ===
                ServiceBookingAvailabilityExceptionKind.CAPACITY_OVERRIDE
              ) {
                return {
                  capacity: exception.capacity ?? 0,
                  endAt: exception.endAt,
                  id: exception.clientExceptionId,
                  kind: "capacity_override" as const,
                  startAt: exception.startAt,
                }
              }
              return {
                endAt: exception.endAt,
                id: exception.clientExceptionId,
                kind:
                  exception.kind ===
                  ServiceBookingAvailabilityExceptionKind.OPEN
                    ? ("open" as const)
                    : ("closed" as const),
                startAt: exception.startAt,
              }
            }),
            rules: [...rulesById.values()],
            timezone: settings.timezone,
          },
          bookings: bookings
            .filter((booking) => booking.resourceId === resource.id)
            .map((booking) => ({
              endAt: booking.endAt,
              quantity: booking.capacity,
              startAt: booking.startAt,
              status: bookingStatus(booking.status),
            })),
          capacity: resource.capacity,
          endAt,
          holds: holds
            .filter((hold) => hold.resourceId === resource.id)
            .map((hold) => ({
              endAt: hold.endAt,
              expiresAt: hold.expiresAt,
              quantity: hold.capacity,
              startAt: hold.startAt,
              status: "active" as const,
            })),
          leadTimeMinutes: config.leadTimeMinutes,
          now,
          startAt,
        })
        if (evaluation.eligible) {
          slots.push({
            endAt,
            remainingCapacity: evaluation.remainingCapacity,
            resourceId: resource.id,
            resourceLabel: resource.name,
            startAt,
          })
        }
      }
    }
    await tx.serviceBookingAccessCapability.updateMany({
      data: { accessCount: { increment: 1 }, lastAccessedAt: now },
      where: {
        id: capability.id,
        stateRevision: capability.stateRevision,
        status: ServiceBookingAccessStatus.ACTIVE,
        storeId: capability.storeId,
        tenantId: capability.tenantId,
      },
    })
    return {
      configurationRevision: config.revision,
      offeringId: config.offeringId,
      slots,
      timezone: settings.timezone,
    }
  }, BOOKING_TRANSACTION_OPTIONS)
}

export async function createServiceCommerceBookingHold(
  db: PrismaClient,
  input: {
    accessToken?: string
    actorUserId?: string
    clientOperationId: string
    expectedConfigurationRevision: number
    issueCapabilityToken: IssueServiceCommerceBookingCapabilityToken
    now?: Date
    offeringId: string
    quantity: number
    resourceId: string
    slotEndAt: Date
    slotStartAt: Date
    source: ServiceCommerceSourceRef
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  const parsed = serviceCommerceBookingHoldCommandSchema.parse({
    clientOperationId: input.clientOperationId,
    expectedConfigurationRevision: input.expectedConfigurationRevision,
    operation: "hold_slot",
    quantity: input.quantity,
    resourceId: input.resourceId,
    slotEndAt: input.slotEndAt,
    slotStartAt: input.slotStartAt,
    source: input.source,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  const payloadHash = bookingPayloadHash(parsed)
  const confirmCapabilityOperationId = `${input.clientOperationId}:confirm`
  const confirmToken = input.issueCapabilityToken({
    clientOperationId: confirmCapabilityOperationId,
    purpose: "confirm",
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  try {
    const result = await db.$transaction(async (tx) => {
      let channel: "staff" | "web"
      if (input.actorUserId) {
        await assertBookingMember(tx, {
          actorUserId: input.actorUserId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
        channel = "staff"
      } else if (input.accessToken) {
        const capability = await resolveSlotCapability(tx, {
          accessToken: input.accessToken,
          now,
        })
        if (
          capability.tenantId !== input.tenantId ||
          capability.storeId !== input.storeId ||
          capability.sourceId !== input.source.id ||
          capability.sourceType !== bookingSourceType(input.source) ||
          capability.offeringConfig.offeringId !== input.offeringId ||
          (capability.purpose === ServiceBookingAccessPurpose.VIEW_SLOTS &&
            capability.stateRevision !== input.expectedConfigurationRevision)
        ) {
          throw new ServiceCommerceBookingError(
            "BOOKING_NOT_FOUND",
            "Booking capability is unavailable.",
          )
        }
        channel = "web"
      } else {
        throw new ServiceCommerceBookingError(
          "BOOKING_FORBIDDEN",
          "A Store operator or customer capability is required.",
        )
      }
      await assertBookingPolicy(tx, {
        actorUserId: input.actorUserId ?? PUBLIC_BOOKING_ACTOR,
        channel,
        purpose: "booking_hold",
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      await assertBookingRuntimeReady(tx, input)
      await assertBookingSource(tx, input)
      await lockResource(tx, input)
      const replay = await tx.serviceBookingHold.findFirst({
        include: { accessCapability: true },
        where: {
          clientHoldId: input.clientOperationId,
          tenantId: input.tenantId,
        },
      })
      if (replay) {
        if (replay.payloadHash !== payloadHash) {
          throw new ServiceCommerceBookingError(
            "BOOKING_IDEMPOTENCY_MISMATCH",
            "Booking hold identity was reused with different input.",
          )
        }
        return {
          hold: replay,
          token:
            replay.accessCapability.tokenDigest ===
            bookingTokenDigest(confirmToken)
              ? confirmToken
              : null,
        }
      }
      const config = await tx.serviceBookingOfferingConfig.findFirst({
        where: {
          offeringId: input.offeringId,
          revision: input.expectedConfigurationRevision,
          status: ServiceBookingRecordStatus.ACTIVE,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!config) {
        throw new ServiceCommerceBookingError(
          "BOOKING_CONFIGURATION_CONFLICT",
          "Booking configuration changed. Refresh available slots.",
        )
      }
      const horizon = new Date(
        now.getTime() + config.bookingHorizonMinutes * 60_000,
      )
      const expectedEnd = new Date(
        input.slotStartAt.getTime() + config.durationMinutes * 60_000,
      )
      if (expectedEnd.getTime() !== input.slotEndAt.getTime()) {
        throw new ServiceCommerceBookingError(
          "BOOKING_INVALID_INPUT",
          "Selected slot must use the configured booking duration.",
        )
      }
      if (input.slotStartAt > horizon || input.slotEndAt > horizon) {
        throw new ServiceCommerceBookingError(
          "BOOKING_BLOCKED",
          "Selected slot is outside the booking horizon.",
        )
      }
      const facts = await loadSlotFacts(tx, {
        configId: config.id,
        endAt: input.slotEndAt,
        now,
        resourceId: input.resourceId,
        startAt: input.slotStartAt,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      if (
        !facts.evaluation.eligible ||
        facts.evaluation.remainingCapacity < input.quantity
      ) {
        throw new ServiceCommerceBookingError(
          "BOOKING_CAPACITY_CONFLICT",
          "Selected slot is no longer available.",
        )
      }
      const expiresAt = new Date(
        Math.min(
          input.slotStartAt.getTime() - 1,
          now.getTime() + config.holdDurationMinutes * 60_000,
        ),
      )
      const accessCapability = await tx.serviceBookingAccessCapability.create({
        data: {
          clientOperationId: confirmCapabilityOperationId,
          expiresAt,
          offeringConfigId: config.id,
          payloadHash,
          purpose: ServiceBookingAccessPurpose.CONFIRM,
          sourceId: input.source.id,
          sourceType: bookingSourceType(input.source),
          stateRevision: config.revision,
          storeId: input.storeId,
          tenantId: input.tenantId,
          tokenDigest: bookingTokenDigest(confirmToken),
        },
      })
      const hold = await tx.serviceBookingHold.create({
        data: {
          accessCapabilityId: accessCapability.id,
          bookingPolicyRevision: config.revision,
          capacity: input.quantity,
          clientHoldId: input.clientOperationId,
          expiresAt,
          offeringConfigId: config.id,
          payloadHash,
          resourceId: input.resourceId,
          sourceId: input.source.id,
          sourceType: bookingSourceType(input.source),
          startAt: input.slotStartAt,
          endAt: input.slotEndAt,
          storeId: input.storeId,
          tenantId: input.tenantId,
          createdByUserId: input.actorUserId,
        },
      })
      return { hold, token: confirmToken as string | null }
    }, BOOKING_TRANSACTION_OPTIONS)
    return {
      accessToken: result.token,
      expiresAt: result.hold.expiresAt,
      id: result.hold.id,
      status: result.hold.status.toLowerCase(),
    }
  } catch (error) {
    if (isRetriableBookingCapacityError(error)) {
      throw new ServiceCommerceBookingError(
        "BOOKING_CAPACITY_CONFLICT",
        "Selected slot changed concurrently. Refresh available slots.",
      )
    }
    return translateBookingTransactionError(error)
  }
}

async function resolvePaymentSnapshot(
  tx: BookingTransaction,
  input: {
    commercialOrderId?: string
    config: {
      depositAmountMinor: number | null
      paymentPolicyRevision: number
      paymentRequirement: ServiceBookingPaymentRequirement
    }
    quoteVersionId?: string
    sourceId: string
    storeId: string
    tenantId: string
  },
) {
  const version = input.quoteVersionId
    ? await tx.commerceQuoteVersion.findFirst({
        include: { quote: true },
        where: {
          id: input.quoteVersionId,
          quote: {
            sourceId: input.sourceId,
            sourceType: CommerceQuoteSourceType.SERVICE_REQUEST,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
          status: CommerceQuoteVersionStatus.ACCEPTED,
        },
      })
    : null
  const order = input.commercialOrderId
    ? await tx.commercialOrder.findFirst({
        select: {
          acceptedCommerceQuoteVersion: { select: { id: true } },
          currencyCode: true,
          paymentStatus: true,
          totalMinor: true,
        },
        where: {
          id: input.commercialOrderId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
    : null
  if (input.quoteVersionId && !version) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Eligible Commerce Quote was not found for booking.",
    )
  }
  if (input.commercialOrderId && !order) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Eligible Commerce Order was not found for booking.",
    )
  }
  if (
    order &&
    version &&
    order.acceptedCommerceQuoteVersion?.id !== version.id
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_INVALID_INPUT",
      "Booking Order does not belong to the selected Quote version.",
    )
  }
  const payableAmountMinor = order?.totalMinor ?? version?.totalMinor ?? 0
  const currencyCode = order?.currencyCode ?? version?.currencyCode
  if (
    input.config.paymentRequirement !== ServiceBookingPaymentRequirement.NONE &&
    (!currencyCode || (!order && !version))
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_BLOCKED",
      "This booking requires an accepted Commerce payment context.",
    )
  }
  const requiredPaymentMinor =
    input.config.paymentRequirement === ServiceBookingPaymentRequirement.DEPOSIT
      ? (input.config.depositAmountMinor ?? 0)
      : input.config.paymentRequirement ===
          ServiceBookingPaymentRequirement.FULL
        ? payableAmountMinor
        : 0
  if (
    requiredPaymentMinor < 0 ||
    requiredPaymentMinor > payableAmountMinor ||
    (input.config.paymentRequirement ===
      ServiceBookingPaymentRequirement.DEPOSIT &&
      requiredPaymentMinor === 0)
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_CONFIGURATION_CONFLICT",
      "Booking payment policy is invalid for the payable amount.",
    )
  }
  return {
    currencyCode: currencyCode ?? "NGN",
    depositAmountMinor: input.config.depositAmountMinor,
    payableAmountMinor,
    paymentStatus:
      input.config.paymentRequirement === ServiceBookingPaymentRequirement.NONE
        ? ServiceBookingPaymentStatus.NOT_REQUIRED
        : order
          ? paymentStatus(order.paymentStatus)
          : ServiceBookingPaymentStatus.PENDING,
    requiredPaymentMinor,
  }
}

export async function confirmServiceCommerceBooking(
  db: PrismaClient,
  input: {
    accessToken?: string
    actorUserId?: string
    clientBookingId?: string
    clientOperationId: string
    commercialOrderId?: string
    holdId: string
    issueCapabilityToken: IssueServiceCommerceBookingCapabilityToken
    now?: Date
    protectRecipient: (value: string) => string
    quoteVersionId?: string
    serviceJobId?: string
    source: ServiceCommerceSourceRef
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  const payloadHash = bookingPayloadHash({
    clientBookingId: input.clientBookingId ?? input.clientOperationId,
    commercialOrderId: input.commercialOrderId ?? null,
    holdId: input.holdId,
    quoteVersionId: input.quoteVersionId ?? null,
    serviceJobId: input.serviceJobId ?? null,
    source: input.source,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  const manageCapabilityOperationId = `${input.clientOperationId}:manage`
  const manageToken = input.issueCapabilityToken({
    clientOperationId: manageCapabilityOperationId,
    purpose: "view_and_manage",
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  try {
    const result = await db.$transaction(async (tx) => {
      let channel: "staff" | "web"
      let customerConfirmCapabilityStatus: ServiceBookingAccessStatus | null =
        null
      if (input.actorUserId) {
        await assertBookingMember(tx, {
          actorUserId: input.actorUserId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
        channel = "staff"
      } else if (input.accessToken) {
        const capability = await resolveCapability(tx, {
          accessToken: input.accessToken,
          now,
          purpose: ServiceBookingAccessPurpose.CONFIRM,
          status: {
            in: [
              ServiceBookingAccessStatus.ACTIVE,
              ServiceBookingAccessStatus.ROTATED,
            ],
          },
        })
        if (
          capability.tenantId !== input.tenantId ||
          capability.storeId !== input.storeId ||
          capability.sourceId !== input.source.id
        ) {
          throw new ServiceCommerceBookingError(
            "BOOKING_NOT_FOUND",
            "Booking capability is unavailable.",
          )
        }
        customerConfirmCapabilityStatus = capability.status
        channel = "web"
      } else {
        throw new ServiceCommerceBookingError(
          "BOOKING_FORBIDDEN",
          "Booking confirmation is unauthorized.",
        )
      }
      await assertBookingPolicy(tx, {
        actorUserId: input.actorUserId ?? PUBLIC_BOOKING_ACTOR,
        channel,
        purpose: "booking_confirm",
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      await assertBookingRuntimeReady(tx, input)
      const sourceRequest = await assertBookingSource(tx, input)
      const replay = await tx.serviceBooking.findFirst({
        include: { resource: true },
        where: {
          clientBookingId: input.clientBookingId ?? input.clientOperationId,
          tenantId: input.tenantId,
        },
      })
      if (replay) {
        if (replay.payloadHash !== payloadHash) {
          throw new ServiceCommerceBookingError(
            "BOOKING_IDEMPOTENCY_MISMATCH",
            "Booking identity was reused with different input.",
          )
        }
        const capability = await tx.serviceBookingAccessCapability.findFirst({
          where: {
            bookingId: replay.id,
            clientOperationId: manageCapabilityOperationId,
            status: ServiceBookingAccessStatus.ACTIVE,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        const notificationIntents =
          await tx.serviceBookingNotificationIntent.findMany({
            select: { authorizationUserId: true, id: true },
            where: {
              bookingId: replay.id,
              status: ServiceBookingNotificationStatus.PENDING,
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          })
        return {
          booking: replay,
          notificationDispatches: notificationIntents.map((intent) => ({
            actorUserId: intent.authorizationUserId,
            intentId: intent.id,
          })),
          token:
            capability?.tokenDigest === bookingTokenDigest(manageToken)
              ? manageToken
              : null,
        }
      }
      if (
        channel === "web" &&
        customerConfirmCapabilityStatus !== ServiceBookingAccessStatus.ACTIVE
      ) {
        throw new ServiceCommerceBookingError(
          "BOOKING_NOT_FOUND",
          "Booking capability is unavailable.",
        )
      }
      const hold = await tx.serviceBookingHold.findFirst({
        include: {
          accessCapability: true,
          offeringConfig: {
            include: { store: { include: { serviceBookingSettings: true } } },
          },
        },
        where: {
          expiresAt: { gt: now },
          id: input.holdId,
          sourceId: input.source.id,
          sourceType: bookingSourceType(input.source),
          status: ServiceBookingHoldStatus.HELD,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!hold || !hold.offeringConfig.store.serviceBookingSettings) {
        throw new ServiceCommerceBookingError(
          "BOOKING_NOT_FOUND",
          "Active booking hold was not found.",
        )
      }
      if (
        input.accessToken &&
        hold.accessCapability.tokenDigest !==
          bookingTokenDigest(input.accessToken)
      ) {
        throw new ServiceCommerceBookingError(
          "BOOKING_NOT_FOUND",
          "Booking capability is unavailable.",
        )
      }
      await lockResource(tx, {
        resourceId: hold.resourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      const config = hold.offeringConfig
      if (
        config.status !== ServiceBookingRecordStatus.ACTIVE ||
        config.revision !== hold.bookingPolicyRevision
      ) {
        throw new ServiceCommerceBookingError(
          "BOOKING_CONFIGURATION_CONFLICT",
          "Booking policy changed. Select a new slot.",
        )
      }
      const facts = await loadSlotFacts(tx, {
        configId: config.id,
        endAt: hold.endAt,
        excludeHoldId: hold.id,
        now,
        resourceId: hold.resourceId,
        startAt: hold.startAt,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      if (
        !facts.evaluation.eligible ||
        facts.evaluation.remainingCapacity < hold.capacity
      ) {
        throw new ServiceCommerceBookingError(
          "BOOKING_CAPACITY_CONFLICT",
          "Booking slot is no longer eligible.",
        )
      }
      const payment = await resolvePaymentSnapshot(tx, {
        commercialOrderId: input.commercialOrderId,
        config,
        quoteVersionId: input.quoteVersionId,
        sourceId: input.source.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      const recipientCiphertext =
        sourceRequest.contactOptIn && sourceRequest.customerPhone
          ? input.protectRecipient(sourceRequest.customerPhone)
          : null
      const notificationChannel =
        sourceRequest.channelOrigin === "WHATSAPP"
          ? ServiceNotificationChannel.WHATSAPP
          : ServiceNotificationChannel.SMS
      const notificationPolicyChannel =
        sourceRequest.channelOrigin === "WHATSAPP"
          ? ServiceCommercePolicyChannel.WHATSAPP
          : sourceRequest.channelOrigin === "STAFF"
            ? ServiceCommercePolicyChannel.STAFF
            : ServiceCommercePolicyChannel.WEB
      const notificationAllowed = recipientCiphertext
        ? await bookingNotificationPolicyAllowed(tx, {
            actorUserId: input.actorUserId ?? PUBLIC_BOOKING_ACTOR,
            channel: policyChannel(notificationPolicyChannel),
            purpose: "booking_confirmation_notification_create",
            storeId: input.storeId,
            tenantId: input.tenantId,
          })
        : false
      const notificationAuthorizer = notificationAllowed
        ? await resolveBookingNotificationAuthorizer(tx, input)
        : null
      if (notificationAllowed && !notificationAuthorizer) {
        throw new ServiceCommerceBookingError(
          "BOOKING_BLOCKED",
          "An active Store attendant is required to authorize booking notifications.",
        )
      }
      if (input.serviceJobId) {
        const job = await tx.serviceJob.findFirst({
          select: { commercialOrderId: true, id: true },
          where: {
            id: input.serviceJobId,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        if (
          !job ||
          !input.commercialOrderId ||
          job.commercialOrderId !== input.commercialOrderId
        ) {
          throw new ServiceCommerceBookingError(
            "BOOKING_NOT_FOUND",
            "Service Job is unavailable or does not belong to this booking Order.",
          )
        }
      }
      const booking = await tx.serviceBooking.create({
        data: {
          cancellationPolicyRevisionSnapshot: config.cancellationPolicyRevision,
          cancellationWindowSnapshot: config.cancellationWindowMinutes,
          capacity: hold.capacity,
          clientBookingId: input.clientBookingId ?? input.clientOperationId,
          commercialOrderId: input.commercialOrderId,
          createdByUserId: input.actorUserId,
          currencyCodeSnapshot: payment.currencyCode,
          customerContactCiphertext: recipientCiphertext,
          customerName: sourceRequest.customerName,
          depositAmountMinorSnapshot: payment.depositAmountMinor,
          endAt: hold.endAt,
          holdId: hold.id,
          offeringConfigId: config.id,
          offeringPolicyRevisionSnapshot: config.revision,
          payableAmountMinorSnapshot: payment.payableAmountMinor,
          paymentPolicyRevisionSnapshot: config.paymentPolicyRevision,
          paymentRequirementSnapshot: config.paymentRequirement,
          paymentStatus: payment.paymentStatus,
          payloadHash,
          notificationChannelSnapshot: notificationAllowed
            ? notificationChannel
            : null,
          notificationPolicyChannelSnapshot: notificationAllowed
            ? notificationPolicyChannel
            : null,
          reminderLeadMinutesSnapshot:
            hold.offeringConfig.store.serviceBookingSettings
              .reminderLeadMinutes,
          quoteVersionId: input.quoteVersionId,
          refundPolicySnapshot: config.refundPolicy,
          requiredPaymentMinorSnapshot: payment.requiredPaymentMinor,
          resourceId: hold.resourceId,
          serviceJobId: input.serviceJobId,
          sourceId: input.source.id,
          sourceType: bookingSourceType(input.source),
          startAt: hold.startAt,
          status: ServiceBookingStatus.CONFIRMED,
          storeId: input.storeId,
          tenantId: input.tenantId,
          timezoneSnapshot:
            hold.offeringConfig.store.serviceBookingSettings.timezone,
          confirmedAt: now,
        },
        include: { resource: true },
      })
      const updatedHold = await tx.serviceBookingHold.updateMany({
        data: { confirmedAt: now, status: ServiceBookingHoldStatus.CONFIRMED },
        where: {
          id: hold.id,
          status: ServiceBookingHoldStatus.HELD,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (updatedHold.count !== 1) {
        throw new ServiceCommerceBookingError(
          "BOOKING_CAPACITY_CONFLICT",
          "Booking hold changed concurrently.",
        )
      }
      await tx.serviceBookingAccessCapability.updateMany({
        data: { status: ServiceBookingAccessStatus.ROTATED },
        where: {
          id: hold.accessCapabilityId,
          status: ServiceBookingAccessStatus.ACTIVE,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      await tx.serviceBookingAccessCapability.create({
        data: {
          bookingId: booking.id,
          clientOperationId: manageCapabilityOperationId,
          expiresAt: new Date(
            now.getTime() + MANAGE_CAPABILITY_MINUTES * 60_000,
          ),
          offeringConfigId: config.id,
          payloadHash,
          purpose: ServiceBookingAccessPurpose.VIEW_AND_MANAGE,
          rotatedFromId: hold.accessCapabilityId,
          sourceId: input.source.id,
          sourceType: bookingSourceType(input.source),
          stateRevision: booking.revision,
          storeId: input.storeId,
          tenantId: input.tenantId,
          tokenDigest: bookingTokenDigest(manageToken),
        },
      })
      await tx.serviceBookingEvent.create({
        data: {
          actorUserId: input.actorUserId,
          cancellationPolicyRevisionSnapshot: config.cancellationPolicyRevision,
          capacitySnapshot: hold.capacity,
          clientOperationId: input.clientOperationId,
          nextEndAt: hold.endAt,
          nextResourceId: hold.resourceId,
          nextStartAt: hold.startAt,
          offeringPolicyRevisionSnapshot: config.revision,
          payloadHash,
          paymentPolicyRevisionSnapshot: config.paymentPolicyRevision,
          storeId: input.storeId,
          tenantId: input.tenantId,
          toStatus: ServiceBookingStatus.CONFIRMED,
          type: ServiceBookingEventType.CONFIRMED,
          bookingId: booking.id,
        },
      })
      const notificationDispatches: Array<{
        actorUserId: string
        intentId: string
      }> = []
      if (
        recipientCiphertext &&
        notificationAllowed &&
        notificationAuthorizer
      ) {
        const confirmationIntent =
          await tx.serviceBookingNotificationIntent.create({
            data: {
              authorizationUserId: notificationAuthorizer,
              bookingId: booking.id,
              channel: notificationChannel,
              deduplicationKey: `booking-confirmation:${booking.id}:0`,
              policyChannel: notificationPolicyChannel,
              recipientCiphertext,
              scheduledFor: now,
              storeId: input.storeId,
              tenantId: input.tenantId,
              type: ServiceBookingNotificationType.CONFIRMATION,
            },
          })
        notificationDispatches.push({
          actorUserId: notificationAuthorizer,
          intentId: confirmationIntent.id,
        })
        if (booking.reminderLeadMinutesSnapshot > 0) {
          const reminderScheduledFor = new Date(
            Math.max(
              now.getTime(),
              booking.startAt.getTime() -
                booking.reminderLeadMinutesSnapshot * 60_000,
            ),
          )
          const reminderIntent =
            await tx.serviceBookingNotificationIntent.create({
              data: {
                authorizationUserId: notificationAuthorizer,
                bookingId: booking.id,
                channel: notificationChannel,
                deduplicationKey: `booking-reminder:${booking.id}:0:${booking.startAt.toISOString()}`,
                policyChannel: notificationPolicyChannel,
                recipientCiphertext,
                scheduledFor: reminderScheduledFor,
                storeId: input.storeId,
                tenantId: input.tenantId,
                type: ServiceBookingNotificationType.REMINDER,
              },
            })
          if (reminderScheduledFor <= now) {
            notificationDispatches.push({
              actorUserId: notificationAuthorizer,
              intentId: reminderIntent.id,
            })
          }
        }
      }
      return {
        booking,
        notificationDispatches,
        token: manageToken as string | null,
      }
    }, BOOKING_TRANSACTION_OPTIONS)
    return {
      ...safeBookingProjection(result.booking),
      accessToken: result.token,
      notificationDispatches: result.notificationDispatches,
    }
  } catch (error) {
    return translateBookingTransactionError(error)
  }
}

function targetStatus(
  operation: "arrive" | "cancel" | "complete" | "mark_no_show" | "start",
) {
  if (operation === "arrive") return "arrived" as const
  if (operation === "cancel") return "cancelled" as const
  if (operation === "complete") return "completed" as const
  if (operation === "mark_no_show") return "no_show" as const
  return "in_service" as const
}

export async function reviseServiceCommerceBooking(
  db: PrismaClient,
  input: {
    accessToken?: string
    actorUserId?: string
    bookingId: string
    clientOperationId: string
    expectedRevision: number
    issueCapabilityToken: IssueServiceCommerceBookingCapabilityToken
    newSlotEndAt?: Date
    newSlotStartAt?: Date
    now?: Date
    operation:
      | "arrive"
      | "cancel"
      | "complete"
      | "mark_no_show"
      | "reschedule"
      | "start"
    reasonCode?: string
    resourceId?: string
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  const payloadHash = bookingPayloadHash({
    bookingId: input.bookingId,
    expectedRevision: input.expectedRevision,
    newSlotEndAt: input.newSlotEndAt ?? null,
    newSlotStartAt: input.newSlotStartAt ?? null,
    operation: input.operation,
    reasonCode: input.reasonCode ?? null,
    resourceId: input.resourceId ?? null,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  const nextCapabilityOperationId = `${input.clientOperationId}:manage`
  const nextToken = input.issueCapabilityToken({
    clientOperationId: nextCapabilityOperationId,
    purpose: "view_and_manage",
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  try {
    const result = await db.$transaction(async (tx) => {
      let channel: "staff" | "web"
      if (input.actorUserId) {
        await assertBookingMember(tx, {
          actorUserId: input.actorUserId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
        channel = "staff"
      } else if (input.accessToken) {
        const capability = await resolveCapability(tx, {
          accessToken: input.accessToken,
          now,
          purpose: ServiceBookingAccessPurpose.VIEW_AND_MANAGE,
          status: {
            in: [
              ServiceBookingAccessStatus.ACTIVE,
              ServiceBookingAccessStatus.ROTATED,
            ],
          },
        })
        if (capability.bookingId !== input.bookingId) {
          throw new ServiceCommerceBookingError(
            "BOOKING_NOT_FOUND",
            "Booking capability is unavailable.",
          )
        }
        channel = "web"
      } else {
        throw new ServiceCommerceBookingError(
          "BOOKING_FORBIDDEN",
          "Booking operation is unauthorized.",
        )
      }
      await assertBookingPolicy(tx, {
        actorUserId: input.actorUserId ?? PUBLIC_BOOKING_ACTOR,
        channel,
        purpose: `booking_${input.operation}`,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      await assertBookingRuntimeReady(tx, input)
      await lockBooking(tx, input)
      const replay = await tx.serviceBookingEvent.findFirst({
        include: { booking: { include: { resource: true } } },
        where: {
          clientOperationId: input.clientOperationId,
          tenantId: input.tenantId,
        },
      })
      if (replay) {
        if (
          replay.payloadHash !== payloadHash ||
          replay.bookingId !== input.bookingId
        ) {
          throw new ServiceCommerceBookingError(
            "BOOKING_IDEMPOTENCY_MISMATCH",
            "Booking operation identity was reused with different input.",
          )
        }
        const capability = await tx.serviceBookingAccessCapability.findFirst({
          where: {
            bookingId: replay.bookingId,
            clientOperationId: nextCapabilityOperationId,
            status: ServiceBookingAccessStatus.ACTIVE,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        const notificationIntents =
          await tx.serviceBookingNotificationIntent.findMany({
            select: { authorizationUserId: true, id: true },
            where: {
              bookingId: replay.bookingId,
              deduplicationKey: {
                startsWith: `booking-${input.operation}:${replay.bookingId}:${replay.booking.revision}`,
              },
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          })
        return {
          booking: replay.booking,
          notificationDispatches: notificationIntents.map((intent) => ({
            actorUserId: intent.authorizationUserId,
            intentId: intent.id,
          })),
          refund: null,
          token:
            capability?.tokenDigest === bookingTokenDigest(nextToken)
              ? nextToken
              : null,
        }
      }
      const booking = await tx.serviceBooking.findFirst({
        include: { offeringConfig: true, resource: true },
        where: {
          id: input.bookingId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!booking) {
        throw new ServiceCommerceBookingError(
          "BOOKING_NOT_FOUND",
          "Booking was not found.",
        )
      }
      if (booking.revision !== input.expectedRevision) {
        throw new ServiceCommerceBookingError(
          "BOOKING_REVISION_CONFLICT",
          "Booking changed. Refresh and try again.",
        )
      }
      const currentStatus = bookingStatus(booking.status)
      const nextStatus =
        input.operation === "reschedule"
          ? currentStatus
          : targetStatus(input.operation)
      if (input.operation === "reschedule" && currentStatus !== "confirmed") {
        throw new ServiceCommerceBookingError(
          "BOOKING_BLOCKED",
          "Only a confirmed booking can be rescheduled.",
        )
      }
      if (nextStatus !== currentStatus) {
        assertServiceCommerceBookingTransition(currentStatus, nextStatus)
      }
      if (
        (input.operation === "cancel" ||
          input.operation === "mark_no_show" ||
          input.operation === "reschedule") &&
        !input.reasonCode?.trim()
      ) {
        throw new ServiceCommerceBookingError(
          "BOOKING_INVALID_INPUT",
          "This booking operation requires a structured reason code.",
        )
      }
      let nextStartAt = booking.startAt
      let nextEndAt = booking.endAt
      let nextResourceId = booking.resourceId
      if (input.operation === "reschedule") {
        if (!input.newSlotStartAt || !input.newSlotEndAt || !input.resourceId) {
          throw new ServiceCommerceBookingError(
            "BOOKING_INVALID_INPUT",
            "Reschedule requires a resource and complete slot.",
          )
        }
        await lockResource(tx, {
          resourceId: input.resourceId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
        const facts = await loadSlotFacts(tx, {
          configId: booking.offeringConfigId,
          endAt: input.newSlotEndAt,
          excludeBookingId: booking.id,
          now,
          resourceId: input.resourceId,
          startAt: input.newSlotStartAt,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
        const expectedEnd = new Date(
          input.newSlotStartAt.getTime() +
            facts.config.durationMinutes * 60_000,
        )
        if (expectedEnd.getTime() !== input.newSlotEndAt.getTime()) {
          throw new ServiceCommerceBookingError(
            "BOOKING_INVALID_INPUT",
            "Rescheduled slot must use the configured booking duration.",
          )
        }
        const horizon = new Date(
          now.getTime() + facts.config.bookingHorizonMinutes * 60_000,
        )
        if (input.newSlotStartAt > horizon || input.newSlotEndAt > horizon) {
          throw new ServiceCommerceBookingError(
            "BOOKING_BLOCKED",
            "Rescheduled slot is outside the booking horizon.",
          )
        }
        if (
          !facts.evaluation.eligible ||
          facts.evaluation.remainingCapacity < booking.capacity
        ) {
          throw new ServiceCommerceBookingError(
            "BOOKING_CAPACITY_CONFLICT",
            "Rescheduled slot is no longer available.",
          )
        }
        nextStartAt = input.newSlotStartAt
        nextEndAt = input.newSlotEndAt
        nextResourceId = input.resourceId
      }
      let refund: ReturnType<
        typeof projectServiceCommerceBookingCancellationConsequence
      > | null = null
      let refundOutcome: ServiceBookingRefundOutcome | null = null
      let refundAmountMinor: number | null = null
      if (input.operation === "cancel") {
        const cancellationAllowed =
          now.getTime() <=
          booking.startAt.getTime() -
            booking.cancellationWindowSnapshot * 60_000
        if (!cancellationAllowed && channel === "web") {
          throw new ServiceCommerceBookingError(
            "BOOKING_BLOCKED",
            "This booking is outside the customer cancellation window.",
          )
        }
        const paymentTotals = booking.commercialOrderId
          ? await tx.commercialOrderPayment.groupBy({
              _sum: { amountMinor: true },
              by: ["type"],
              where: {
                orderId: booking.commercialOrderId,
                storeId: input.storeId,
                tenantId: input.tenantId,
                type: {
                  in: [
                    CommercialPaymentType.PAYMENT,
                    CommercialPaymentType.REFUND,
                  ],
                },
              },
            })
          : []
        const netPaidMinor = paymentTotals.reduce(
          (total, row) =>
            total +
            (row.type === CommercialPaymentType.REFUND ? -1 : 1) *
              (row._sum.amountMinor ?? 0),
          0,
        )
        const refundableAmountMinor = Math.min(
          Math.max(0, netPaidMinor),
          booking.requiredPaymentMinorSnapshot,
        )
        const policy =
          booking.refundPolicySnapshot ===
          ServiceBookingRefundPolicy.FULL_BEFORE_CUTOFF
            ? "full_before_cutoff"
            : booking.refundPolicySnapshot ===
                ServiceBookingRefundPolicy.MANUAL_REVIEW
              ? "manual_review"
              : "none"
        refund = projectServiceCommerceBookingCancellationConsequence({
          bookingId: booking.id,
          cancellationAllowed,
          policy,
          refundableAmountMinor,
          stateRevision: booking.revision + 1,
        })
        refundOutcome =
          refund.refundOutcome === "refund_eligible"
            ? ServiceBookingRefundOutcome.REFUND_ELIGIBLE
            : refund.refundOutcome === "manual_review"
              ? ServiceBookingRefundOutcome.MANUAL_REVIEW
              : ServiceBookingRefundOutcome.NONE
        refundAmountMinor = refund.refundAmountMinor
      }
      if (input.operation === "start" || input.operation === "complete") {
        if (!input.actorUserId) {
          throw new ServiceCommerceBookingError(
            "BOOKING_FORBIDDEN",
            "Only an authorized Store attendant can progress Service work.",
          )
        }
        await synchronizeBookingServiceWork(tx, {
          actorUserId: input.actorUserId,
          clientOperationId: input.clientOperationId,
          commercialOrderId: booking.commercialOrderId,
          effectiveAt: now,
          operation: input.operation,
          serviceJobId: booking.serviceJobId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
      }
      const updated = await tx.serviceBooking.updateMany({
        data: {
          arrivedAt: input.operation === "arrive" ? now : undefined,
          cancelledAt: input.operation === "cancel" ? now : undefined,
          completedAt: input.operation === "complete" ? now : undefined,
          endAt: nextEndAt,
          noShowAt: input.operation === "mark_no_show" ? now : undefined,
          resourceId: nextResourceId,
          revision: { increment: 1 },
          serviceStartedAt: input.operation === "start" ? now : undefined,
          startAt: nextStartAt,
          status: persistenceStatus(nextStatus),
        },
        where: {
          id: booking.id,
          revision: input.expectedRevision,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (updated.count !== 1) {
        throw new ServiceCommerceBookingError(
          "BOOKING_REVISION_CONFLICT",
          "Booking changed. Refresh and try again.",
        )
      }
      const eventType = {
        arrive: ServiceBookingEventType.ARRIVED,
        cancel: ServiceBookingEventType.CANCELLED,
        complete: ServiceBookingEventType.COMPLETED,
        mark_no_show: ServiceBookingEventType.NO_SHOW,
        reschedule: ServiceBookingEventType.RESCHEDULED,
        start: ServiceBookingEventType.IN_SERVICE,
      }[input.operation]
      await tx.serviceBookingEvent.create({
        data: {
          actorUserId: input.actorUserId,
          bookingId: booking.id,
          cancellationPolicyRevisionSnapshot:
            booking.cancellationPolicyRevisionSnapshot,
          capacitySnapshot: booking.capacity,
          clientOperationId: input.clientOperationId,
          fromStatus: booking.status,
          nextEndAt,
          nextResourceId,
          nextStartAt,
          offeringPolicyRevisionSnapshot:
            booking.offeringPolicyRevisionSnapshot,
          payloadHash,
          paymentPolicyRevisionSnapshot: booking.paymentPolicyRevisionSnapshot,
          previousEndAt: booking.endAt,
          previousResourceId: booking.resourceId,
          previousStartAt: booking.startAt,
          reasonCode: input.reasonCode?.trim(),
          refundAmountMinor,
          refundOutcome,
          storeId: input.storeId,
          tenantId: input.tenantId,
          toStatus: persistenceStatus(nextStatus),
          type: eventType,
        },
      })
      await tx.serviceBookingAccessCapability.updateMany({
        data: {
          status:
            nextStatus === "cancelled" ||
            nextStatus === "completed" ||
            nextStatus === "no_show"
              ? ServiceBookingAccessStatus.REVOKED
              : ServiceBookingAccessStatus.ROTATED,
          revokedAt:
            nextStatus === "cancelled" ||
            nextStatus === "completed" ||
            nextStatus === "no_show"
              ? now
              : undefined,
        },
        where: {
          bookingId: booking.id,
          status: ServiceBookingAccessStatus.ACTIVE,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      let token: string | null = null
      if (
        nextStatus !== "cancelled" &&
        nextStatus !== "completed" &&
        nextStatus !== "no_show"
      ) {
        token = nextToken
        await tx.serviceBookingAccessCapability.create({
          data: {
            bookingId: booking.id,
            clientOperationId: nextCapabilityOperationId,
            expiresAt: new Date(
              now.getTime() + MANAGE_CAPABILITY_MINUTES * 60_000,
            ),
            offeringConfigId: booking.offeringConfigId,
            payloadHash,
            purpose: ServiceBookingAccessPurpose.VIEW_AND_MANAGE,
            sourceId: booking.sourceId,
            sourceType: booking.sourceType,
            stateRevision: booking.revision + 1,
            storeId: input.storeId,
            tenantId: input.tenantId,
            tokenDigest: bookingTokenDigest(nextToken),
          },
        })
      }
      const notificationDispatches: Array<{
        actorUserId: string
        intentId: string
      }> = []
      if (input.operation === "cancel" || input.operation === "reschedule") {
        await tx.serviceBookingNotificationIntent.updateMany({
          data: { status: ServiceBookingNotificationStatus.CANCELLED },
          where: {
            bookingId: booking.id,
            status: ServiceBookingNotificationStatus.PENDING,
            storeId: input.storeId,
            tenantId: input.tenantId,
            type: ServiceBookingNotificationType.REMINDER,
          },
        })
      }
      if (
        booking.customerContactCiphertext &&
        booking.notificationChannelSnapshot &&
        booking.notificationPolicyChannelSnapshot &&
        (input.operation === "cancel" || input.operation === "reschedule")
      ) {
        const notificationAllowed = await bookingNotificationPolicyAllowed(tx, {
          actorUserId: input.actorUserId ?? PUBLIC_BOOKING_ACTOR,
          channel: policyChannel(booking.notificationPolicyChannelSnapshot),
          purpose: `booking_${input.operation}_notification_create`,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
        const notificationAuthorizer = notificationAllowed
          ? await resolveBookingNotificationAuthorizer(tx, input)
          : null
        if (notificationAllowed && notificationAuthorizer) {
          const changeIntent = await tx.serviceBookingNotificationIntent.create(
            {
              data: {
                authorizationUserId: notificationAuthorizer,
                bookingId: booking.id,
                channel: booking.notificationChannelSnapshot,
                deduplicationKey: `booking-${input.operation}:${booking.id}:${booking.revision + 1}`,
                policyChannel: booking.notificationPolicyChannelSnapshot,
                recipientCiphertext: booking.customerContactCiphertext,
                scheduledFor: now,
                storeId: input.storeId,
                tenantId: input.tenantId,
                type:
                  input.operation === "cancel"
                    ? ServiceBookingNotificationType.CANCELLATION
                    : ServiceBookingNotificationType.RESCHEDULE,
              },
            },
          )
          notificationDispatches.push({
            actorUserId: notificationAuthorizer,
            intentId: changeIntent.id,
          })
          if (
            input.operation === "reschedule" &&
            booking.reminderLeadMinutesSnapshot > 0
          ) {
            const reminderIntent =
              await tx.serviceBookingNotificationIntent.create({
                data: {
                  authorizationUserId: notificationAuthorizer,
                  bookingId: booking.id,
                  channel: booking.notificationChannelSnapshot,
                  deduplicationKey: `booking-reminder:${booking.id}:${booking.revision + 1}:${nextStartAt.toISOString()}`,
                  policyChannel: booking.notificationPolicyChannelSnapshot,
                  recipientCiphertext: booking.customerContactCiphertext,
                  scheduledFor: new Date(
                    Math.max(
                      now.getTime(),
                      nextStartAt.getTime() -
                        booking.reminderLeadMinutesSnapshot * 60_000,
                    ),
                  ),
                  storeId: input.storeId,
                  tenantId: input.tenantId,
                  type: ServiceBookingNotificationType.REMINDER,
                },
              })
            if (reminderIntent.scheduledFor <= now) {
              notificationDispatches.push({
                actorUserId: notificationAuthorizer,
                intentId: reminderIntent.id,
              })
            }
          }
        }
      }
      const refreshed = await tx.serviceBooking.findFirstOrThrow({
        include: { resource: true },
        where: {
          id: booking.id,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      return { booking: refreshed, notificationDispatches, refund, token }
    }, BOOKING_TRANSACTION_OPTIONS)
    return {
      ...safeBookingProjection(result.booking),
      accessToken: result.token,
      notificationDispatches: result.notificationDispatches,
      refund: result.refund
        ? {
            amountMinor: result.refund.refundAmountMinor,
            outcome:
              result.refund.refundOutcome === "refund_eligible"
                ? "full"
                : result.refund.refundOutcome,
          }
        : null,
    }
  } catch (error) {
    return translateBookingTransactionError(error)
  }
}

export async function getPublicServiceCommerceBooking(
  db: DbClient,
  input: { accessToken: string; now?: Date },
) {
  const now = input.now ?? new Date()
  const capability = await db.serviceBookingAccessCapability.findFirst({
    include: { booking: { include: { resource: true } } },
    where: {
      expiresAt: { gt: now },
      purpose: ServiceBookingAccessPurpose.VIEW_AND_MANAGE,
      status: ServiceBookingAccessStatus.ACTIVE,
      tokenDigest: bookingTokenDigest(input.accessToken),
    },
  })
  if (
    !capability?.booking ||
    capability.stateRevision !== capability.booking.revision
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Booking is unavailable.",
    )
  }
  await assertBookingPolicy(db as BookingTransaction, {
    actorUserId: PUBLIC_BOOKING_ACTOR,
    channel: "web",
    purpose: "booking_public_projection",
    storeId: capability.storeId,
    tenantId: capability.tenantId,
  })
  await assertBookingRuntimeReady(db as BookingTransaction, capability)
  await db.serviceBookingAccessCapability.updateMany({
    data: { accessCount: { increment: 1 }, lastAccessedAt: now },
    where: {
      id: capability.id,
      stateRevision: capability.stateRevision,
      status: ServiceBookingAccessStatus.ACTIVE,
      storeId: capability.storeId,
      tenantId: capability.tenantId,
    },
  })
  return safeBookingProjection(capability.booking)
}
