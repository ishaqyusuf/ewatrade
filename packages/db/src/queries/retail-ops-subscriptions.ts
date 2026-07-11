import { Prisma } from "../generated/prisma/client"
import {
  BillingCheckoutSessionStatus as DurableBillingCheckoutSessionStatus,
  BillingInvoiceStatus as DurableBillingInvoiceStatus,
  BillingProvider as DurableBillingProvider,
  BillingProviderEventStatus as DurableBillingProviderEventStatus,
  BillingSubscriptionStatus as DurableBillingSubscriptionStatus,
  OfflineDevicePlatform as DurableOfflineDevicePlatform,
  OfflineDeviceStatus as DurableOfflineDeviceStatus,
} from "../generated/prisma/enums"
import type { DbClient } from "./types"

export type RetailOpsPlanId = "growth" | "pro" | "starter"
export type RetailOpsSubscriptionStatus =
  | "active"
  | "cancelled"
  | "past_due"
  | "trialing"

export type RetailOpsPlanLimits = {
  businesses: number
  offlineDevices: number
  products: number
  reportsHistoryDays: number
  staff: number
}

export type RetailOpsSubscriptionPlan = {
  description: string
  id: RetailOpsPlanId
  limits: RetailOpsPlanLimits
  name: string
  priceLabel: string
  supportLabel: string
}

export type RetailOpsSubscriptionUsage = {
  businesses: number
  offlineDevices: number
  products: number
  staff: number
}

export type RetailOpsEntitlementUsage = {
  isAtLimit: boolean
  key: keyof RetailOpsPlanLimits
  limit: number
  used: number
}

export type RetailOpsTenantSubscription = {
  currentPeriodEndsAt: string | null
  planId: RetailOpsPlanId
  source: "default_trial" | "tenant_metadata" | "tenant_subscription"
  status: RetailOpsSubscriptionStatus
  trialEndsAt: string | null
  updatedAt: string
}

export type RetailOpsSubscriptionSnapshot = {
  entitlements: RetailOpsEntitlementUsage[]
  plan: RetailOpsSubscriptionPlan
  plans: RetailOpsSubscriptionPlan[]
  subscription: RetailOpsTenantSubscription
  tenant: {
    id: string
    name: string
    slug: string
  }
  usage: RetailOpsSubscriptionUsage
}

export type RetailOpsSubscriptionCheckoutSurface =
  | "dashboard"
  | "mobile"
  | "unknown"

export type RetailOpsSubscriptionCheckoutIntentStatus =
  | "active_plan"
  | "provider_not_configured"

export type RetailOpsSubscriptionCheckoutIntent = {
  checkoutUrl: string | null
  createdAt: string
  currentPlan: RetailOpsSubscriptionPlan
  intent: {
    id: string
    requestedByUserId: string
    status: RetailOpsSubscriptionCheckoutIntentStatus
    surface: RetailOpsSubscriptionCheckoutSurface
  }
  message: string
  provider: "none"
  subscription: RetailOpsTenantSubscription
  targetPlan: RetailOpsSubscriptionPlan
  tenant: {
    id: string
    name: string
    slug: string
  }
}

export type RetailOpsBillingProvider =
  | "app_store"
  | "manual"
  | "other"
  | "play_store"
  | "stripe"

export type RetailOpsBillingProviderEventKind =
  | "checkout_cancelled"
  | "checkout_completed"
  | "checkout_expired"
  | "checkout_failed"
  | "checkout_pending"
  | "invoice_opened"
  | "invoice_paid"
  | "invoice_uncollectible"
  | "invoice_voided"
  | "noop"
  | "subscription_activated"
  | "subscription_cancelled"
  | "subscription_past_due"
  | "subscription_updated"

export type RetailOpsBillingCheckoutEventStatus =
  | "cancelled"
  | "completed"
  | "expired"
  | "failed"
  | "pending"

export type RetailOpsBillingInvoiceEventStatus =
  | "draft"
  | "open"
  | "paid"
  | "uncollectible"
  | "void"

export type RetailOpsBillingProviderEventInput = {
  checkout?: {
    cancelledAt?: Date | string | null
    checkoutSessionId?: string | null
    checkoutUrl?: string | null
    completedAt?: Date | string | null
    externalId?: string | null
    expiresAt?: Date | string | null
    providerSessionId?: string | null
    status?: RetailOpsBillingCheckoutEventStatus
    tenantId?: string | null
  }
  eventId: string
  invoice?: {
    amountDueMinor?: number
    amountPaidMinor?: number
    currencyCode?: string
    dueAt?: Date | string | null
    hostedInvoiceUrl?: string | null
    issuedAt?: Date | string | null
    paidAt?: Date | string | null
    periodEndsAt?: Date | string | null
    periodStartsAt?: Date | string | null
    planId?: RetailOpsPlanId
    providerInvoiceId?: string | null
    status?: RetailOpsBillingInvoiceEventStatus
    tenantId?: string | null
    voidedAt?: Date | string | null
  }
  metadata?: Record<string, unknown>
  payload?: unknown
  provider: RetailOpsBillingProvider
  receivedAt?: Date | string
  subscription?: {
    billingCustomerId?: string | null
    billingSubscriptionId?: string | null
    cancelAtPeriodEnd?: boolean
    cancellationReason?: string | null
    cancelledAt?: Date | string | null
    currentPeriodEndsAt?: Date | string | null
    currentPeriodStartsAt?: Date | string | null
    planId?: RetailOpsPlanId
    status?: RetailOpsSubscriptionStatus
    tenantId?: string | null
    trialEndsAt?: Date | string | null
    trialStartsAt?: Date | string | null
  }
  tenantId?: string | null
  type: RetailOpsBillingProviderEventKind
}

export type RetailOpsBillingProviderEventResult = {
  applied: {
    checkoutSessionId: string | null
    invoiceId: string | null
    tenantSubscriptionId: string | null
  }
  message: string
  providerEvent: {
    eventId: string
    id: string | null
    provider: RetailOpsBillingProvider
    status: "failed" | "processed" | "skipped" | "unavailable"
    type: RetailOpsBillingProviderEventKind
  }
}

export type RetailOpsOfflineDevicePlatform =
  | "android"
  | "ios"
  | "unknown"
  | "web"

export type RetailOpsOfflineDeviceRegistration = {
  actorUserId: string
  appVersion: string | null
  deviceId: string
  deviceName: string | null
  lastSeenAt: string
  platform: RetailOpsOfflineDevicePlatform
  registeredAt: string
  storeId: string | null
}

export type RetailOpsRevokedOfflineDevice =
  RetailOpsOfflineDeviceRegistration & {
    revokedAt: string
    revokedByUserId: string
  }

type RetailOpsOfflineDeviceErrorCode = "DEVICE_REVOKED"
type RetailOpsSubscriptionErrorCode = "ENTITLEMENT_LIMIT_REACHED"
type JsonRecord = Record<string, unknown>
type DurableSubscriptionPlan = {
  description: string | null
  id: string
  key: string
  limits: unknown
  name: string
  priceLabel: string | null
  supportLabel: string | null
}
type DurableTenantSubscription = {
  currentPeriodEndsAt: Date | null
  limitsSnapshot: unknown
  plan: DurableSubscriptionPlan
  planId: string
  status: string
  trialEndsAt: Date | null
  updatedAt: Date
}
type DurableOfflineDevice = {
  appVersion: string | null
  deviceId: string
  deviceName: string | null
  id: string
  lastSeenAt: Date
  platform: string
  registeredAt: Date
  registeredByUserId: string | null
  storeId: string | null
}
type DurableOfflineDeviceRevocation = {
  appVersion: string | null
  deviceId: string
  deviceName: string | null
  offlineDevice: DurableOfflineDevice | null
  platform: string
  revokedAt: Date
  revokedByUserId: string
}
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_REVOKED_OFFLINE_DEVICES = 100

function startOfDay(date: Date) {
  const normalizedDate = new Date(date)

  normalizedDate.setHours(0, 0, 0, 0)

  return normalizedDate
}

export class RetailOpsSubscriptionError extends Error {
  code: RetailOpsSubscriptionErrorCode
  entitlement: RetailOpsEntitlementUsage

  constructor(
    code: RetailOpsSubscriptionErrorCode,
    message: string,
    entitlement: RetailOpsEntitlementUsage,
  ) {
    super(message)
    this.name = "RetailOpsSubscriptionError"
    this.code = code
    this.entitlement = entitlement
  }
}

export class RetailOpsOfflineDeviceError extends Error {
  code: RetailOpsOfflineDeviceErrorCode

  constructor(code: RetailOpsOfflineDeviceErrorCode, message: string) {
    super(message)
    this.name = "RetailOpsOfflineDeviceError"
    this.code = code
  }
}

export const RETAIL_OPS_SUBSCRIPTION_PLANS: RetailOpsSubscriptionPlan[] = [
  {
    description: "For one shop starting with simple sales and stock tracking.",
    id: "starter",
    limits: {
      businesses: 1,
      offlineDevices: 1,
      products: 25,
      reportsHistoryDays: 30,
      staff: 2,
    },
    name: "Starter",
    priceLabel: "Trial",
    supportLabel: "Standard support",
  },
  {
    description: "For growing teams that need more attendants and history.",
    id: "growth",
    limits: {
      businesses: 3,
      offlineDevices: 5,
      products: 150,
      reportsHistoryDays: 180,
      staff: 10,
    },
    name: "Growth",
    priceLabel: "Most popular",
    supportLabel: "Priority support",
  },
  {
    description: "For multi-branch businesses with heavier operations.",
    id: "pro",
    limits: {
      businesses: 10,
      offlineDevices: 20,
      products: 500,
      reportsHistoryDays: 730,
      staff: 50,
    },
    name: "Pro",
    priceLabel: "Advanced",
    supportLabel: "Dedicated support",
  },
]

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return value as JsonRecord
}

function getStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function getNumberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getOptionalStringField(value: unknown) {
  return getStringField(value)?.trim() ?? null
}

function normalizeOfflineDevicePlatform(
  value: unknown,
): RetailOpsOfflineDevicePlatform {
  const platform = getOptionalStringField(value)

  if (platform === "android" || platform === "ios" || platform === "web") {
    return platform
  }

  return "unknown"
}

function getRetailOpsMetadata(metadata: unknown) {
  return asRecord(asRecord(metadata).retailOps)
}

function isDurableOfflineDeviceTableUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

function isDurableBillingTableUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

function toDurableOfflineDevicePlatform(
  platform: RetailOpsOfflineDevicePlatform,
) {
  if (platform === "android") return DurableOfflineDevicePlatform.ANDROID
  if (platform === "ios") return DurableOfflineDevicePlatform.IOS
  if (platform === "web") return DurableOfflineDevicePlatform.WEB

  return DurableOfflineDevicePlatform.UNKNOWN
}

function fromDurableOfflineDevicePlatform(
  platform: string,
): RetailOpsOfflineDevicePlatform {
  if (platform === DurableOfflineDevicePlatform.ANDROID) return "android"
  if (platform === DurableOfflineDevicePlatform.IOS) return "ios"
  if (platform === DurableOfflineDevicePlatform.WEB) return "web"

  return "unknown"
}

function mapDurableOfflineDevice(
  device: DurableOfflineDevice,
): RetailOpsOfflineDeviceRegistration {
  return {
    actorUserId: device.registeredByUserId ?? "",
    appVersion: device.appVersion,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    lastSeenAt: device.lastSeenAt.toISOString(),
    platform: fromDurableOfflineDevicePlatform(device.platform),
    registeredAt: device.registeredAt.toISOString(),
    storeId: device.storeId,
  }
}

function mapDurableOfflineDeviceRevocation(
  revocation: DurableOfflineDeviceRevocation,
): RetailOpsRevokedOfflineDevice {
  return {
    actorUserId: revocation.offlineDevice?.registeredByUserId ?? "",
    appVersion: revocation.appVersion,
    deviceId: revocation.deviceId,
    deviceName: revocation.deviceName,
    lastSeenAt:
      revocation.offlineDevice?.lastSeenAt.toISOString() ??
      revocation.revokedAt.toISOString(),
    platform: fromDurableOfflineDevicePlatform(revocation.platform),
    registeredAt:
      revocation.offlineDevice?.registeredAt.toISOString() ??
      revocation.revokedAt.toISOString(),
    revokedAt: revocation.revokedAt.toISOString(),
    revokedByUserId: revocation.revokedByUserId,
    storeId: revocation.offlineDevice?.storeId ?? null,
  }
}

function sortOfflineDevicesByLastSeen(
  devices: RetailOpsOfflineDeviceRegistration[],
) {
  return [...devices].sort(
    (left, right) =>
      new Date(right.lastSeenAt).getTime() -
      new Date(left.lastSeenAt).getTime(),
  )
}

function sortRevokedOfflineDevicesByRevokedAt(
  devices: RetailOpsRevokedOfflineDevice[],
) {
  return [...devices].sort(
    (left, right) =>
      new Date(right.revokedAt).getTime() - new Date(left.revokedAt).getTime(),
  )
}

function mergeOfflineDevices(input: {
  durableDevices: RetailOpsOfflineDeviceRegistration[]
  durableRevokedDevices?: RetailOpsRevokedOfflineDevice[]
  metadataDevices: RetailOpsOfflineDeviceRegistration[]
}) {
  const durableRevokedDeviceIds = new Set(
    input.durableRevokedDevices?.map((device) => device.deviceId) ?? [],
  )
  const devicesById = new Map<string, RetailOpsOfflineDeviceRegistration>()

  for (const device of input.metadataDevices) {
    if (!durableRevokedDeviceIds.has(device.deviceId)) {
      devicesById.set(device.deviceId, device)
    }
  }

  for (const device of input.durableDevices) {
    devicesById.set(device.deviceId, device)
  }

  return sortOfflineDevicesByLastSeen([...devicesById.values()])
}

function mergeRevokedOfflineDevices(input: {
  durableDevices: RetailOpsRevokedOfflineDevice[]
  metadataDevices: RetailOpsRevokedOfflineDevice[]
}) {
  const devicesById = new Map<string, RetailOpsRevokedOfflineDevice>()

  for (const device of input.metadataDevices) {
    devicesById.set(device.deviceId, device)
  }

  for (const device of input.durableDevices) {
    devicesById.set(device.deviceId, device)
  }

  return sortRevokedOfflineDevicesByRevokedAt([...devicesById.values()])
}

function throwRevokedOfflineDeviceError() {
  throw new RetailOpsOfflineDeviceError(
    "DEVICE_REVOKED",
    "This offline device has been revoked. Ask a manager to re-enable it before syncing.",
  )
}

function getOfflineDevices(
  metadata: unknown,
): RetailOpsOfflineDeviceRegistration[] {
  const devices = getRetailOpsMetadata(metadata).offlineDevices

  if (!Array.isArray(devices)) return []

  return devices.flatMap((device) => {
    const record = asRecord(device)
    const deviceId = getOptionalStringField(record.deviceId)
    const registeredAt = normalizeIsoDate(record.registeredAt)
    const lastSeenAt = normalizeIsoDate(record.lastSeenAt)
    const actorUserId = getOptionalStringField(record.actorUserId)

    if (!deviceId || !registeredAt || !lastSeenAt || !actorUserId) return []

    return {
      actorUserId,
      appVersion: getOptionalStringField(record.appVersion),
      deviceId,
      deviceName: getOptionalStringField(record.deviceName),
      lastSeenAt,
      platform: normalizeOfflineDevicePlatform(record.platform),
      registeredAt,
      storeId: getOptionalStringField(record.storeId),
    }
  })
}

function getRevokedOfflineDevices(
  metadata: unknown,
): RetailOpsRevokedOfflineDevice[] {
  const devices = getRetailOpsMetadata(metadata).revokedOfflineDevices

  if (!Array.isArray(devices)) return []

  return devices.flatMap((device) => {
    const record = asRecord(device)
    const deviceId = getOptionalStringField(record.deviceId)
    const registeredAt = normalizeIsoDate(record.registeredAt)
    const lastSeenAt = normalizeIsoDate(record.lastSeenAt)
    const actorUserId = getOptionalStringField(record.actorUserId)
    const revokedAt = normalizeIsoDate(record.revokedAt)
    const revokedByUserId = getOptionalStringField(record.revokedByUserId)

    if (
      !deviceId ||
      !registeredAt ||
      !lastSeenAt ||
      !actorUserId ||
      !revokedAt ||
      !revokedByUserId
    ) {
      return []
    }

    return {
      actorUserId,
      appVersion: getOptionalStringField(record.appVersion),
      deviceId,
      deviceName: getOptionalStringField(record.deviceName),
      lastSeenAt,
      platform: normalizeOfflineDevicePlatform(record.platform),
      registeredAt,
      revokedAt,
      revokedByUserId,
      storeId: getOptionalStringField(record.storeId),
    }
  })
}

function withOfflineDevices(
  metadata: unknown,
  devices: RetailOpsOfflineDeviceRegistration[],
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      offlineDevices: devices,
    },
  } as Prisma.InputJsonValue
}

function withOfflineDeviceState(
  metadata: unknown,
  input: {
    devices: RetailOpsOfflineDeviceRegistration[]
    revokedDevices: RetailOpsRevokedOfflineDevice[]
  },
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      offlineDevices: input.devices,
      revokedOfflineDevices: input.revokedDevices,
    },
  } as Prisma.InputJsonValue
}

function getPlan(planId: RetailOpsPlanId) {
  return (
    RETAIL_OPS_SUBSCRIPTION_PLANS.find((plan) => plan.id === planId) ??
    (RETAIL_OPS_SUBSCRIPTION_PLANS[0] as RetailOpsSubscriptionPlan)
  )
}

function getPlanFromList(
  plans: RetailOpsSubscriptionPlan[],
  planId: RetailOpsPlanId,
) {
  return plans.find((plan) => plan.id === planId) ?? getPlan(planId)
}

function createCheckoutIntentId(input: {
  planId: RetailOpsPlanId
  requestedByUserId: string
  tenantId: string
}) {
  const token = Math.random().toString(36).slice(2, 10)

  return `retail_ops_checkout:${input.tenantId}:${input.planId}:${input.requestedByUserId}:${token}`
}

function normalizePlanId(value: unknown): RetailOpsPlanId | null {
  const planId = getStringField(value)

  if (planId === "growth" || planId === "pro" || planId === "starter") {
    return planId
  }

  return null
}

function normalizePlanLimit(
  value: unknown,
  fallback: number,
): number {
  const normalizedValue = getNumberField(value)

  if (normalizedValue === null) return fallback

  return Math.max(0, Math.floor(normalizedValue))
}

function normalizePlanLimits(
  value: unknown,
  fallback: RetailOpsPlanLimits,
): RetailOpsPlanLimits {
  const limits = asRecord(value)

  return {
    businesses: normalizePlanLimit(limits.businesses, fallback.businesses),
    offlineDevices: normalizePlanLimit(
      limits.offlineDevices,
      fallback.offlineDevices,
    ),
    products: normalizePlanLimit(limits.products, fallback.products),
    reportsHistoryDays: normalizePlanLimit(
      limits.reportsHistoryDays,
      fallback.reportsHistoryDays,
    ),
    staff: normalizePlanLimit(limits.staff, fallback.staff),
  }
}

function normalizeStatus(value: unknown): RetailOpsSubscriptionStatus | null {
  const status = getStringField(value)

  if (
    status === "active" ||
    status === "cancelled" ||
    status === "past_due" ||
    status === "trialing"
  ) {
    return status
  }

  return null
}

function fromDurableSubscriptionStatus(
  status: string,
): RetailOpsSubscriptionStatus {
  if (status === DurableBillingSubscriptionStatus.ACTIVE) return "active"
  if (status === DurableBillingSubscriptionStatus.CANCELLED) return "cancelled"
  if (status === DurableBillingSubscriptionStatus.PAST_DUE) return "past_due"

  return "trialing"
}

function toDurableBillingProvider(provider: RetailOpsBillingProvider) {
  if (provider === "app_store") return DurableBillingProvider.APP_STORE
  if (provider === "manual") return DurableBillingProvider.MANUAL
  if (provider === "play_store") return DurableBillingProvider.PLAY_STORE
  if (provider === "stripe") return DurableBillingProvider.STRIPE

  return DurableBillingProvider.OTHER
}

function fromDurableBillingProvider(provider: string): RetailOpsBillingProvider {
  if (provider === DurableBillingProvider.APP_STORE) return "app_store"
  if (provider === DurableBillingProvider.MANUAL) return "manual"
  if (provider === DurableBillingProvider.PLAY_STORE) return "play_store"
  if (provider === DurableBillingProvider.STRIPE) return "stripe"

  return "other"
}

function toDurableSubscriptionStatus(status: RetailOpsSubscriptionStatus) {
  if (status === "active") return DurableBillingSubscriptionStatus.ACTIVE
  if (status === "cancelled") {
    return DurableBillingSubscriptionStatus.CANCELLED
  }
  if (status === "past_due") return DurableBillingSubscriptionStatus.PAST_DUE

  return DurableBillingSubscriptionStatus.TRIALING
}

function toDurableCheckoutStatus(
  status: RetailOpsBillingCheckoutEventStatus,
) {
  if (status === "cancelled") return DurableBillingCheckoutSessionStatus.CANCELLED
  if (status === "completed") return DurableBillingCheckoutSessionStatus.COMPLETED
  if (status === "expired") return DurableBillingCheckoutSessionStatus.EXPIRED
  if (status === "failed") return DurableBillingCheckoutSessionStatus.FAILED

  return DurableBillingCheckoutSessionStatus.PENDING
}

function toDurableInvoiceStatus(status: RetailOpsBillingInvoiceEventStatus) {
  if (status === "paid") return DurableBillingInvoiceStatus.PAID
  if (status === "open") return DurableBillingInvoiceStatus.OPEN
  if (status === "uncollectible") {
    return DurableBillingInvoiceStatus.UNCOLLECTIBLE
  }
  if (status === "void") return DurableBillingInvoiceStatus.VOID

  return DurableBillingInvoiceStatus.DRAFT
}

function getDefaultCheckoutStatus(
  type: RetailOpsBillingProviderEventKind,
): RetailOpsBillingCheckoutEventStatus {
  if (type === "checkout_cancelled") return "cancelled"
  if (type === "checkout_completed") return "completed"
  if (type === "checkout_expired") return "expired"
  if (type === "checkout_failed") return "failed"

  return "pending"
}

function getDefaultInvoiceStatus(
  type: RetailOpsBillingProviderEventKind,
): RetailOpsBillingInvoiceEventStatus {
  if (type === "invoice_paid") return "paid"
  if (type === "invoice_opened") return "open"
  if (type === "invoice_uncollectible") return "uncollectible"
  if (type === "invoice_voided") return "void"

  return "draft"
}

function getDefaultSubscriptionStatus(
  type: RetailOpsBillingProviderEventKind,
): RetailOpsSubscriptionStatus | null {
  if (
    type === "checkout_completed" ||
    type === "invoice_paid" ||
    type === "subscription_activated" ||
    type === "subscription_updated"
  ) {
    return "active"
  }

  if (
    type === "invoice_uncollectible" ||
    type === "subscription_past_due"
  ) {
    return "past_due"
  }

  if (type === "subscription_cancelled") return "cancelled"

  return null
}

function normalizeBillingDate(value: Date | string | null | undefined) {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return null

  return date
}

function normalizeBillingDateUpdate(
  value: Date | string | null | undefined,
) {
  return value === undefined ? undefined : normalizeBillingDate(value)
}

function normalizeBillingString(value: string | null | undefined) {
  return value?.trim() || null
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue
}

function withBillingProviderEventMetadata(
  metadata: unknown,
  input: {
    eventId: string
    eventType: RetailOpsBillingProviderEventKind
    provider: RetailOpsBillingProvider
    providerEventId: string
  },
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      billingProviderEvent: input,
    },
  } as Prisma.InputJsonValue
}

function normalizeIsoDate(value: unknown) {
  const rawValue = getStringField(value)

  if (!rawValue) return null

  const date = new Date(rawValue)

  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

function mapDurableRetailOpsSubscriptionPlan(
  plan: DurableSubscriptionPlan,
): RetailOpsSubscriptionPlan | null {
  const planId = normalizePlanId(plan.key)

  if (!planId) return null

  const fallbackPlan = getPlan(planId)

  return {
    description: plan.description?.trim() || fallbackPlan.description,
    id: planId,
    limits: normalizePlanLimits(plan.limits, fallbackPlan.limits),
    name: plan.name.trim() || fallbackPlan.name,
    priceLabel: plan.priceLabel?.trim() || fallbackPlan.priceLabel,
    supportLabel: plan.supportLabel?.trim() || fallbackPlan.supportLabel,
  }
}

function mergeDurableRetailOpsSubscriptionPlans(
  durablePlans: DurableSubscriptionPlan[],
) {
  const plansById = new Map<RetailOpsPlanId, RetailOpsSubscriptionPlan>()

  for (const plan of RETAIL_OPS_SUBSCRIPTION_PLANS) {
    plansById.set(plan.id, plan)
  }

  for (const durablePlan of durablePlans) {
    const mappedPlan = mapDurableRetailOpsSubscriptionPlan(durablePlan)

    if (mappedPlan) {
      plansById.set(mappedPlan.id, mappedPlan)
    }
  }

  return RETAIL_OPS_SUBSCRIPTION_PLANS.map((plan) => plansById.get(plan.id) ?? plan)
}

function mapDurableRetailOpsTenantSubscription(
  subscription: DurableTenantSubscription,
): {
  plan: RetailOpsSubscriptionPlan
  subscription: RetailOpsTenantSubscription
} | null {
  const mappedPlan = mapDurableRetailOpsSubscriptionPlan(subscription.plan)

  if (!mappedPlan) return null

  return {
    plan: {
      ...mappedPlan,
      limits: normalizePlanLimits(
        subscription.limitsSnapshot,
        mappedPlan.limits,
      ),
    },
    subscription: {
      currentPeriodEndsAt:
        subscription.currentPeriodEndsAt?.toISOString() ?? null,
      planId: mappedPlan.id,
      source: "tenant_subscription",
      status: fromDurableSubscriptionStatus(subscription.status),
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      updatedAt: subscription.updatedAt.toISOString(),
    },
  }
}

function getDefaultTrialEndsAt(createdAt: Date) {
  const trialEndsAt = new Date(createdAt)

  trialEndsAt.setDate(trialEndsAt.getDate() + 14)

  return trialEndsAt.toISOString()
}

function getTenantSubscription(input: {
  createdAt: Date
  metadata: unknown
  updatedAt: Date
}): RetailOpsTenantSubscription {
  const retailOps = getRetailOpsMetadata(input.metadata)
  const subscription = asRecord(retailOps.subscription)
  const planId = normalizePlanId(subscription.planId)

  if (planId) {
    return {
      currentPeriodEndsAt: normalizeIsoDate(subscription.currentPeriodEndsAt),
      planId,
      source: "tenant_metadata",
      status: normalizeStatus(subscription.status) ?? "trialing",
      trialEndsAt: normalizeIsoDate(subscription.trialEndsAt),
      updatedAt:
        normalizeIsoDate(subscription.updatedAt) ??
        input.updatedAt.toISOString(),
    }
  }

  return {
    currentPeriodEndsAt: null,
    planId: "starter",
    source: "default_trial",
    status: "trialing",
    trialEndsAt: getDefaultTrialEndsAt(input.createdAt),
    updatedAt: input.updatedAt.toISOString(),
  }
}

async function getDurableRetailOpsSubscriptionState(
  db: DbClient,
  input: {
    tenant: {
      createdAt: Date
      id: string
      metadata: unknown
      updatedAt: Date
    }
  },
): Promise<{
  plan: RetailOpsSubscriptionPlan
  plans: RetailOpsSubscriptionPlan[]
  subscription: RetailOpsTenantSubscription
}> {
  try {
    const [durablePlans, durableSubscription] = await Promise.all([
      db.subscriptionPlan.findMany({
        where: {
          isActive: true,
        },
        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            name: "asc",
          },
        ],
        select: {
          description: true,
          id: true,
          key: true,
          limits: true,
          name: true,
          priceLabel: true,
          supportLabel: true,
        },
      }),
      db.tenantSubscription.findUnique({
        where: {
          tenantId: input.tenant.id,
        },
        include: {
          plan: {
            select: {
              description: true,
              id: true,
              key: true,
              limits: true,
              name: true,
              priceLabel: true,
              supportLabel: true,
            },
          },
        },
      }),
    ])
    const plans = mergeDurableRetailOpsSubscriptionPlans(durablePlans)
    const durableSubscriptionState = durableSubscription
      ? mapDurableRetailOpsTenantSubscription(durableSubscription)
      : null

    if (durableSubscriptionState) {
      return {
        plan: durableSubscriptionState.plan,
        plans,
        subscription: durableSubscriptionState.subscription,
      }
    }

    const metadataSubscription = getTenantSubscription(input.tenant)

    return {
      plan: getPlanFromList(plans, metadataSubscription.planId),
      plans,
      subscription: metadataSubscription,
    }
  } catch (error) {
    if (!isDurableBillingTableUnavailable(error)) {
      throw error
    }

    const subscription = getTenantSubscription(input.tenant)

    return {
      plan: getPlan(subscription.planId),
      plans: RETAIL_OPS_SUBSCRIPTION_PLANS,
      subscription,
    }
  }
}

function getEntitlementUsage(input: {
  plan: RetailOpsSubscriptionPlan
  usage: RetailOpsSubscriptionUsage
}): RetailOpsEntitlementUsage[] {
  return [
    {
      isAtLimit: input.usage.businesses >= input.plan.limits.businesses,
      key: "businesses",
      limit: input.plan.limits.businesses,
      used: input.usage.businesses,
    },
    {
      isAtLimit: input.usage.products >= input.plan.limits.products,
      key: "products",
      limit: input.plan.limits.products,
      used: input.usage.products,
    },
    {
      isAtLimit: input.usage.staff >= input.plan.limits.staff,
      key: "staff",
      limit: input.plan.limits.staff,
      used: input.usage.staff,
    },
    {
      isAtLimit: input.usage.offlineDevices >= input.plan.limits.offlineDevices,
      key: "offlineDevices",
      limit: input.plan.limits.offlineDevices,
      used: input.usage.offlineDevices,
    },
    {
      isAtLimit: false,
      key: "reportsHistoryDays",
      limit: input.plan.limits.reportsHistoryDays,
      used: 0,
    },
  ]
}

async function listDurableRetailOpsOfflineDevices(
  db: DbClient,
  input: {
    tenantId: string
  },
): Promise<RetailOpsOfflineDeviceRegistration[]> {
  const devices = await db.offlineDevice.findMany({
    where: {
      status: DurableOfflineDeviceStatus.ACTIVE,
      tenantId: input.tenantId,
    },
    orderBy: {
      lastSeenAt: "desc",
    },
  })

  return devices.map(mapDurableOfflineDevice)
}

async function listDurableRetailOpsRevokedOfflineDevices(
  db: DbClient,
  input: {
    tenantId: string
  },
): Promise<RetailOpsRevokedOfflineDevice[]> {
  const devices = await db.offlineDeviceRevocation.findMany({
    where: {
      restoredAt: null,
      tenantId: input.tenantId,
    },
    include: {
      offlineDevice: true,
    },
    orderBy: {
      revokedAt: "desc",
    },
  })

  return devices.map(mapDurableOfflineDeviceRevocation)
}

async function getRetailOpsOfflineDeviceUsageCount(
  db: DbClient,
  input: {
    metadata: unknown
    tenantId: string
  },
) {
  const metadataDevices = getOfflineDevices(input.metadata)

  try {
    const [durableDevices, durableRevokedDevices] = await Promise.all([
      listDurableRetailOpsOfflineDevices(db, {
        tenantId: input.tenantId,
      }),
      listDurableRetailOpsRevokedOfflineDevices(db, {
        tenantId: input.tenantId,
      }),
    ])

    return mergeOfflineDevices({
      durableDevices,
      durableRevokedDevices,
      metadataDevices,
    }).length
  } catch (error) {
    if (isDurableOfflineDeviceTableUnavailable(error)) {
      return metadataDevices.length
    }

    throw error
  }
}

async function ensureDurableRetailOpsSubscriptionPlan(
  db: DbClient,
  input: {
    plan: RetailOpsSubscriptionPlan
  },
) {
  const sortOrder = RETAIL_OPS_SUBSCRIPTION_PLANS.findIndex(
    (plan) => plan.id === input.plan.id,
  )

  return db.subscriptionPlan.upsert({
    where: {
      key: input.plan.id,
    },
    create: {
      description: input.plan.description,
      isActive: true,
      key: input.plan.id,
      limits: input.plan.limits as Prisma.InputJsonValue,
      name: input.plan.name,
      priceLabel: input.plan.priceLabel,
      sortOrder: sortOrder < 0 ? 0 : sortOrder,
      supportLabel: input.plan.supportLabel,
    },
    update: {
      description: input.plan.description,
      isActive: true,
      limits: input.plan.limits as Prisma.InputJsonValue,
      name: input.plan.name,
      priceLabel: input.plan.priceLabel,
      sortOrder: sortOrder < 0 ? 0 : sortOrder,
      supportLabel: input.plan.supportLabel,
    },
    select: {
      id: true,
    },
  })
}

async function createDurableRetailOpsSubscriptionCheckoutIntent(
  db: DbClient,
  input: {
    currentPlan: RetailOpsSubscriptionPlan
    planId: RetailOpsPlanId
    requestedByUserId: string
    status: RetailOpsSubscriptionCheckoutIntentStatus
    surface: RetailOpsSubscriptionCheckoutSurface
    targetPlan: RetailOpsSubscriptionPlan
    tenantId: string
  },
): Promise<{ createdAt: string; id: string } | null> {
  if (input.status === "active_plan") return null

  try {
    const [targetPlan, tenantSubscription] = await Promise.all([
      ensureDurableRetailOpsSubscriptionPlan(db, {
        plan: input.targetPlan,
      }),
      db.tenantSubscription.findUnique({
        where: {
          tenantId: input.tenantId,
        },
        select: {
          id: true,
        },
      }),
    ])
    const checkoutSession = await db.billingCheckoutSession.create({
      data: {
        externalId: createCheckoutIntentId(input),
        metadata: {
          retailOps: {
            currentPlanId: input.currentPlan.id,
            providerConfigured: false,
            status: input.status,
            targetPlanId: input.targetPlan.id,
          },
        } as Prisma.InputJsonValue,
        planId: targetPlan.id,
        provider: DurableBillingProvider.NONE,
        requestedByUserId: input.requestedByUserId,
        status: DurableBillingCheckoutSessionStatus.CREATED,
        surface: input.surface,
        tenantId: input.tenantId,
        tenantSubscriptionId: tenantSubscription?.id ?? null,
      },
      select: {
        createdAt: true,
        id: true,
      },
    })

    return {
      createdAt: checkoutSession.createdAt.toISOString(),
      id: checkoutSession.id,
    }
  } catch (error) {
    if (isDurableBillingTableUnavailable(error)) {
      return null
    }

    throw error
  }
}

export async function getRetailOpsSubscriptionSnapshot(
  db: DbClient,
  input: {
    tenantId: string
  },
): Promise<RetailOpsSubscriptionSnapshot> {
  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      createdAt: true,
      id: true,
      metadata: true,
      name: true,
      slug: true,
      updatedAt: true,
    },
  })
  const [businesses, products, staff, offlineDevices] = await Promise.all([
    db.store.count({
      where: {
        tenantId: input.tenantId,
        status: { not: "ARCHIVED" },
      },
    }),
    db.product.count({
      where: {
        tenantId: input.tenantId,
        status: { not: "ARCHIVED" },
      },
    }),
    db.membership.count({
      where: {
        tenantId: input.tenantId,
        role: {
          in: ["CASHIER", "MANAGER", "OPERATOR"],
        },
        status: {
          in: ["ACTIVE", "INVITED", "SUSPENDED"],
        },
      },
    }),
    getRetailOpsOfflineDeviceUsageCount(db, {
      metadata: tenant.metadata,
      tenantId: input.tenantId,
    }),
  ])
  const subscriptionState = await getDurableRetailOpsSubscriptionState(db, {
    tenant,
  })
  const usage: RetailOpsSubscriptionUsage = {
    businesses,
    offlineDevices,
    products,
    staff,
  }

  return {
    entitlements: getEntitlementUsage({
      plan: subscriptionState.plan,
      usage,
    }),
    plan: subscriptionState.plan,
    plans: subscriptionState.plans,
    subscription: subscriptionState.subscription,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    },
    usage,
  }
}

export async function createRetailOpsSubscriptionCheckoutIntent(
  db: DbClient,
  input: {
    planId: RetailOpsPlanId
    requestedByUserId: string
    surface?: RetailOpsSubscriptionCheckoutSurface
    tenantId: string
  },
): Promise<RetailOpsSubscriptionCheckoutIntent> {
  const snapshot = await getRetailOpsSubscriptionSnapshot(db, {
    tenantId: input.tenantId,
  })
  const targetPlan = getPlanFromList(snapshot.plans, input.planId)
  const status: RetailOpsSubscriptionCheckoutIntentStatus =
    snapshot.plan.id === targetPlan.id
      ? "active_plan"
      : "provider_not_configured"
  const surface = input.surface ?? "unknown"
  const durableCheckoutIntent =
    await createDurableRetailOpsSubscriptionCheckoutIntent(db, {
      currentPlan: snapshot.plan,
      planId: targetPlan.id,
      requestedByUserId: input.requestedByUserId,
      status,
      surface,
      targetPlan,
      tenantId: input.tenantId,
    })

  return {
    checkoutUrl: null,
    createdAt: durableCheckoutIntent?.createdAt ?? new Date().toISOString(),
    currentPlan: snapshot.plan,
    intent: {
      id:
        durableCheckoutIntent?.id ??
        createCheckoutIntentId({
          planId: targetPlan.id,
          requestedByUserId: input.requestedByUserId,
          tenantId: input.tenantId,
        }),
      requestedByUserId: input.requestedByUserId,
      status,
      surface,
    },
    message:
      status === "active_plan"
        ? `${targetPlan.name} is already the active Retail Ops plan.`
        : "Billing checkout is not configured yet. This intent preserves the provider-neutral upgrade boundary.",
    provider: "none",
    subscription: snapshot.subscription,
    targetPlan,
    tenant: snapshot.tenant,
  }
}

function getBillingEventTenantId(input: RetailOpsBillingProviderEventInput) {
  return (
    normalizeBillingString(input.subscription?.tenantId) ??
    normalizeBillingString(input.invoice?.tenantId) ??
    normalizeBillingString(input.checkout?.tenantId) ??
    normalizeBillingString(input.tenantId)
  )
}

async function getBillingProviderEventRecord(
  db: DbClient,
  input: RetailOpsBillingProviderEventInput,
) {
  const provider = toDurableBillingProvider(input.provider)
  const existingEvent = await db.billingProviderEvent.findUnique({
    where: {
      provider_eventId: {
        eventId: input.eventId,
        provider,
      },
    },
    select: {
      eventId: true,
      id: true,
      provider: true,
      status: true,
      type: true,
    },
  })

  if (existingEvent?.status === DurableBillingProviderEventStatus.PROCESSED) {
    return {
      alreadyProcessed: true,
      record: existingEvent,
    }
  }

  const eventData = {
    errorMessage: null,
    failedAt: null,
    metadata: input.metadata
      ? toInputJsonValue(input.metadata)
      : undefined,
    payload: toInputJsonValue(input.payload),
    processedAt: null,
    receivedAt: normalizeBillingDate(input.receivedAt) ?? new Date(),
    status: DurableBillingProviderEventStatus.PENDING,
    tenantId: getBillingEventTenantId(input),
    type: input.type,
  }

  if (existingEvent) {
    return {
      alreadyProcessed: false,
      record: await db.billingProviderEvent.update({
        where: {
          id: existingEvent.id,
        },
        data: eventData,
        select: {
          eventId: true,
          id: true,
          provider: true,
          status: true,
          type: true,
        },
      }),
    }
  }

  return {
    alreadyProcessed: false,
    record: await db.billingProviderEvent.create({
      data: {
        ...eventData,
        eventId: input.eventId,
        provider,
      },
      select: {
        eventId: true,
        id: true,
        provider: true,
        status: true,
        type: true,
      },
    }),
  }
}

async function findBillingCheckoutSession(
  db: DbClient,
  input: RetailOpsBillingProviderEventInput,
) {
  const checkout = input.checkout
  const checkoutSessionId = normalizeBillingString(checkout?.checkoutSessionId)
  const providerSessionId = normalizeBillingString(checkout?.providerSessionId)
  const externalId = normalizeBillingString(checkout?.externalId)
  const tenantId = getBillingEventTenantId(input)
  const provider = toDurableBillingProvider(input.provider)
  const include = {
    plan: {
      select: {
        description: true,
        id: true,
        key: true,
        limits: true,
        name: true,
        priceLabel: true,
        supportLabel: true,
      },
    },
  }

  if (checkoutSessionId) {
    return db.billingCheckoutSession.findUnique({
      where: {
        id: checkoutSessionId,
      },
      include,
    })
  }

  if (providerSessionId) {
    const providerSession = await db.billingCheckoutSession.findUnique({
      where: {
        provider_providerSessionId: {
          provider,
          providerSessionId,
        },
      },
      include,
    })

    if (providerSession) return providerSession
  }

  if (tenantId && externalId) {
    return db.billingCheckoutSession.findUnique({
      where: {
        tenantId_externalId: {
          externalId,
          tenantId,
        },
      },
      include,
    })
  }

  if (externalId) {
    return db.billingCheckoutSession.findFirst({
      where: {
        externalId,
      },
      include,
    })
  }

  return null
}

async function applyBillingCheckoutEvent(
  db: DbClient,
  input: RetailOpsBillingProviderEventInput,
  providerEventId: string,
) {
  if (!input.checkout) return null

  const checkoutSession = await findBillingCheckoutSession(db, input)

  if (!checkoutSession) return null

  const status = toDurableCheckoutStatus(
    input.checkout.status ?? getDefaultCheckoutStatus(input.type),
  )
  const updatedSession = await db.billingCheckoutSession.update({
    where: {
      id: checkoutSession.id,
    },
    data: {
      cancelledAt:
        normalizeBillingDate(input.checkout.cancelledAt) ??
        (status === DurableBillingCheckoutSessionStatus.CANCELLED
          ? new Date()
          : undefined),
      checkoutUrl:
        input.checkout.checkoutUrl === undefined
          ? undefined
          : input.checkout.checkoutUrl,
      completedAt:
        normalizeBillingDate(input.checkout.completedAt) ??
        (status === DurableBillingCheckoutSessionStatus.COMPLETED
          ? new Date()
          : undefined),
      expiresAt: normalizeBillingDate(input.checkout.expiresAt) ?? undefined,
      metadata: withBillingProviderEventMetadata(checkoutSession.metadata, {
        eventId: input.eventId,
        eventType: input.type,
        provider: input.provider,
        providerEventId,
      }),
      provider: toDurableBillingProvider(input.provider),
      providerSessionId:
        normalizeBillingString(input.checkout.providerSessionId) ?? undefined,
      status,
    },
    include: {
      plan: {
        select: {
          description: true,
          id: true,
          key: true,
          limits: true,
          name: true,
          priceLabel: true,
          supportLabel: true,
        },
      },
    },
  })

  return {
    id: updatedSession.id,
    planId: normalizePlanId(updatedSession.plan.key),
    tenantId: updatedSession.tenantId,
  }
}

async function applyBillingSubscriptionEvent(
  db: DbClient,
  input: RetailOpsBillingProviderEventInput,
  providerEventId: string,
  fallback?: {
    planId: RetailOpsPlanId | null
    tenantId: string | null
  },
) {
  if (!input.subscription && input.type !== "checkout_completed") return null

  const tenantId =
    normalizeBillingString(input.subscription?.tenantId) ??
    fallback?.tenantId ??
    normalizeBillingString(input.tenantId)

  if (!tenantId) return null

  const existingSubscription = await db.tenantSubscription.findUnique({
    where: {
      tenantId,
    },
    include: {
      plan: {
        select: {
          description: true,
          id: true,
          key: true,
          limits: true,
          name: true,
          priceLabel: true,
          supportLabel: true,
        },
      },
    },
  })
  const existingPlan = existingSubscription
    ? mapDurableRetailOpsSubscriptionPlan(existingSubscription.plan)
    : null
  const planId =
    input.subscription?.planId ?? fallback?.planId ?? existingPlan?.id ?? null

  if (!planId) return null

  const plan = getPlan(planId)
  const durablePlan = await ensureDurableRetailOpsSubscriptionPlan(db, {
    plan,
  })
  const status =
    input.subscription?.status ??
    getDefaultSubscriptionStatus(input.type) ??
    fromDurableSubscriptionStatus(
      existingSubscription?.status ??
        DurableBillingSubscriptionStatus.TRIALING,
    )
  const subscription = await db.tenantSubscription.upsert({
    where: {
      tenantId,
    },
    create: {
      billingCustomerId:
        normalizeBillingString(input.subscription?.billingCustomerId) ??
        undefined,
      billingSubscriptionId:
        normalizeBillingString(input.subscription?.billingSubscriptionId) ??
        undefined,
      cancelAtPeriodEnd: input.subscription?.cancelAtPeriodEnd ?? false,
      cancellationReason:
        normalizeBillingString(input.subscription?.cancellationReason) ??
        undefined,
      cancelledAt: normalizeBillingDate(input.subscription?.cancelledAt),
      currentPeriodEndsAt: normalizeBillingDate(
        input.subscription?.currentPeriodEndsAt,
      ),
      currentPeriodStartsAt: normalizeBillingDate(
        input.subscription?.currentPeriodStartsAt,
      ),
      limitsSnapshot: plan.limits as Prisma.InputJsonValue,
      metadata: withBillingProviderEventMetadata(undefined, {
        eventId: input.eventId,
        eventType: input.type,
        provider: input.provider,
        providerEventId,
      }),
      planId: durablePlan.id,
      provider: toDurableBillingProvider(input.provider),
      startedAt: new Date(),
      status: toDurableSubscriptionStatus(status),
      tenantId,
      trialEndsAt: normalizeBillingDate(input.subscription?.trialEndsAt),
      trialStartsAt: normalizeBillingDate(input.subscription?.trialStartsAt),
    },
    update: {
      billingCustomerId:
        normalizeBillingString(input.subscription?.billingCustomerId) ??
        undefined,
      billingSubscriptionId:
        normalizeBillingString(input.subscription?.billingSubscriptionId) ??
        undefined,
      cancelAtPeriodEnd: input.subscription?.cancelAtPeriodEnd ?? undefined,
      cancellationReason:
        normalizeBillingString(input.subscription?.cancellationReason) ??
        undefined,
      cancelledAt: normalizeBillingDateUpdate(input.subscription?.cancelledAt),
      currentPeriodEndsAt: normalizeBillingDateUpdate(
        input.subscription?.currentPeriodEndsAt,
      ),
      currentPeriodStartsAt: normalizeBillingDateUpdate(
        input.subscription?.currentPeriodStartsAt,
      ),
      limitsSnapshot: plan.limits as Prisma.InputJsonValue,
      metadata: withBillingProviderEventMetadata(existingSubscription?.metadata, {
        eventId: input.eventId,
        eventType: input.type,
        provider: input.provider,
        providerEventId,
      }),
      planId: durablePlan.id,
      provider: toDurableBillingProvider(input.provider),
      status: toDurableSubscriptionStatus(status),
      trialEndsAt: normalizeBillingDateUpdate(input.subscription?.trialEndsAt),
      trialStartsAt: normalizeBillingDateUpdate(
        input.subscription?.trialStartsAt,
      ),
    },
    select: {
      id: true,
    },
  })

  return {
    id: subscription.id,
    tenantId,
  }
}

async function applyBillingInvoiceEvent(
  db: DbClient,
  input: RetailOpsBillingProviderEventInput,
  providerEventId: string,
  fallback?: {
    planId: RetailOpsPlanId | null
    tenantId: string | null
  },
) {
  const invoice = input.invoice
  const providerInvoiceId = normalizeBillingString(invoice?.providerInvoiceId)

  if (!invoice || !providerInvoiceId) return null

  const tenantId =
    normalizeBillingString(invoice.tenantId) ??
    fallback?.tenantId ??
    normalizeBillingString(input.subscription?.tenantId) ??
    normalizeBillingString(input.tenantId)

  if (!tenantId) return null

  const planId = invoice.planId ?? fallback?.planId ?? input.subscription?.planId
  const durablePlan = planId
    ? await ensureDurableRetailOpsSubscriptionPlan(db, {
        plan: getPlan(planId),
      })
    : null
  const tenantSubscription = await db.tenantSubscription.findUnique({
    where: {
      tenantId,
    },
    select: {
      id: true,
    },
  })
  const status = toDurableInvoiceStatus(
    invoice.status ?? getDefaultInvoiceStatus(input.type),
  )
  const savedInvoice = await db.billingInvoice.upsert({
    where: {
      provider_providerInvoiceId: {
        provider: toDurableBillingProvider(input.provider),
        providerInvoiceId,
      },
    },
    create: {
      amountDueMinor: invoice.amountDueMinor ?? 0,
      amountPaidMinor: invoice.amountPaidMinor ?? 0,
      currencyCode: invoice.currencyCode?.trim() || "NGN",
      dueAt: normalizeBillingDate(invoice.dueAt),
      hostedInvoiceUrl: normalizeBillingString(invoice.hostedInvoiceUrl),
      issuedAt: normalizeBillingDate(invoice.issuedAt) ?? new Date(),
      metadata: withBillingProviderEventMetadata(undefined, {
        eventId: input.eventId,
        eventType: input.type,
        provider: input.provider,
        providerEventId,
      }),
      paidAt: normalizeBillingDate(invoice.paidAt),
      periodEndsAt: normalizeBillingDate(invoice.periodEndsAt),
      periodStartsAt: normalizeBillingDate(invoice.periodStartsAt),
      planId: durablePlan?.id,
      provider: toDurableBillingProvider(input.provider),
      providerInvoiceId,
      status,
      tenantId,
      tenantSubscriptionId: tenantSubscription?.id,
      voidedAt: normalizeBillingDate(invoice.voidedAt),
    },
    update: {
      amountDueMinor: invoice.amountDueMinor ?? undefined,
      amountPaidMinor: invoice.amountPaidMinor ?? undefined,
      currencyCode: invoice.currencyCode?.trim() || undefined,
      dueAt: normalizeBillingDateUpdate(invoice.dueAt),
      hostedInvoiceUrl:
        normalizeBillingString(invoice.hostedInvoiceUrl) ?? undefined,
      issuedAt: normalizeBillingDateUpdate(invoice.issuedAt),
      metadata: withBillingProviderEventMetadata(undefined, {
        eventId: input.eventId,
        eventType: input.type,
        provider: input.provider,
        providerEventId,
      }),
      paidAt: normalizeBillingDateUpdate(invoice.paidAt),
      periodEndsAt: normalizeBillingDateUpdate(invoice.periodEndsAt),
      periodStartsAt: normalizeBillingDateUpdate(invoice.periodStartsAt),
      planId: durablePlan?.id,
      status,
      tenantSubscriptionId: tenantSubscription?.id,
      voidedAt: normalizeBillingDateUpdate(invoice.voidedAt),
    },
    select: {
      id: true,
    },
  })

  return {
    id: savedInvoice.id,
    tenantId,
  }
}

function toBillingProviderEventResult(input: {
  checkoutSessionId?: string | null
  eventId: string
  id?: string | null
  invoiceId?: string | null
  message: string
  provider: string
  status: RetailOpsBillingProviderEventResult["providerEvent"]["status"]
  subscriptionId?: string | null
  type: RetailOpsBillingProviderEventKind
}): RetailOpsBillingProviderEventResult {
  return {
    applied: {
      checkoutSessionId: input.checkoutSessionId ?? null,
      invoiceId: input.invoiceId ?? null,
      tenantSubscriptionId: input.subscriptionId ?? null,
    },
    message: input.message,
    providerEvent: {
      eventId: input.eventId,
      id: input.id ?? null,
      provider: fromDurableBillingProvider(input.provider),
      status: input.status,
      type: input.type,
    },
  }
}

export async function processRetailOpsBillingProviderEvent(
  db: DbClient,
  input: RetailOpsBillingProviderEventInput,
): Promise<RetailOpsBillingProviderEventResult> {
  let providerEvent:
    | Awaited<ReturnType<typeof getBillingProviderEventRecord>>["record"]
    | null = null

  try {
    const eventRecord = await getBillingProviderEventRecord(db, input)
    providerEvent = eventRecord.record

    if (eventRecord.alreadyProcessed) {
      return toBillingProviderEventResult({
        eventId: providerEvent.eventId,
        id: providerEvent.id,
        message: "Billing provider event was already processed.",
        provider: providerEvent.provider,
        status: "skipped",
        type: providerEvent.type as RetailOpsBillingProviderEventKind,
      })
    }

    const checkout = await applyBillingCheckoutEvent(
      db,
      input,
      providerEvent.id,
    )
    const subscription = await applyBillingSubscriptionEvent(
      db,
      input,
      providerEvent.id,
      checkout
        ? {
            planId: checkout.planId,
            tenantId: checkout.tenantId,
          }
        : undefined,
    )
    const invoice = await applyBillingInvoiceEvent(
      db,
      input,
      providerEvent.id,
      checkout
        ? {
            planId: checkout.planId,
            tenantId: checkout.tenantId,
          }
        : undefined,
    )
    const applied = Boolean(checkout || subscription || invoice)
    const status = applied
      ? DurableBillingProviderEventStatus.PROCESSED
      : DurableBillingProviderEventStatus.SKIPPED
    const tenantId =
      subscription?.tenantId ?? invoice?.tenantId ?? checkout?.tenantId ?? null
    const savedEvent = await db.billingProviderEvent.update({
      where: {
        id: providerEvent.id,
      },
      data: {
        errorMessage: null,
        failedAt: null,
        processedAt: new Date(),
        status,
        tenantId,
      },
      select: {
        eventId: true,
        id: true,
        provider: true,
        status: true,
        type: true,
      },
    })

    return toBillingProviderEventResult({
      checkoutSessionId: checkout?.id,
      eventId: savedEvent.eventId,
      id: savedEvent.id,
      invoiceId: invoice?.id,
      message: applied
        ? "Billing provider event processed."
        : "Billing provider event was recorded without an actionable subscription, checkout, or invoice payload.",
      provider: savedEvent.provider,
      status: applied ? "processed" : "skipped",
      subscriptionId: subscription?.id,
      type: input.type,
    })
  } catch (error) {
    if (isDurableBillingTableUnavailable(error)) {
      return toBillingProviderEventResult({
        eventId: input.eventId,
        message:
          "Billing provider event bridge is unavailable because durable billing tables are not deployed.",
        provider: toDurableBillingProvider(input.provider),
        status: "unavailable",
        type: input.type,
      })
    }

    if (providerEvent) {
      await db.billingProviderEvent.update({
        where: {
          id: providerEvent.id,
        },
        data: {
          errorMessage:
            error instanceof Error ? error.message : "Unknown billing error",
          failedAt: new Date(),
          status: DurableBillingProviderEventStatus.FAILED,
        },
      })
    }

    throw error
  }
}

export async function assertRetailOpsEntitlementAvailable(
  db: DbClient,
  input: {
    key: keyof RetailOpsPlanLimits
    tenantId: string
  },
) {
  const snapshot = await getRetailOpsSubscriptionSnapshot(db, {
    tenantId: input.tenantId,
  })
  const entitlement = snapshot.entitlements.find(
    (currentEntitlement) => currentEntitlement.key === input.key,
  )

  if (entitlement?.isAtLimit) {
    throw new RetailOpsSubscriptionError(
      "ENTITLEMENT_LIMIT_REACHED",
      `The ${snapshot.plan.name} plan limit for ${input.key} has been reached.`,
      entitlement,
    )
  }

  return snapshot
}

export async function assertRetailOpsReportRangeAllowed(
  db: DbClient,
  input: {
    from?: Date
    now?: Date
    tenantId: string
  },
) {
  if (!input.from) return null

  const now = input.now ?? new Date()
  const snapshot = await getRetailOpsSubscriptionSnapshot(db, {
    tenantId: input.tenantId,
  })
  const reportsHistoryEntitlement = snapshot.entitlements.find(
    (entitlement) => entitlement.key === "reportsHistoryDays",
  )

  if (!reportsHistoryEntitlement) return snapshot

  const requestedDays = Math.max(
    0,
    Math.floor(
      (startOfDay(now).getTime() - startOfDay(input.from).getTime()) / DAY_MS,
    ),
  )

  if (requestedDays > reportsHistoryEntitlement.limit) {
    throw new RetailOpsSubscriptionError(
      "ENTITLEMENT_LIMIT_REACHED",
      `${snapshot.plan.name} includes ${reportsHistoryEntitlement.limit} days of report history.`,
      {
        ...reportsHistoryEntitlement,
        isAtLimit: true,
        used: requestedDays,
      },
    )
  }

  return snapshot
}

async function registerRetailOpsOfflineDeviceInDurable(
  db: DbClient,
  input: {
    actorUserId: string
    appVersion?: string | null
    deviceId: string
    deviceName?: string | null
    platform: RetailOpsOfflineDevicePlatform
    storeId?: string | null
    tenantId: string
  },
): Promise<RetailOpsOfflineDeviceRegistration> {
  const deviceId = input.deviceId.trim()
  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  })
  const metadataDevices = getOfflineDevices(tenant.metadata)
  const metadataDevice = metadataDevices.find(
    (device) => device.deviceId === deviceId,
  )
  const metadataRevokedDevice = getRevokedOfflineDevices(tenant.metadata).find(
    (device) => device.deviceId === deviceId,
  )

  if (metadataRevokedDevice) {
    throwRevokedOfflineDeviceError()
  }

  const [durableDevice, durableRevocation] = await Promise.all([
    db.offlineDevice.findUnique({
      where: {
        tenantId_deviceId: {
          deviceId,
          tenantId: input.tenantId,
        },
      },
    }),
    db.offlineDeviceRevocation.findFirst({
      where: {
        deviceId,
        restoredAt: null,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
      },
    }),
  ])

  if (durableRevocation) {
    throwRevokedOfflineDeviceError()
  }

  if (!durableDevice && !metadataDevice) {
    await assertRetailOpsEntitlementAvailable(db, {
      key: "offlineDevices",
      tenantId: input.tenantId,
    })
  }

  const now = new Date()
  const appVersion = input.appVersion?.trim() || null
  const deviceName = input.deviceName?.trim() || null
  const storeId =
    input.storeId ?? metadataDevice?.storeId ?? durableDevice?.storeId ?? null
  const device = await db.offlineDevice.upsert({
    where: {
      tenantId_deviceId: {
        deviceId,
        tenantId: input.tenantId,
      },
    },
    create: {
      appVersion,
      deviceId,
      deviceName,
      lastSeenAt: now,
      platform: toDurableOfflineDevicePlatform(input.platform),
      registeredAt: metadataDevice
        ? new Date(metadataDevice.registeredAt)
        : now,
      registeredByUserId: input.actorUserId,
      status: DurableOfflineDeviceStatus.ACTIVE,
      storeId,
      tenantId: input.tenantId,
    },
    update: {
      appVersion,
      deviceName,
      lastSeenAt: now,
      platform: toDurableOfflineDevicePlatform(input.platform),
      registeredByUserId: input.actorUserId,
      revokedAt: null,
      revokedByUserId: null,
      status: DurableOfflineDeviceStatus.ACTIVE,
      storeId,
    },
  })

  return mapDurableOfflineDevice(device)
}

async function revokeRetailOpsOfflineDeviceInDurable(
  db: DbClient,
  input: {
    deviceId: string
    revokedByUserId: string
    tenantId: string
  },
): Promise<RetailOpsOfflineDeviceRegistration | null> {
  const deviceId = input.deviceId.trim()
  const device = await db.offlineDevice.findFirst({
    where: {
      deviceId,
      status: DurableOfflineDeviceStatus.ACTIVE,
      tenantId: input.tenantId,
    },
  })

  if (!device) return null

  const revokedAt = new Date()

  await db.offlineDeviceRevocation.create({
    data: {
      appVersion: device.appVersion,
      deviceId,
      deviceName: device.deviceName,
      offlineDeviceId: device.id,
      platform: device.platform,
      revokedAt,
      revokedByUserId: input.revokedByUserId,
      tenantId: input.tenantId,
    },
  })
  await db.offlineDevice.update({
    where: {
      id: device.id,
    },
    data: {
      lastSeenAt: revokedAt,
      revokedAt,
      revokedByUserId: input.revokedByUserId,
      status: DurableOfflineDeviceStatus.REVOKED,
    },
    select: {
      id: true,
    },
  })

  return mapDurableOfflineDevice(device)
}

async function restoreRetailOpsOfflineDeviceInDurable(
  db: DbClient,
  input: {
    deviceId: string
    tenantId: string
  },
): Promise<RetailOpsRevokedOfflineDevice | null> {
  const deviceId = input.deviceId.trim()
  const revocation = await db.offlineDeviceRevocation.findFirst({
    where: {
      deviceId,
      restoredAt: null,
      tenantId: input.tenantId,
    },
    include: {
      offlineDevice: true,
    },
    orderBy: {
      revokedAt: "desc",
    },
  })

  if (!revocation) return null

  const restoredAt = new Date()

  await db.offlineDeviceRevocation.update({
    where: {
      id: revocation.id,
    },
    data: {
      restoredAt,
    },
    select: {
      id: true,
    },
  })

  if (revocation.offlineDeviceId) {
    await db.offlineDevice.update({
      where: {
        id: revocation.offlineDeviceId,
      },
      data: {
        lastSeenAt: restoredAt,
        revokedAt: null,
        revokedByUserId: null,
        status: DurableOfflineDeviceStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    })
  } else {
    await db.offlineDevice.updateMany({
      where: {
        deviceId,
        tenantId: input.tenantId,
      },
      data: {
        lastSeenAt: restoredAt,
        revokedAt: null,
        revokedByUserId: null,
        status: DurableOfflineDeviceStatus.ACTIVE,
      },
    })
  }

  return mapDurableOfflineDeviceRevocation(revocation)
}

async function assertRetailOpsOfflineDeviceCanSyncInDurable(
  db: DbClient,
  input: {
    deviceId?: string | null
    tenantId: string
  },
) {
  const deviceId = input.deviceId?.trim()

  if (!deviceId) return null

  const [device, revocation] = await Promise.all([
    db.offlineDevice.findUnique({
      where: {
        tenantId_deviceId: {
          deviceId,
          tenantId: input.tenantId,
        },
      },
      select: {
        status: true,
      },
    }),
    db.offlineDeviceRevocation.findFirst({
      where: {
        deviceId,
        restoredAt: null,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
      },
    }),
  ])

  if (revocation || device?.status === DurableOfflineDeviceStatus.REVOKED) {
    throwRevokedOfflineDeviceError()
  }

  return null
}

export async function registerRetailOpsOfflineDevice(
  db: DbClient,
  input: {
    actorUserId: string
    appVersion?: string | null
    deviceId: string
    deviceName?: string | null
    platform: RetailOpsOfflineDevicePlatform
    storeId?: string | null
    tenantId: string
  },
): Promise<RetailOpsOfflineDeviceRegistration> {
  try {
    return await registerRetailOpsOfflineDeviceInDurable(db, input)
  } catch (error) {
    if (isDurableOfflineDeviceTableUnavailable(error)) {
      return registerRetailOpsOfflineDeviceInMetadata(db, input)
    }

    throw error
  }
}

export async function listRetailOpsOfflineDevices(
  db: DbClient,
  input: {
    tenantId: string
  },
): Promise<RetailOpsOfflineDeviceRegistration[]> {
  try {
    const [metadataDevices, durableDevices, durableRevokedDevices] =
      await Promise.all([
        listRetailOpsOfflineDevicesFromMetadata(db, input),
        listDurableRetailOpsOfflineDevices(db, input),
        listDurableRetailOpsRevokedOfflineDevices(db, input),
      ])

    return mergeOfflineDevices({
      durableDevices,
      durableRevokedDevices,
      metadataDevices,
    })
  } catch (error) {
    if (isDurableOfflineDeviceTableUnavailable(error)) {
      return listRetailOpsOfflineDevicesFromMetadata(db, input)
    }

    throw error
  }
}

export async function listRetailOpsRevokedOfflineDevices(
  db: DbClient,
  input: {
    tenantId: string
  },
): Promise<RetailOpsRevokedOfflineDevice[]> {
  try {
    const [metadataDevices, durableDevices] = await Promise.all([
      listRetailOpsRevokedOfflineDevicesFromMetadata(db, input),
      listDurableRetailOpsRevokedOfflineDevices(db, input),
    ])

    return mergeRevokedOfflineDevices({
      durableDevices,
      metadataDevices,
    })
  } catch (error) {
    if (isDurableOfflineDeviceTableUnavailable(error)) {
      return listRetailOpsRevokedOfflineDevicesFromMetadata(db, input)
    }

    throw error
  }
}

export async function revokeRetailOpsOfflineDevice(
  db: DbClient,
  input: {
    deviceId: string
    revokedByUserId: string
    tenantId: string
  },
): Promise<RetailOpsOfflineDeviceRegistration | null> {
  try {
    const revokedDevice = await revokeRetailOpsOfflineDeviceInDurable(db, input)

    if (revokedDevice) {
      await revokeRetailOpsOfflineDeviceInMetadata(db, input)

      return revokedDevice
    }

    return revokeRetailOpsOfflineDeviceInMetadata(db, input)
  } catch (error) {
    if (isDurableOfflineDeviceTableUnavailable(error)) {
      return revokeRetailOpsOfflineDeviceInMetadata(db, input)
    }

    throw error
  }
}

export async function restoreRetailOpsOfflineDevice(
  db: DbClient,
  input: {
    deviceId: string
    tenantId: string
  },
): Promise<RetailOpsRevokedOfflineDevice | null> {
  try {
    const restoredDevice = await restoreRetailOpsOfflineDeviceInDurable(
      db,
      input,
    )

    if (restoredDevice) {
      await restoreRetailOpsOfflineDeviceInMetadata(db, input)

      return restoredDevice
    }

    return restoreRetailOpsOfflineDeviceInMetadata(db, input)
  } catch (error) {
    if (isDurableOfflineDeviceTableUnavailable(error)) {
      return restoreRetailOpsOfflineDeviceInMetadata(db, input)
    }

    throw error
  }
}

export async function assertRetailOpsOfflineDeviceCanSync(
  db: DbClient,
  input: {
    deviceId?: string | null
    tenantId: string
  },
) {
  try {
    await assertRetailOpsOfflineDeviceCanSyncInDurable(db, input)

    return assertRetailOpsOfflineDeviceCanSyncInMetadata(db, input)
  } catch (error) {
    if (isDurableOfflineDeviceTableUnavailable(error)) {
      return assertRetailOpsOfflineDeviceCanSyncInMetadata(db, input)
    }

    throw error
  }
}

async function registerRetailOpsOfflineDeviceInMetadata(
  db: DbClient,
  input: {
    actorUserId: string
    appVersion?: string | null
    deviceId: string
    deviceName?: string | null
    platform: RetailOpsOfflineDevicePlatform
    storeId?: string | null
    tenantId: string
  },
): Promise<RetailOpsOfflineDeviceRegistration> {
  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  })
  const devices = getOfflineDevices(tenant.metadata)
  const revokedDevices = getRevokedOfflineDevices(tenant.metadata)
  const now = new Date().toISOString()
  const deviceId = input.deviceId.trim()
  const revokedDevice = revokedDevices.find(
    (device) => device.deviceId === deviceId,
  )

  if (revokedDevice) {
    throwRevokedOfflineDeviceError()
  }

  const existingDevice = devices.find((device) => device.deviceId === deviceId)
  const nextDevice: RetailOpsOfflineDeviceRegistration = {
    actorUserId: input.actorUserId,
    appVersion: input.appVersion?.trim() || null,
    deviceId,
    deviceName: input.deviceName?.trim() || null,
    lastSeenAt: now,
    platform: input.platform,
    registeredAt: existingDevice?.registeredAt ?? now,
    storeId: input.storeId ?? null,
  }

  if (!existingDevice) {
    await assertRetailOpsEntitlementAvailable(db, {
      key: "offlineDevices",
      tenantId: input.tenantId,
    })
  }

  const nextDevices = existingDevice
    ? devices.map((device) =>
        device.deviceId === existingDevice.deviceId ? nextDevice : device,
      )
    : [nextDevice, ...devices]

  await db.tenant.update({
    where: {
      id: input.tenantId,
    },
    data: {
      metadata: withOfflineDevices(tenant.metadata, nextDevices),
    },
    select: {
      id: true,
    },
  })

  return nextDevice
}

async function listRetailOpsOfflineDevicesFromMetadata(
  db: DbClient,
  input: {
    tenantId: string
  },
): Promise<RetailOpsOfflineDeviceRegistration[]> {
  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  })

  return sortOfflineDevicesByLastSeen(getOfflineDevices(tenant.metadata))
}

async function listRetailOpsRevokedOfflineDevicesFromMetadata(
  db: DbClient,
  input: {
    tenantId: string
  },
): Promise<RetailOpsRevokedOfflineDevice[]> {
  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  })

  return sortRevokedOfflineDevicesByRevokedAt(
    getRevokedOfflineDevices(tenant.metadata),
  )
}

async function revokeRetailOpsOfflineDeviceInMetadata(
  db: DbClient,
  input: {
    deviceId: string
    revokedByUserId: string
    tenantId: string
  },
): Promise<RetailOpsOfflineDeviceRegistration | null> {
  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  })
  const deviceId = input.deviceId.trim()
  const devices = getOfflineDevices(tenant.metadata)
  const revokedDevices = getRevokedOfflineDevices(tenant.metadata)
  const revokedDevice = devices.find((device) => device.deviceId === deviceId)

  if (!revokedDevice) return null

  const nextRevokedDevice: RetailOpsRevokedOfflineDevice = {
    ...revokedDevice,
    revokedAt: new Date().toISOString(),
    revokedByUserId: input.revokedByUserId,
  }

  await db.tenant.update({
    where: {
      id: input.tenantId,
    },
    data: {
      metadata: withOfflineDeviceState(tenant.metadata, {
        devices: devices.filter((device) => device.deviceId !== deviceId),
        revokedDevices: [
          nextRevokedDevice,
          ...revokedDevices.filter((device) => device.deviceId !== deviceId),
        ].slice(0, MAX_REVOKED_OFFLINE_DEVICES),
      }),
    },
    select: {
      id: true,
    },
  })

  return revokedDevice
}

async function restoreRetailOpsOfflineDeviceInMetadata(
  db: DbClient,
  input: {
    deviceId: string
    tenantId: string
  },
): Promise<RetailOpsRevokedOfflineDevice | null> {
  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  })
  const deviceId = input.deviceId.trim()
  const devices = getOfflineDevices(tenant.metadata)
  const revokedDevices = getRevokedOfflineDevices(tenant.metadata)
  const restoredDevice = revokedDevices.find(
    (device) => device.deviceId === deviceId,
  )

  if (!restoredDevice) return null

  await db.tenant.update({
    where: {
      id: input.tenantId,
    },
    data: {
      metadata: withOfflineDeviceState(tenant.metadata, {
        devices,
        revokedDevices: revokedDevices.filter(
          (device) => device.deviceId !== deviceId,
        ),
      }),
    },
    select: {
      id: true,
    },
  })

  return restoredDevice
}

async function assertRetailOpsOfflineDeviceCanSyncInMetadata(
  db: DbClient,
  input: {
    deviceId?: string | null
    tenantId: string
  },
) {
  const deviceId = input.deviceId?.trim()

  if (!deviceId) return null

  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  })
  const revokedDevice = getRevokedOfflineDevices(tenant.metadata).find(
    (device) => device.deviceId === deviceId,
  )

  if (revokedDevice) {
    throwRevokedOfflineDeviceError()
  }

  return null
}
