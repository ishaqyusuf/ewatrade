import type { PrismaClient } from "../../../generated/prisma/client"
import {
  MembershipStatus,
  ServiceBookingNotificationStatus,
  ServiceBookingNotificationType,
  ServiceBookingStatus,
  ServiceCommercePolicyChannel,
  ServiceCommerceProfileStatus,
  ServiceCommerceStoreTeamAssignmentStatus,
  ServiceCommerceStoreTeamCapability,
} from "../../../generated/prisma/enums"
import {
  BOOKING_TRANSACTION_OPTIONS,
  ServiceCommerceBookingError,
  assertBookingMember,
  assertBookingPolicy,
  assertBookingRuntimeReady,
  bookingNotificationPolicyAllowed,
  translateBookingTransactionError,
} from "./shared"

function policyChannel(value: ServiceCommercePolicyChannel) {
  if (value === ServiceCommercePolicyChannel.WHATSAPP)
    return "whatsapp" as const
  if (value === ServiceCommercePolicyChannel.STAFF) return "staff" as const
  return "web" as const
}

function notificationMatchesBookingState(input: {
  booking: { startAt: Date; status: ServiceBookingStatus } | null
  deduplicationKey: string
  now: Date
  type: ServiceBookingNotificationType
}) {
  if (!input.booking) return false
  const status = input.booking.status
  const isUpcoming =
    status === ServiceBookingStatus.SCHEDULED ||
    status === ServiceBookingStatus.CONFIRMED
  if (input.type === ServiceBookingNotificationType.CANCELLATION) {
    return status === ServiceBookingStatus.CANCELLED
  }
  if (input.type === ServiceBookingNotificationType.REMINDER) {
    return (
      isUpcoming &&
      input.booking.startAt > input.now &&
      input.deduplicationKey.endsWith(input.booking.startAt.toISOString())
    )
  }
  if (input.type === ServiceBookingNotificationType.RESCHEDULE) {
    return isUpcoming
  }
  return isUpcoming
}

export async function listServiceCommerceBookingReminderScopes(
  db: PrismaClient,
  input: { afterProfileId?: string; limit?: number } = {},
) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 250)
  const profiles = await db.serviceCommerceStoreProfile.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      store: {
        select: {
          serviceCommerceStoreTeamAssignments: {
            orderBy: { id: "asc" },
            select: { membership: { select: { userId: true } } },
            take: 1,
            where: {
              capability: ServiceCommerceStoreTeamCapability.ATTENDANT,
              membership: {
                acceptedAt: { not: null },
                status: MembershipStatus.ACTIVE,
              },
              status: ServiceCommerceStoreTeamAssignmentStatus.ACTIVE,
            },
          },
        },
      },
      storeId: true,
      tenantId: true,
    },
    take: limit + 1,
    where: {
      bookingEnabled: true,
      id: input.afterProfileId ? { gt: input.afterProfileId } : undefined,
      status: ServiceCommerceProfileStatus.ACTIVE,
    },
  })
  const page = profiles.slice(0, limit)
  return {
    nextProfileId: profiles.length > limit ? (page.at(-1)?.id ?? null) : null,
    scopes: page.flatMap((profile) => {
      const actorUserId =
        profile.store.serviceCommerceStoreTeamAssignments[0]?.membership.userId
      return actorUserId
        ? [
            {
              actorUserId,
              storeId: profile.storeId,
              tenantId: profile.tenantId,
            },
          ]
        : []
    }),
  }
}

/**
 * Sweeps all due booking notification intents. The historic name remains for
 * job compatibility; the query is deliberately not reminder-only so a
 * post-commit enqueue failure for confirmation, change, or cancellation can
 * be recovered by the bounded scheduler.
 */
export async function scheduleDueServiceCommerceBookingReminderIntents(
  db: PrismaClient,
  input: {
    actorUserId: string
    limit?: number
    now?: Date
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  return db.$transaction(async (tx) => {
    await assertBookingMember(tx, input)
    await assertBookingRuntimeReady(tx, input)
    const due = await tx.serviceBookingNotificationIntent.findMany({
      orderBy: [{ scheduledFor: "asc" }, { id: "asc" }],
      select: {
        booking: { select: { startAt: true, status: true } },
        deduplicationKey: true,
        id: true,
        policyChannel: true,
        type: true,
      },
      take: limit,
      where: {
        scheduledFor: { lte: now },
        status: ServiceBookingNotificationStatus.PENDING,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const notificationDispatches: Array<{
      actorUserId: string
      intentId: string
    }> = []
    for (const intent of due) {
      if (!notificationMatchesBookingState({ ...intent, now })) {
        await tx.serviceBookingNotificationIntent.updateMany({
          data: { status: ServiceBookingNotificationStatus.CANCELLED },
          where: {
            id: intent.id,
            status: ServiceBookingNotificationStatus.PENDING,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        continue
      }
      const allowed = await bookingNotificationPolicyAllowed(tx, {
        actorUserId: input.actorUserId,
        channel: policyChannel(intent.policyChannel),
        purpose: "booking_reminder_schedule",
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      if (!allowed) continue
      const updated = await tx.serviceBookingNotificationIntent.updateMany({
        data: { authorizationUserId: input.actorUserId },
        where: {
          id: intent.id,
          scheduledFor: { lte: now },
          status: ServiceBookingNotificationStatus.PENDING,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (updated.count === 1) {
        notificationDispatches.push({
          actorUserId: input.actorUserId,
          intentId: intent.id,
        })
      }
    }
    return { notificationDispatches }
  }, BOOKING_TRANSACTION_OPTIONS)
}

export async function claimServiceCommerceBookingNotificationIntent(
  db: PrismaClient,
  input: {
    actorUserId: string
    intentId: string
    now?: Date
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  try {
    return await db.$transaction(async (tx) => {
      await assertBookingMember(tx, input)
      const intent = await tx.serviceBookingNotificationIntent.findFirst({
        include: { booking: { select: { startAt: true, status: true } } },
        where: {
          authorizationUserId: input.actorUserId,
          id: input.intentId,
          scheduledFor: { lte: now },
          status: ServiceBookingNotificationStatus.PENDING,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!intent) {
        throw new ServiceCommerceBookingError(
          "BOOKING_NOT_FOUND",
          "Booking notification is unavailable.",
        )
      }
      if (!notificationMatchesBookingState({ ...intent, now })) {
        await tx.serviceBookingNotificationIntent.updateMany({
          data: { status: ServiceBookingNotificationStatus.CANCELLED },
          where: {
            id: input.intentId,
            status: ServiceBookingNotificationStatus.PENDING,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        throw new ServiceCommerceBookingError(
          "BOOKING_NOT_FOUND",
          "Booking notification is no longer current.",
        )
      }
      await assertBookingRuntimeReady(tx, input)
      await assertBookingPolicy(tx, {
        actorUserId: input.actorUserId,
        channel: policyChannel(intent.policyChannel),
        purpose: "booking_notification_claim",
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      const claimed = await tx.serviceBookingNotificationIntent.updateMany({
        data: {
          attemptCount: { increment: 1 },
          claimedAt: now,
          failureCode: null,
          status: ServiceBookingNotificationStatus.CLAIMED,
        },
        where: {
          authorizationUserId: input.actorUserId,
          id: intent.id,
          status: ServiceBookingNotificationStatus.PENDING,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (claimed.count !== 1) {
        throw new ServiceCommerceBookingError(
          "BOOKING_REVISION_CONFLICT",
          "Booking notification was claimed concurrently.",
        )
      }
      return {
        channel: intent.channel.toLowerCase(),
        intentId: intent.id,
        recipientCiphertext: intent.recipientCiphertext,
        type: intent.type.toLowerCase(),
      }
    }, BOOKING_TRANSACTION_OPTIONS)
  } catch (error) {
    return translateBookingTransactionError(error)
  }
}

export async function completeServiceCommerceBookingNotificationIntent(
  db: PrismaClient,
  input: {
    actorUserId: string
    intentId: string
    now?: Date
    storeId: string
    tenantId: string
  },
) {
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    await assertBookingMember(tx, input)
    const updated = await tx.serviceBookingNotificationIntent.updateMany({
      data: {
        claimedAt: null,
        sentAt: now,
        status: ServiceBookingNotificationStatus.SENT,
      },
      where: {
        authorizationUserId: input.actorUserId,
        id: input.intentId,
        status: ServiceBookingNotificationStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (updated.count !== 1) {
      throw new ServiceCommerceBookingError(
        "BOOKING_REVISION_CONFLICT",
        "Booking notification state changed.",
      )
    }
    return { id: input.intentId, status: "sent" as const }
  }, BOOKING_TRANSACTION_OPTIONS)
}

export async function failServiceCommerceBookingNotificationIntent(
  db: PrismaClient,
  input: {
    actorUserId: string
    failureCode: string
    intentId: string
    retryAt?: Date
    storeId: string
    tenantId: string
  },
) {
  const failureCode = input.failureCode.trim().slice(0, 80)
  if (!failureCode) {
    throw new ServiceCommerceBookingError(
      "BOOKING_INVALID_INPUT",
      "A bounded notification failure code is required.",
    )
  }
  return db.$transaction(async (tx) => {
    await assertBookingMember(tx, input)
    const updated = await tx.serviceBookingNotificationIntent.updateMany({
      data: {
        claimedAt: null,
        failureCode,
        scheduledFor: input.retryAt,
        status: input.retryAt
          ? ServiceBookingNotificationStatus.PENDING
          : ServiceBookingNotificationStatus.FAILED,
      },
      where: {
        authorizationUserId: input.actorUserId,
        id: input.intentId,
        status: ServiceBookingNotificationStatus.CLAIMED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (updated.count !== 1) {
      throw new ServiceCommerceBookingError(
        "BOOKING_REVISION_CONFLICT",
        "Booking notification state changed.",
      )
    }
    return {
      id: input.intentId,
      status: input.retryAt ? ("pending" as const) : ("failed" as const),
    }
  }, BOOKING_TRANSACTION_OPTIONS)
}
