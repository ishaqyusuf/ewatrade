import type { PrismaClient } from "../../../generated/prisma/client"
import {
  ServiceCommerceUsageEventType,
  ServiceCommerceUsageReconciliationStatus,
  ServiceCommerceUsageSourceKind,
} from "../../../generated/prisma/enums"

import type { ServiceCommerceCostInput, ServiceCommerceCostKey } from "./costs"
import { serviceCommerceCostKeys } from "./costs"

const sourceKindMap = {
  booking: ServiceCommerceUsageSourceKind.BOOKING,
  catalog: ServiceCommerceUsageSourceKind.CATALOG,
  commerce_inquiry: ServiceCommerceUsageSourceKind.COMMERCE_INQUIRY,
  customer_channel: ServiceCommerceUsageSourceKind.CUSTOMER_CHANNEL,
  fulfillment: ServiceCommerceUsageSourceKind.FULFILLMENT,
  media: ServiceCommerceUsageSourceKind.MEDIA,
  prescription: ServiceCommerceUsageSourceKind.PRESCRIPTION,
  service: ServiceCommerceUsageSourceKind.SERVICE,
} as const

const eventTypeMap = {
  delivery_reconciled: ServiceCommerceUsageEventType.DELIVERY_RECONCILED,
  message_delivered: ServiceCommerceUsageEventType.MESSAGE_DELIVERED,
  message_failed: ServiceCommerceUsageEventType.MESSAGE_FAILED,
  message_read: ServiceCommerceUsageEventType.MESSAGE_READ,
  message_sent: ServiceCommerceUsageEventType.MESSAGE_SENT,
  number_fee_reconciled: ServiceCommerceUsageEventType.NUMBER_FEE_RECONCILED,
  payment_reconciled: ServiceCommerceUsageEventType.PAYMENT_RECONCILED,
  platform_charge_reconciled:
    ServiceCommerceUsageEventType.PLATFORM_CHARGE_RECONCILED,
  subscription_charge_reconciled:
    ServiceCommerceUsageEventType.SUBSCRIPTION_CHARGE_RECONCILED,
  tax_reconciled: ServiceCommerceUsageEventType.TAX_RECONCILED,
} as const

type UsageAmounts = Partial<Record<ServiceCommerceCostKey, number | null>>

type UsageIdentity = Pick<
  RecordServiceCommerceUsageEventInput,
  | "billingOwnerSnapshot"
  | "connectionId"
  | "currencyCode"
  | "deduplicationKey"
  | "eventType"
  | "messageCategory"
  | "occurredAt"
  | "providerKey"
  | "recipientMarket"
  | "sourceId"
  | "sourceKind"
  | "storeId"
  | "tenantId"
>

export type RecordServiceCommerceUsageEventInput = UsageAmounts & {
  billingOwnerSnapshot?: string | null
  connectionId?: string | null
  currencyCode: string
  deduplicationKey: string
  eventType: keyof typeof eventTypeMap
  messageCategory?: string | null
  occurredAt: Date
  providerKey?: string | null
  recipientMarket?: string | null
  reconciliationSource?: string | null
  reconciliationStatus?: "failed" | "pending" | "reconciled"
  sourceId: string
  sourceKind: keyof typeof sourceKindMap
  storeId: string
  tenantId: string
}

/**
 * Transitions one pending, wholly unknown usage fact to its provider-verified
 * amount. The immutable usage identity is repeated so a reconciliation cannot
 * be applied to an unrelated event that happens to share a caller's key.
 */
export type ReconcileServiceCommerceUsageEventInput = UsageIdentity &
  UsageAmounts & {
    reconciledAt: Date
    reconciliationSource: string
  }

function assertUsageAmounts(input: UsageAmounts) {
  for (const key of serviceCommerceCostKeys) {
    const value = input[key]
    if (value === undefined || value === null) continue
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative safe minor-unit amount.`)
    }
  }
}

function assertReconciliationPayload(
  input: {
    reconciledAt: Date
    reconciliationSource: string
  } & UsageAmounts,
) {
  assertUsageAmounts(input)
  if (!Number.isFinite(input.reconciledAt.getTime())) {
    throw new Error("reconciledAt must be a valid Date.")
  }
  if (!input.reconciliationSource.trim()) {
    throw new Error("reconciliationSource is required.")
  }
  if (!serviceCommerceCostKeys.some((key) => input[key] !== undefined)) {
    throw new Error("At least one authoritative usage amount is required.")
  }
  if (serviceCommerceCostKeys.some((key) => input[key] === null)) {
    throw new Error("Authoritative usage amounts cannot be null.")
  }
}

function sameOptionalValue(left: unknown, right: unknown) {
  return (left ?? null) === (right ?? null)
}

function assertImmutableUsageReplay(
  recorded: {
    billingOwnerSnapshot: string | null
    bspCostMinor: number | null
    connectionId: string | null
    currencyCode: string
    deliveryCostMinor: number | null
    eventType: ServiceCommerceUsageEventType
    messageCategory: string | null
    metaCostMinor: number | null
    numberCostMinor: number | null
    occurredAt: Date
    paymentProviderFeeMinor: number | null
    platformChargeMinor: number | null
    providerKey: string | null
    recipientMarket: string | null
    reconciliationSource: string | null
    reconciliationStatus: ServiceCommerceUsageReconciliationStatus
    reconciledAt: Date | null
    revenueMinor: number | null
    sourceId: string
    sourceKind: ServiceCommerceUsageSourceKind
    storeId: string
    subscriptionChargeMinor: number | null
    taxMinor: number | null
    tenantId: string
  },
  input: RecordServiceCommerceUsageEventInput,
  reconciliationStatus: ServiceCommerceUsageReconciliationStatus,
) {
  const expectedReconciledAt =
    reconciliationStatus === ServiceCommerceUsageReconciliationStatus.RECONCILED
      ? input.occurredAt
      : null
  const matches =
    recorded.tenantId === input.tenantId &&
    recorded.storeId === input.storeId &&
    sameOptionalValue(recorded.connectionId, input.connectionId) &&
    recorded.sourceKind === sourceKindMap[input.sourceKind] &&
    recorded.sourceId === input.sourceId &&
    recorded.eventType === eventTypeMap[input.eventType] &&
    recorded.occurredAt.getTime() === input.occurredAt.getTime() &&
    sameOptionalValue(recorded.providerKey, input.providerKey) &&
    sameOptionalValue(
      recorded.billingOwnerSnapshot,
      input.billingOwnerSnapshot,
    ) &&
    sameOptionalValue(recorded.messageCategory, input.messageCategory) &&
    sameOptionalValue(recorded.recipientMarket, input.recipientMarket) &&
    recorded.currencyCode === input.currencyCode &&
    serviceCommerceCostKeys.every((key) =>
      sameOptionalValue(recorded[key], input[key]),
    ) &&
    recorded.reconciliationStatus === reconciliationStatus &&
    sameOptionalValue(
      recorded.reconciliationSource,
      input.reconciliationSource,
    ) &&
    sameOptionalValue(
      recorded.reconciledAt?.getTime(),
      expectedReconciledAt?.getTime(),
    )

  if (!matches) {
    throw new Error("SERVICE_COMMERCE_USAGE_DEDUPLICATION_CONFLICT")
  }
}

function assertUsageIdentity(
  recorded: {
    billingOwnerSnapshot: string | null
    connectionId: string | null
    currencyCode: string
    eventType: ServiceCommerceUsageEventType
    messageCategory: string | null
    occurredAt: Date
    providerKey: string | null
    recipientMarket: string | null
    sourceId: string
    sourceKind: ServiceCommerceUsageSourceKind
    storeId: string
    tenantId: string
  },
  input: UsageIdentity,
) {
  const matches =
    recorded.tenantId === input.tenantId &&
    recorded.storeId === input.storeId &&
    sameOptionalValue(recorded.connectionId, input.connectionId) &&
    recorded.sourceKind === sourceKindMap[input.sourceKind] &&
    recorded.sourceId === input.sourceId &&
    recorded.eventType === eventTypeMap[input.eventType] &&
    recorded.occurredAt.getTime() === input.occurredAt.getTime() &&
    sameOptionalValue(recorded.providerKey, input.providerKey) &&
    sameOptionalValue(
      recorded.billingOwnerSnapshot,
      input.billingOwnerSnapshot,
    ) &&
    sameOptionalValue(recorded.messageCategory, input.messageCategory) &&
    sameOptionalValue(recorded.recipientMarket, input.recipientMarket) &&
    recorded.currencyCode === input.currencyCode

  if (!matches) {
    throw new Error("SERVICE_COMMERCE_USAGE_RECONCILIATION_IDENTITY_MISMATCH")
  }
}

async function assertUsageScope(
  db: PrismaClient,
  input: Pick<UsageIdentity, "connectionId" | "storeId" | "tenantId">,
) {
  const [store, connection] = await Promise.all([
    db.store.findFirst({
      select: { id: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    }),
    input.connectionId
      ? db.whatsAppConnection.findFirst({
          select: { id: true },
          where: {
            id: input.connectionId,
            bindings: {
              some: { storeId: input.storeId, tenantId: input.tenantId },
            },
            tenantId: input.tenantId,
          },
        })
      : Promise.resolve(null),
  ])
  if (!store || (input.connectionId && !connection)) {
    throw new Error("SERVICE_COMMERCE_USAGE_SCOPE_MISMATCH")
  }
}

export async function recordServiceCommerceUsageEvent(
  db: PrismaClient,
  input: RecordServiceCommerceUsageEventInput,
) {
  assertUsageAmounts(input)
  await assertUsageScope(db, input)
  const reconciliationStatus =
    input.reconciliationStatus === "reconciled"
      ? ServiceCommerceUsageReconciliationStatus.RECONCILED
      : input.reconciliationStatus === "failed"
        ? ServiceCommerceUsageReconciliationStatus.FAILED
        : ServiceCommerceUsageReconciliationStatus.PENDING
  const costs = Object.fromEntries(
    serviceCommerceCostKeys.map((key) => [key, input[key]]),
  ) as UsageAmounts

  const recorded = await db.serviceCommerceUsageEvent.upsert({
    create: {
      ...costs,
      billingOwnerSnapshot: input.billingOwnerSnapshot,
      connectionId: input.connectionId,
      currencyCode: input.currencyCode,
      deduplicationKey: input.deduplicationKey,
      eventType: eventTypeMap[input.eventType],
      messageCategory: input.messageCategory,
      occurredAt: input.occurredAt,
      providerKey: input.providerKey,
      recipientMarket: input.recipientMarket,
      reconciledAt:
        reconciliationStatus ===
        ServiceCommerceUsageReconciliationStatus.RECONCILED
          ? input.occurredAt
          : undefined,
      reconciliationSource: input.reconciliationSource,
      reconciliationStatus,
      sourceId: input.sourceId,
      sourceKind: sourceKindMap[input.sourceKind],
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    update: {},
    where: {
      tenantId_deduplicationKey: {
        deduplicationKey: input.deduplicationKey,
        tenantId: input.tenantId,
      },
    },
  })
  assertImmutableUsageReplay(recorded, input, reconciliationStatus)
  return recorded
}

export async function reconcileServiceCommerceUsageEvent(
  db: PrismaClient,
  input: ReconcileServiceCommerceUsageEventInput,
) {
  assertReconciliationPayload(input)
  await assertUsageScope(db, input)

  const existing = await db.serviceCommerceUsageEvent.findUnique({
    where: {
      tenantId_deduplicationKey: {
        deduplicationKey: input.deduplicationKey,
        tenantId: input.tenantId,
      },
    },
  })
  if (!existing) {
    throw new Error("SERVICE_COMMERCE_USAGE_RECONCILIATION_NOT_FOUND")
  }
  assertUsageIdentity(existing, input)

  const costs = Object.fromEntries(
    serviceCommerceCostKeys.map((key) => [key, input[key] ?? null]),
  ) as Required<UsageAmounts>
  const isExactReplay =
    existing.reconciliationStatus ===
      ServiceCommerceUsageReconciliationStatus.RECONCILED &&
    existing.reconciliationSource === input.reconciliationSource &&
    existing.reconciledAt?.getTime() === input.reconciledAt.getTime() &&
    serviceCommerceCostKeys.every((key) => existing[key] === costs[key])
  if (isExactReplay) return existing

  if (
    existing.reconciliationStatus !==
      ServiceCommerceUsageReconciliationStatus.PENDING ||
    serviceCommerceCostKeys.some((key) => existing[key] !== null)
  ) {
    throw new Error("SERVICE_COMMERCE_USAGE_RECONCILIATION_CONFLICT")
  }

  const reconciled = await db.serviceCommerceUsageEvent.updateMany({
    data: {
      ...costs,
      reconciledAt: input.reconciledAt,
      reconciliationSource: input.reconciliationSource,
      reconciliationStatus: ServiceCommerceUsageReconciliationStatus.RECONCILED,
    },
    where: {
      id: existing.id,
      reconciliationStatus: ServiceCommerceUsageReconciliationStatus.PENDING,
      ...Object.fromEntries(serviceCommerceCostKeys.map((key) => [key, null])),
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (reconciled.count === 1) {
    return db.serviceCommerceUsageEvent.findUniqueOrThrow({
      where: { id: existing.id },
    })
  }

  const current = await db.serviceCommerceUsageEvent.findUniqueOrThrow({
    where: { id: existing.id },
  })
  assertUsageIdentity(current, input)
  const replayed =
    current.reconciliationStatus ===
      ServiceCommerceUsageReconciliationStatus.RECONCILED &&
    current.reconciliationSource === input.reconciliationSource &&
    current.reconciledAt?.getTime() === input.reconciledAt.getTime() &&
    serviceCommerceCostKeys.every((key) => current[key] === costs[key])
  if (replayed) return current
  throw new Error("SERVICE_COMMERCE_USAGE_RECONCILIATION_CONFLICT")
}

export function prescriptionUsageAmountsToServiceCommerce(event: {
  amounts: unknown
  eventType: string
}): ServiceCommerceCostInput {
  const amounts =
    event.amounts &&
    typeof event.amounts === "object" &&
    !Array.isArray(event.amounts)
      ? (event.amounts as Record<string, unknown>)
      : {}
  return {
    deliveryCostMinor:
      typeof amounts.deliveryCostMinor === "number"
        ? amounts.deliveryCostMinor
        : null,
    eventType: event.eventType,
    metaCostMinor:
      typeof amounts.metaCostMinor === "number" ? amounts.metaCostMinor : null,
    paymentProviderFeeMinor:
      typeof amounts.paymentProviderFeeMinor === "number"
        ? amounts.paymentProviderFeeMinor
        : null,
    platformChargeMinor:
      typeof amounts.platformChargeMinor === "number"
        ? amounts.platformChargeMinor
        : null,
    subscriptionChargeMinor: null,
    revenueMinor:
      typeof amounts.pharmacyRevenueMinor === "number"
        ? amounts.pharmacyRevenueMinor
        : null,
    taxMinor: typeof amounts.taxMinor === "number" ? amounts.taxMinor : null,
  }
}
