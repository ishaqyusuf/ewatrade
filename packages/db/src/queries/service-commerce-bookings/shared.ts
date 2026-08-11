import { createHash, randomBytes } from "node:crypto"

import type { ServiceCommerceSourceRef } from "@ewatrade/service-commerce"

import { Prisma } from "../../../generated/prisma/client"
import {
  CommerceQuoteSourceType,
  MembershipRole,
  MembershipStatus,
  ServiceCommerceProfileStatus,
  ServiceCommerceStoreTeamAssignmentStatus,
  ServiceCommerceStoreTeamCapability,
  ServiceRequestStatus,
} from "../../../generated/prisma/enums"
import {
  assertServiceCommercePolicyAllowedInTransaction,
  evaluateServiceCommercePolicyInTransaction,
} from "../service-commerce-policy"

export const BOOKING_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const

export type BookingTransaction = Prisma.TransactionClient

export class ServiceCommerceBookingError extends Error {
  constructor(
    readonly code:
      | "BOOKING_BLOCKED"
      | "BOOKING_CAPACITY_CONFLICT"
      | "BOOKING_CONFIGURATION_CONFLICT"
      | "BOOKING_FORBIDDEN"
      | "BOOKING_IDEMPOTENCY_MISMATCH"
      | "BOOKING_INVALID_INPUT"
      | "BOOKING_NOT_FOUND"
      | "BOOKING_REVISION_CONFLICT",
    message: string,
  ) {
    super(message)
    this.name = "ServiceCommerceBookingError"
  }
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

export function bookingPayloadHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex")
}

export function bookingToken() {
  return randomBytes(32).toString("base64url")
}

export function bookingTokenDigest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

export function bookingSourceType(source: ServiceCommerceSourceRef) {
  if (source.kind !== "service") {
    throw new ServiceCommerceBookingError(
      "BOOKING_BLOCKED",
      "Only eligible Service requests can create an appointment booking.",
    )
  }
  return CommerceQuoteSourceType.SERVICE_REQUEST
}

export function bookingSourceRef(input: {
  sourceId: string
  sourceType: CommerceQuoteSourceType
}): ServiceCommerceSourceRef {
  if (input.sourceType !== CommerceQuoteSourceType.SERVICE_REQUEST) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Booking source is unavailable.",
    )
  }
  return { id: input.sourceId, kind: "service" }
}

export async function assertBookingMember(
  tx: BookingTransaction,
  input: {
    actorUserId: string
    manager?: boolean
    storeId: string
    tenantId: string
  },
) {
  const where = input.manager
    ? {
        acceptedAt: { not: null },
        role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
        userId: input.actorUserId,
      }
    : {
        OR: [
          {
            role: {
              in: [MembershipRole.OWNER, MembershipRole.ADMIN],
            },
          },
          {
            serviceCommerceStoreTeamAssignments: {
              some: {
                capability: ServiceCommerceStoreTeamCapability.ATTENDANT,
                status: ServiceCommerceStoreTeamAssignmentStatus.ACTIVE,
                storeId: input.storeId,
                tenantId: input.tenantId,
              },
            },
          },
        ],
        acceptedAt: { not: null },
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
        userId: input.actorUserId,
      }
  const membership = await tx.membership.findFirst({
    select: { id: true, role: true },
    where,
  })
  if (!membership) {
    throw new ServiceCommerceBookingError(
      "BOOKING_FORBIDDEN",
      input.manager
        ? "Owner or administrator access is required to configure booking."
        : "An active Store attendant assignment is required for booking operations.",
    )
  }
  return membership
}

export async function assertBookingPolicy(
  tx: BookingTransaction,
  input: {
    actorUserId: string
    channel: "staff" | "web" | "whatsapp"
    purpose: string
    storeId: string
    tenantId: string
  },
) {
  return assertServiceCommercePolicyAllowedInTransaction(tx, {
    actorUserId: input.actorUserId,
    channel: input.channel,
    purpose: input.purpose,
    storeId: input.storeId,
    subject: "booking",
    tenantId: input.tenantId,
    vertical: "service",
  })
}

export async function bookingNotificationPolicyAllowed(
  tx: BookingTransaction,
  input: {
    actorUserId: string
    channel: "staff" | "web" | "whatsapp"
    purpose: string
    storeId: string
    tenantId: string
  },
) {
  const evaluation = await evaluateServiceCommercePolicyInTransaction(tx, {
    actorUserId: input.actorUserId,
    channel: input.channel,
    purpose: input.purpose,
    storeId: input.storeId,
    subject: "booking",
    tenantId: input.tenantId,
    vertical: "service",
  })
  return evaluation.outcome === "allowed"
}

export async function assertBookingRuntimeReady(
  tx: BookingTransaction,
  input: { storeId: string; tenantId: string },
) {
  const profile = await tx.serviceCommerceStoreProfile.findFirst({
    select: { bookingEnabled: true, id: true, status: true },
    where: {
      bookingEnabled: true,
      status: ServiceCommerceProfileStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!profile) {
    throw new ServiceCommerceBookingError(
      "BOOKING_BLOCKED",
      "Booking is not active for this Store.",
    )
  }
  return profile
}

export async function resolveBookingNotificationAuthorizer(
  tx: BookingTransaction,
  input: { storeId: string; tenantId: string },
) {
  const assignment = await tx.serviceCommerceStoreTeamAssignment.findFirst({
    select: { membership: { select: { userId: true } } },
    where: {
      capability: ServiceCommerceStoreTeamCapability.ATTENDANT,
      membership: {
        acceptedAt: { not: null },
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
      },
      status: ServiceCommerceStoreTeamAssignmentStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  return assignment?.membership.userId ?? null
}

export async function assertBookingSource(
  tx: BookingTransaction,
  input: {
    source: ServiceCommerceSourceRef
    storeId: string
    tenantId: string
  },
) {
  bookingSourceType(input.source)
  const request = await tx.serviceRequest.findFirst({
    select: {
      channelOrigin: true,
      contactOptIn: true,
      customerEmail: true,
      customerName: true,
      customerPhone: true,
      id: true,
      status: true,
    },
    where: {
      id: input.source.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (
    !request ||
    request.status === ServiceRequestStatus.DECLINED ||
    request.status === ServiceRequestStatus.WITHDRAWN
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Eligible booking source was not found.",
    )
  }
  return request
}

export function translateBookingTransactionError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_CONFIGURATION_CONFLICT",
      "Booking facts changed concurrently. Refresh and try again.",
    )
  }
  throw error
}
