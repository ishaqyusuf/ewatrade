import type { Prisma } from "../../generated/prisma/client"
import { CommerceQuoteSourceType } from "../../generated/prisma/enums"
import {
  ServiceCommerceBookingError,
  assertBookingMember,
  assertBookingRuntimeReady,
  assertBookingSource,
  bookingSourceRef,
} from "./service-commerce-bookings/shared"
import { assertServiceCommercePolicyAllowedReadOnlyInTransaction } from "./service-commerce-policy"
import { readStaffStoreAccess } from "./staff-store-access"

export type AssistantBookingReadInput = {
  actorUserId: string
  tenantId: string
  storeId: string
  bookingId: string
  sourceId: string
  offeringId: string
}

const bookingSelect = {
  id: true,
  sourceId: true,
  sourceType: true,
  resourceId: true,
  quoteVersionId: true,
  commercialOrderId: true,
  status: true,
  revision: true,
  startAt: true,
  endAt: true,
  capacity: true,
  timezoneSnapshot: true,
  paymentStatus: true,
  paymentRequirementSnapshot: true,
  depositAmountMinorSnapshot: true,
  payableAmountMinorSnapshot: true,
  requiredPaymentMinorSnapshot: true,
  currencyCodeSnapshot: true,
  paymentPolicyRevisionSnapshot: true,
  cancellationWindowSnapshot: true,
  refundPolicySnapshot: true,
  cancellationPolicyRevisionSnapshot: true,
  offeringPolicyRevisionSnapshot: true,
  confirmedAt: true,
  arrivedAt: true,
  serviceStartedAt: true,
  completedAt: true,
  cancelledAt: true,
  noShowAt: true,
  resource: {
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      name: true,
      kind: true,
      status: true,
      capacity: true,
      revision: true,
    },
  },
  offeringConfig: {
    select: {
      id: true,
      offeringId: true,
      tenantId: true,
      storeId: true,
      status: true,
      revision: true,
    },
  },
} satisfies Prisma.ServiceBookingSelect

function unavailable(message: string): never {
  throw new ServiceCommerceBookingError("BOOKING_NOT_FOUND", message)
}

/** Staff-only saved facts. Does not consume, issue or revive public capabilities. */
export async function getAssistantServiceBookingInTransaction(
  tx: Prisma.TransactionClient,
  input: AssistantBookingReadInput,
) {
  const actor = await assertBookingMember(tx, input)
  const [access, store] = await Promise.all([
    readStaffStoreAccess(tx, actor.id, input.tenantId),
    tx.store.findFirst({
      where: { id: input.storeId, tenantId: input.tenantId, status: "ACTIVE" },
      select: { id: true },
    }),
  ])
  if (
    !store ||
    !access ||
    !["OWNER", "ADMIN", "MANAGER", "OPERATOR", "CASHIER"].includes(
      access.role,
    ) ||
    (access.staffAccessMode === "SCOPED" &&
      !["OWNER", "ADMIN"].includes(access.role) &&
      !access.staffStoreAssignments.some(
        (row) => row.storeId === input.storeId,
      ))
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_FORBIDDEN",
      "Current Store access is required to read this booking.",
    )
  }
  await assertBookingRuntimeReady(tx, input)
  await assertServiceCommercePolicyAllowedReadOnlyInTransaction(tx, {
    ...input,
    channel: "staff",
    subject: "booking",
    vertical: "service",
    purpose: "assistant_booking_read",
  })
  const booking = await tx.serviceBooking.findFirst({
    select: bookingSelect,
    where: {
      id: input.bookingId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      sourceId: input.sourceId,
      sourceType: CommerceQuoteSourceType.SERVICE_REQUEST,
      offeringConfig: {
        offeringId: input.offeringId,
        tenantId: input.tenantId,
        storeId: input.storeId,
      },
    },
  })
  if (!booking) unavailable("The original service booking was not found.")
  const sameScope = (row: { tenantId: string; storeId: string }) =>
    row.tenantId === input.tenantId && row.storeId === input.storeId
  if (
    !sameScope(booking.resource) ||
    !sameScope(booking.offeringConfig) ||
    booking.resource.id !== booking.resourceId ||
    booking.offeringConfig.offeringId !== input.offeringId
  ) {
    unavailable(
      "The original booking resource or Offering belongs to another scope.",
    )
  }
  await assertBookingSource(tx, {
    ...input,
    source: bookingSourceRef(booking),
  })
  const quote = booking.quoteVersionId
    ? await tx.commerceQuoteVersion.findFirst({
        select: { id: true, quoteId: true, acceptedOrderId: true },
        where: {
          id: booking.quoteVersionId,
          quote: {
            sourceId: booking.sourceId,
            sourceType: booking.sourceType,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        },
      })
    : null
  if (booking.quoteVersionId && !quote)
    unavailable("The original booking Quote Version is unavailable.")
  const order = booking.commercialOrderId
    ? await tx.commercialOrder.findFirst({
        select: {
          id: true,
          orderNumber: true,
          status: true,
          currencyCode: true,
          totalMinor: true,
          amountPaidMinor: true,
          paymentStatus: true,
          acceptedCommerceQuoteVersion: { select: { id: true } },
        },
        where: {
          id: booking.commercialOrderId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
    : null
  if (booking.commercialOrderId && !order)
    unavailable("The original booking Order is unavailable.")
  if (
    quote &&
    order &&
    (order.acceptedCommerceQuoteVersion?.id !== quote.id ||
      quote.acceptedOrderId !== order.id)
  ) {
    unavailable(
      "The booking Order does not belong to the original Quote Version.",
    )
  }
  return {
    id: booking.id,
    sourceId: booking.sourceId,
    offeringId: booking.offeringConfig.offeringId,
    quoteId: quote?.quoteId ?? null,
    quoteVersionId: booking.quoteVersionId,
    commercialOrderId: booking.commercialOrderId,
    status: booking.status.toLowerCase(),
    revision: booking.revision,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    timezone: booking.timezoneSnapshot,
    reservedCapacity: booking.capacity,
    resource: {
      id: booking.resource.id,
      label: booking.resource.name,
      kind: booking.resource.kind.toLowerCase(),
      status: booking.resource.status.toLowerCase(),
      currentCapacity: booking.resource.capacity,
      currentRevision: booking.resource.revision,
    },
    configuration: {
      id: booking.offeringConfig.id,
      currentStatus: booking.offeringConfig.status.toLowerCase(),
      currentRevision: booking.offeringConfig.revision,
      bookedRevision: booking.offeringPolicyRevisionSnapshot,
    },
    payment: {
      storedStatus: booking.paymentStatus.toLowerCase(),
      requirement: booking.paymentRequirementSnapshot.toLowerCase(),
      depositMinor: booking.depositAmountMinorSnapshot,
      payableMinor: booking.payableAmountMinorSnapshot,
      requiredMinor: booking.requiredPaymentMinorSnapshot,
      currencyCode: booking.currencyCodeSnapshot,
      policyRevision: booking.paymentPolicyRevisionSnapshot,
      currentOrder: order
        ? {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status.toLowerCase(),
            currencyCode: order.currencyCode,
            totalMinor: order.totalMinor,
            recordedAmountPaidMinor: order.amountPaidMinor,
            storedPaymentStatus: order.paymentStatus.toLowerCase(),
          }
        : null,
      providerSettlement: "not_checked" as const,
    },
    cancellationPolicy: {
      windowMinutesBeforeStart: booking.cancellationWindowSnapshot,
      refundPolicy: booking.refundPolicySnapshot.toLowerCase(),
      revision: booking.cancellationPolicyRevisionSnapshot,
    },
    milestones: {
      confirmedAt: booking.confirmedAt?.toISOString() ?? null,
      arrivedAt: booking.arrivedAt?.toISOString() ?? null,
      startedAt: booking.serviceStartedAt?.toISOString() ?? null,
      completedAt: booking.completedAt?.toISOString() ?? null,
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
      noShowAt: booking.noShowAt?.toISOString() ?? null,
    },
    capacityAssessment: "not_checked" as const,
  }
}
