import {
  type ServiceCommerceBookingConfiguration,
  serviceCommerceBookingConfigurationSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../../generated/prisma/client"
import {
  CatalogRecordStatus,
  SellableOfferingKind,
  ServiceBookingAvailabilityExceptionKind,
  ServiceBookingPaymentRequirement,
  ServiceBookingRecordStatus,
  ServiceBookingRefundPolicy,
} from "../../../generated/prisma/enums"
import type { DbClient } from "../types"
import {
  BOOKING_TRANSACTION_OPTIONS,
  type BookingTransaction,
  ServiceCommerceBookingError,
  assertBookingMember,
  bookingPayloadHash,
  translateBookingTransactionError,
} from "./shared"

type ServiceCommerceBookingConfigurationCommand = Omit<
  ServiceCommerceBookingConfiguration,
  "cancellationPolicy" | "paymentPolicy"
> & {
  cancellationPolicy: Omit<
    ServiceCommerceBookingConfiguration["cancellationPolicy"],
    "revision"
  > & { revision?: number }
  paymentPolicy: Omit<
    ServiceCommerceBookingConfiguration["paymentPolicy"],
    "revision"
  > & { revision?: number }
}

function paymentRequirement(value: ServiceBookingPaymentRequirement) {
  if (value === ServiceBookingPaymentRequirement.DEPOSIT) return "deposit"
  if (value === ServiceBookingPaymentRequirement.FULL) return "full"
  return "none"
}

function persistencePaymentRequirement(
  value: ServiceCommerceBookingConfiguration["paymentPolicy"]["requirement"],
) {
  if (value === "deposit") return ServiceBookingPaymentRequirement.DEPOSIT
  if (value === "full") return ServiceBookingPaymentRequirement.FULL
  return ServiceBookingPaymentRequirement.NONE
}

function refundPolicy(value: ServiceBookingRefundPolicy) {
  if (value === ServiceBookingRefundPolicy.FULL_BEFORE_CUTOFF) {
    return "full_before_cutoff"
  }
  if (value === ServiceBookingRefundPolicy.MANUAL_REVIEW) return "manual_review"
  return "none"
}

function persistenceRefundPolicy(
  value: ServiceCommerceBookingConfiguration["cancellationPolicy"]["refundPolicy"],
) {
  if (value === "full_before_cutoff") {
    return ServiceBookingRefundPolicy.FULL_BEFORE_CUTOFF
  }
  if (value === "manual_review") return ServiceBookingRefundPolicy.MANUAL_REVIEW
  return ServiceBookingRefundPolicy.NONE
}

async function loadConfiguration(
  db: DbClient,
  input: { offeringId: string; storeId: string; tenantId: string },
) {
  const config = await db.serviceBookingOfferingConfig.findFirst({
    include: {
      resources: { include: { resource: true } },
      store: {
        include: {
          serviceBookingAvailabilityExceptions: {
            where: { status: ServiceBookingRecordStatus.ACTIVE },
          },
          serviceBookingAvailabilityRules: {
            where: { status: ServiceBookingRecordStatus.ACTIVE },
          },
          serviceBookingSettings: true,
        },
      },
    },
    where: {
      offeringId: input.offeringId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!config || config.status !== ServiceBookingRecordStatus.ACTIVE) {
    throw new ServiceCommerceBookingError(
      "BOOKING_NOT_FOUND",
      "Booking configuration was not found.",
    )
  }
  const settings = config.store.serviceBookingSettings
  if (!settings) {
    throw new ServiceCommerceBookingError(
      "BOOKING_CONFIGURATION_CONFLICT",
      "Store booking settings are incomplete.",
    )
  }
  const resourceIds = new Set(config.resources.map((entry) => entry.resourceId))
  const rules = config.store.serviceBookingAvailabilityRules.filter((rule) =>
    resourceIds.has(rule.resourceId),
  )
  const rulesByClientId = new Map<
    string,
    {
      daysOfWeek: number[]
      endLocalTime: string
      id: string
      startLocalTime: string
    }
  >()
  for (const rule of rules) {
    const current = rulesByClientId.get(rule.clientRuleId) ?? {
      daysOfWeek: [],
      endLocalTime: `${String(Math.floor(rule.endMinute / 60)).padStart(2, "0")}:${String(rule.endMinute % 60).padStart(2, "0")}`,
      id: rule.clientRuleId,
      startLocalTime: `${String(Math.floor(rule.startMinute / 60)).padStart(2, "0")}:${String(rule.startMinute % 60).padStart(2, "0")}`,
    }
    if (!current.daysOfWeek.includes(rule.dayOfWeek)) {
      current.daysOfWeek.push(rule.dayOfWeek)
    }
    rulesByClientId.set(rule.clientRuleId, current)
  }
  const exceptionsByClientId = new Map<
    string,
    (typeof config.store.serviceBookingAvailabilityExceptions)[number]
  >()
  for (const exception of config.store.serviceBookingAvailabilityExceptions) {
    if (
      resourceIds.has(exception.resourceId) &&
      !exceptionsByClientId.has(exception.clientExceptionId)
    ) {
      exceptionsByClientId.set(exception.clientExceptionId, exception)
    }
  }
  return {
    availabilityRules: [...rulesByClientId.values()].map((rule) => ({
      ...rule,
      daysOfWeek: rule.daysOfWeek.sort((left, right) => left - right),
    })),
    bookingHorizonMinutes: config.bookingHorizonMinutes,
    cancellationPolicy: {
      allowedUntilMinutesBeforeStart: config.cancellationWindowMinutes,
      refundPolicy: refundPolicy(config.refundPolicy),
      revision: config.cancellationPolicyRevision,
    },
    exceptions: [...exceptionsByClientId.values()].map((exception) => ({
      ...(exception.kind ===
      ServiceBookingAvailabilityExceptionKind.CAPACITY_OVERRIDE
        ? { capacity: exception.capacity ?? 0 }
        : {}),
      endAt: exception.endAt,
      id: exception.clientExceptionId,
      kind: exception.kind.toLowerCase() as
        | "capacity_override"
        | "closed"
        | "open",
      startAt: exception.startAt,
    })),
    holdDurationMinutes: config.holdDurationMinutes,
    leadTimeMinutes: config.leadTimeMinutes,
    offeringId: config.offeringId,
    paymentPolicy: {
      depositMinor: config.depositAmountMinor,
      requirement: paymentRequirement(config.paymentRequirement),
      revision: config.paymentPolicyRevision,
    },
    reminderLeadMinutes: settings.reminderLeadMinutes,
    resources: config.resources.map(({ resource }) => ({
      capacity: resource.capacity,
      id: resource.id,
      label: resource.name,
    })),
    revision: config.revision,
    slotDurationMinutes: config.durationMinutes,
    storeId: config.storeId,
    tenantId: config.tenantId,
    timezone: settings.timezone,
  }
}

export async function getServiceCommerceBookingConfiguration(
  db: DbClient,
  input: {
    actorUserId: string
    offeringId: string
    storeId: string
    tenantId: string
  },
) {
  await assertBookingMember(db as BookingTransaction, input)
  return loadConfiguration(db, input)
}

export async function createServiceCommerceBookingResource(
  db: PrismaClient,
  input: {
    actorUserId: string
    capacity: number
    clientOperationId: string
    kind: "equipment" | "other" | "room" | "staff"
    membershipId?: string
    name: string
    storeId: string
    tenantId: string
  },
) {
  if (
    !Number.isInteger(input.capacity) ||
    input.capacity < 1 ||
    input.capacity > 10_000
  ) {
    throw new ServiceCommerceBookingError(
      "BOOKING_INVALID_INPUT",
      "Booking resource capacity is invalid.",
    )
  }
  const payloadHash = bookingPayloadHash({
    capacity: input.capacity,
    kind: input.kind,
    membershipId: input.membershipId ?? null,
    name: input.name.trim(),
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  try {
    return await db.$transaction(async (tx) => {
      await assertBookingMember(tx, { ...input, manager: true })
      const replay = await tx.serviceBookingResource.findFirst({
        where: {
          clientResourceId: input.clientOperationId,
          tenantId: input.tenantId,
        },
      })
      if (replay) {
        if (replay.payloadHash !== payloadHash) {
          throw new ServiceCommerceBookingError(
            "BOOKING_IDEMPOTENCY_MISMATCH",
            "Booking resource identity was reused with different input.",
          )
        }
        return replay
      }
      const store = await tx.store.findFirst({
        select: { id: true },
        where: { id: input.storeId, tenantId: input.tenantId },
      })
      if (!store) {
        throw new ServiceCommerceBookingError(
          "BOOKING_NOT_FOUND",
          "Store not found.",
        )
      }
      if (input.membershipId) {
        const membership = await tx.membership.findFirst({
          select: { id: true },
          where: {
            acceptedAt: { not: null },
            id: input.membershipId,
            status: "ACTIVE",
            tenantId: input.tenantId,
          },
        })
        if (!membership) {
          throw new ServiceCommerceBookingError(
            "BOOKING_INVALID_INPUT",
            "Booking resource membership is unavailable.",
          )
        }
      }
      return tx.serviceBookingResource.create({
        data: {
          capacity: input.capacity,
          clientResourceId: input.clientOperationId,
          kind: input.kind.toUpperCase() as
            | "EQUIPMENT"
            | "OTHER"
            | "ROOM"
            | "STAFF",
          membershipId: input.membershipId,
          name: input.name.trim(),
          payloadHash,
          storeId: input.storeId,
          tenantId: input.tenantId,
          updatedByUserId: input.actorUserId,
        },
      })
    }, BOOKING_TRANSACTION_OPTIONS)
  } catch (error) {
    return translateBookingTransactionError(error)
  }
}

function timeToMinute(value: string) {
  const [hours = 0, minutes = 0] = value.split(":").map(Number)
  return hours * 60 + minutes
}

export async function updateServiceCommerceBookingConfiguration(
  db: PrismaClient,
  input: ServiceCommerceBookingConfigurationCommand & {
    actorUserId: string
    clientOperationId: string
    expectedRevision: number
  },
) {
  const {
    actorUserId: _actorUserId,
    clientOperationId: _clientOperationId,
    expectedRevision: _expectedRevision,
    ...configuration
  } = input
  const parsed = serviceCommerceBookingConfigurationSchema.parse({
    ...configuration,
    cancellationPolicy: { ...configuration.cancellationPolicy, revision: 0 },
    paymentPolicy: { ...configuration.paymentPolicy, revision: 0 },
  })
  // Policy revisions are server-owned concurrency/audit facts. A client may
  // echo a previously-read value, but it must never be able to select the
  // revision that becomes durable or alter idempotency by changing it.
  const payloadHash = bookingPayloadHash({
    ...parsed,
    cancellationPolicy: { ...parsed.cancellationPolicy, revision: 0 },
    paymentPolicy: { ...parsed.paymentPolicy, revision: 0 },
  })
  try {
    return await db.$transaction(async (tx) => {
      await assertBookingMember(tx, { ...input, manager: true })
      const replay = await tx.serviceBookingConfigurationEvent.findFirst({
        where: {
          clientOperationId: input.clientOperationId,
          tenantId: input.tenantId,
        },
      })
      if (replay) {
        if (replay.payloadHash !== payloadHash) {
          throw new ServiceCommerceBookingError(
            "BOOKING_IDEMPOTENCY_MISMATCH",
            "Booking configuration operation was reused with different input.",
          )
        }
        return loadConfiguration(tx, input)
      }
      const [store, offering, current, resources] = await Promise.all([
        tx.store.findFirst({
          select: {
            id: true,
            serviceBookingSettings: { select: { id: true, revision: true } },
          },
          where: { id: input.storeId, tenantId: input.tenantId },
        }),
        tx.sellableOffering.findFirst({
          select: { id: true },
          where: {
            id: input.offeringId,
            kind: SellableOfferingKind.SERVICE,
            status: CatalogRecordStatus.ACTIVE,
            storeAvailability: {
              some: { isAvailable: true, storeId: input.storeId },
            },
            tenantId: input.tenantId,
          },
        }),
        tx.serviceBookingOfferingConfig.findFirst({
          where: {
            offeringId: input.offeringId,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        }),
        tx.serviceBookingResource.findMany({
          where: {
            id: { in: parsed.resources.map((resource) => resource.id) },
            status: ServiceBookingRecordStatus.ACTIVE,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        }),
      ])
      if (!store || !offering || resources.length !== parsed.resources.length) {
        throw new ServiceCommerceBookingError(
          "BOOKING_INVALID_INPUT",
          "Store, Service offering, or booking resource is unavailable.",
        )
      }
      if ((current?.revision ?? 0) !== input.expectedRevision) {
        throw new ServiceCommerceBookingError(
          "BOOKING_REVISION_CONFLICT",
          "Booking configuration changed. Refresh and try again.",
        )
      }
      const resourceById = new Map(
        parsed.resources.map((resource) => [resource.id, resource]),
      )
      const resourceUpdates = await Promise.all(
        resources.map((resource) => {
          const requested = resourceById.get(resource.id)
          if (!requested) {
            throw new ServiceCommerceBookingError(
              "BOOKING_INVALID_INPUT",
              "Booking resource is unavailable.",
            )
          }
          return tx.serviceBookingResource.updateMany({
            data: {
              capacity: requested.capacity,
              name: requested.label,
              revision: { increment: 1 },
              updatedByUserId: input.actorUserId,
            },
            where: {
              id: resource.id,
              revision: resource.revision,
              status: ServiceBookingRecordStatus.ACTIVE,
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          })
        }),
      )
      if (resourceUpdates.some((update) => update.count !== 1)) {
        throw new ServiceCommerceBookingError(
          "BOOKING_REVISION_CONFLICT",
          "A booking resource changed. Refresh and try again.",
        )
      }
      if (store.serviceBookingSettings) {
        const updated = await tx.serviceBookingStoreSettings.updateMany({
          data: {
            defaultHoldMinutes: parsed.holdDurationMinutes,
            defaultSlotInterval: parsed.slotDurationMinutes,
            reminderLeadMinutes: parsed.reminderLeadMinutes,
            revision: { increment: 1 },
            timezone: parsed.timezone,
            updatedByUserId: input.actorUserId,
          },
          where: {
            id: store.serviceBookingSettings.id,
            revision: store.serviceBookingSettings.revision,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        if (updated.count !== 1) {
          throw new ServiceCommerceBookingError(
            "BOOKING_REVISION_CONFLICT",
            "Store booking settings changed. Refresh and try again.",
          )
        }
      } else {
        await tx.serviceBookingStoreSettings.create({
          data: {
            defaultHoldMinutes: parsed.holdDurationMinutes,
            defaultSlotInterval: parsed.slotDurationMinutes,
            reminderLeadMinutes: parsed.reminderLeadMinutes,
            storeId: input.storeId,
            tenantId: input.tenantId,
            timezone: parsed.timezone,
            updatedByUserId: input.actorUserId,
          },
        })
      }
      const nextPaymentRequirement = persistencePaymentRequirement(
        parsed.paymentPolicy.requirement,
      )
      const nextRefundPolicy = persistenceRefundPolicy(
        parsed.cancellationPolicy.refundPolicy,
      )
      const paymentPolicyChanged =
        !current ||
        current.depositAmountMinor !== parsed.paymentPolicy.depositMinor ||
        current.paymentRequirement !== nextPaymentRequirement
      const cancellationPolicyChanged =
        !current ||
        current.cancellationWindowMinutes !==
          parsed.cancellationPolicy.allowedUntilMinutesBeforeStart ||
        current.refundPolicy !== nextRefundPolicy
      const configData = {
        bookingHorizonMinutes: parsed.bookingHorizonMinutes,
        cancellationPolicyRevision: current
          ? current.cancellationPolicyRevision +
            (cancellationPolicyChanged ? 1 : 0)
          : 0,
        cancellationWindowMinutes:
          parsed.cancellationPolicy.allowedUntilMinutesBeforeStart,
        capacity: Math.max(
          ...parsed.resources.map((resource) => resource.capacity),
        ),
        depositAmountMinor: parsed.paymentPolicy.depositMinor,
        durationMinutes: parsed.slotDurationMinutes,
        holdDurationMinutes: parsed.holdDurationMinutes,
        leadTimeMinutes: parsed.leadTimeMinutes,
        paymentPolicyRevision: current
          ? current.paymentPolicyRevision + (paymentPolicyChanged ? 1 : 0)
          : 0,
        paymentRequirement: nextPaymentRequirement,
        refundPolicy: nextRefundPolicy,
        status: ServiceBookingRecordStatus.ACTIVE,
        updatedByUserId: input.actorUserId,
      }
      let configId: string
      let nextRevision: number
      if (current) {
        const updated = await tx.serviceBookingOfferingConfig.updateMany({
          data: { ...configData, revision: { increment: 1 } },
          where: {
            id: current.id,
            revision: input.expectedRevision,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        if (updated.count !== 1) {
          throw new ServiceCommerceBookingError(
            "BOOKING_REVISION_CONFLICT",
            "Booking configuration changed. Refresh and try again.",
          )
        }
        configId = current.id
        nextRevision = current.revision + 1
      } else {
        const created = await tx.serviceBookingOfferingConfig.create({
          data: {
            ...configData,
            offeringId: input.offeringId,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        configId = created.id
        nextRevision = created.revision
      }
      await tx.serviceBookingOfferingResource.deleteMany({
        where: { offeringConfigId: configId },
      })
      await tx.serviceBookingOfferingResource.createMany({
        data: parsed.resources.map((resource) => ({
          capacityRequired: 1,
          offeringConfigId: configId,
          resourceId: resource.id,
        })),
      })
      const resourceIds = parsed.resources.map((resource) => resource.id)
      await Promise.all([
        tx.serviceBookingAvailabilityRule.updateMany({
          data: { status: ServiceBookingRecordStatus.INACTIVE },
          where: {
            resourceId: { in: resourceIds },
            status: ServiceBookingRecordStatus.ACTIVE,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        }),
        tx.serviceBookingAvailabilityException.updateMany({
          data: { status: ServiceBookingRecordStatus.INACTIVE },
          where: {
            resourceId: { in: resourceIds },
            status: ServiceBookingRecordStatus.ACTIVE,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        }),
      ])
      await tx.serviceBookingAvailabilityRule.createMany({
        data: resourceIds.flatMap((resourceId) =>
          parsed.availabilityRules.flatMap((rule) =>
            rule.daysOfWeek.map((dayOfWeek) => ({
              clientRuleId: rule.id,
              dayOfWeek,
              endMinute: timeToMinute(rule.endLocalTime),
              resourceId,
              revision: nextRevision,
              startMinute: timeToMinute(rule.startLocalTime),
              storeId: input.storeId,
              tenantId: input.tenantId,
              updatedByUserId: input.actorUserId,
            })),
          ),
        ),
      })
      await tx.serviceBookingAvailabilityException.createMany({
        data: resourceIds.flatMap((resourceId) =>
          parsed.exceptions.map((exception) => ({
            capacity:
              exception.kind === "capacity_override"
                ? exception.capacity
                : null,
            clientExceptionId: exception.id,
            endAt: exception.endAt,
            kind: exception.kind.toUpperCase() as
              | "CAPACITY_OVERRIDE"
              | "CLOSED"
              | "OPEN",
            resourceId,
            revision: nextRevision,
            startAt: exception.startAt,
            storeId: input.storeId,
            tenantId: input.tenantId,
            updatedByUserId: input.actorUserId,
          })),
        ),
      })
      await tx.serviceBookingConfigurationEvent.create({
        data: {
          actorUserId: input.actorUserId,
          clientOperationId: input.clientOperationId,
          nextRevision,
          offeringConfigId: configId,
          payloadHash,
          previousRevision: current?.revision,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: current ? "CONFIGURATION_UPDATED" : "CONFIGURATION_CREATED",
        },
      })
      return loadConfiguration(tx, input)
    }, BOOKING_TRANSACTION_OPTIONS)
  } catch (error) {
    return translateBookingTransactionError(error)
  }
}
