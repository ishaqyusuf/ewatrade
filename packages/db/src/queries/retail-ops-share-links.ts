import { randomBytes } from "node:crypto"
import type {
  OrderStatus,
  Prisma,
  PrismaClient,
} from "../../generated/prisma/client"
import { recordRetailOpsSharedLinkCustomer } from "./retail-ops-customers"

export type CreateRetailOpsProductShareLinkInput = {
  actorUserId: string
  externalId?: string
  label?: string
  productId: string
  publicBaseUrl: string
  storeId: string
  tenantId: string
}

export type DeactivateRetailOpsProductShareLinkInput = {
  actorUserId: string
  canManageAllLinks: boolean
  externalId?: string
  productId: string
  shareLinkId: string
  storeId: string
  tenantId: string
}

export type ListRetailOpsProductShareLinksInput = {
  storeId: string
  tenantId: string
}

export type GetRetailOpsProductShareLinkAnalyticsInput =
  ListRetailOpsProductShareLinksInput & {
    actorUserId: string
    canManageAllLinks: boolean
    from?: Date
    productId?: string
    shareLinkId?: string
    to?: Date
  }

export type RetailOpsSharedLinkOrderRequestStatusFilter =
  | "all"
  | "cancelled"
  | "completed"
  | "pending"

export type RetailOpsSharedLinkNotificationDispatchStatus =
  | "failed"
  | "queued"
  | "sent"
  | "skipped"

export type RetailOpsSharedLinkNotificationDeliveryReceipt = {
  attemptedAt?: Date
  deliveryRole: "admin" | "customer"
  error?: string | null
  failedAt?: Date | string | null
  provider?: string | null
  providerMessageId?: string | null
  recipientEmail: string
  sentAt?: Date | string | null
  status: "failed" | "sent" | "skipped"
  subject?: string | null
}

export type RetailOpsSharedLinkPaymentMethod = "card" | "cash" | "transfer"
export type RetailOpsSharedLinkFulfillmentMethod =
  | "delivery"
  | "other"
  | "pickup"
export type RetailOpsSharedLinkFulfillmentStatus =
  | "delivered"
  | "pending"
  | "picked_up"
  | "ready_for_pickup"

export type ListRetailOpsSharedLinkOrderRequestsInput = {
  actorUserId: string
  canManageAllRequests: boolean
  from?: Date
  limit?: number
  status?: RetailOpsSharedLinkOrderRequestStatusFilter
  storeId: string
  tenantId: string
  to?: Date
}

export type UpdateRetailOpsSharedLinkOrderRequestStatusInput = {
  actorUserId: string
  canManageAllRequests: boolean
  cashierSessionId?: string
  fulfilledAt?: Date
  fulfillmentMethod?: RetailOpsSharedLinkFulfillmentMethod
  fulfillmentNote?: string
  fulfillmentStatus?: RetailOpsSharedLinkFulfillmentStatus
  orderId: string
  paidAt?: Date
  paymentMethod?: RetailOpsSharedLinkPaymentMethod
  status: "cancelled" | "completed"
  storeId: string
  tenantId: string
}

export type RecordRetailOpsSharedLinkNotificationDispatchInput = {
  attempt?: number
  attemptedAt?: Date
  deliveries?: RetailOpsSharedLinkNotificationDeliveryReceipt[]
  failureReason?: string
  maxAttempts?: number
  nextRetryAt?: Date | null
  notification?: RetailOpsSharedLinkOrderNotificationPayload
  orderId: string
  status: RetailOpsSharedLinkNotificationDispatchStatus
}

export type GetRetailOpsSharedProductInput = {
  productSlug: string
  recordView?: boolean
  storeSlug: string
  tenantSlug: string
  token: string
}

export type CreateRetailOpsSharedProductOrderRequestInput =
  GetRetailOpsSharedProductInput & {
    customerAccount?: {
      id: string
      mode: "login" | "register"
    }
    customerEmail: string
    customerName: string
    customerPhone?: string
    notes?: string
    productVariantId: string
    quantity: number
  }

export type RetailOpsProductShareLink = {
  active: boolean
  createdAt: string
  createdByUserId: string
  deactivatedAt: string | null
  id: string
  label: string | null
  lastActivityAt: string | null
  orderCount: number
  product: {
    id: string
    name: string
    slug: string
  }
  token: string
  url: string
  viewCount: number
}

export type RetailOpsProductShareLinkAnalyticsMetrics = {
  cancelledOrderCount: number
  completedOrderCount: number
  consumedQuantity: number
  orderRequestCount: number
  releasedQuantity: number
  reservedQuantity: number
  revenueMinor: number
  uniqueVisitorCount: number
  viewCount: number
}

export type RetailOpsProductShareLinkAnalytics = {
  daily: Array<
    RetailOpsProductShareLinkAnalyticsMetrics & {
      day: string
      product: {
        id: string
        name: string
        slug: string
      }
      shareLinkId: string
    }
  >
  linkSummaries: Array<
    RetailOpsProductShareLinkAnalyticsMetrics & {
      shareLink: RetailOpsProductShareLink
    }
  >
  range: {
    from: string
    to: string
  }
  source: "daily_rollup" | "link_counters"
  summary: RetailOpsProductShareLinkAnalyticsMetrics & {
    activeLinkCount: number
    linkCount: number
  }
}

export type RetailOpsSharedProduct = {
  product: {
    currencyCode: string
    description: string | null
    id: string
    imageUrl: string | null
    name: string
    slug: string
    variants: Array<{
      availableQuantity: number
      id: string
      isDefault: boolean
      name: string
      priceMinor: number
      sku: string
    }>
  }
  shareLink: RetailOpsProductShareLink
  store: {
    currencyCode: string
    id: string
    name: string
    slug: string
  }
  tenant: {
    id: string
    name: string
    slug: string
  }
}

export type CreatedRetailOpsSharedProductOrderRequest = {
  line: {
    productId: string
    productName: string
    quantity: number
    totalMinor: number
    unitName: string
    unitPriceMinor: number
  }
  order: {
    currencyCode: string
    id: string
    orderNumber: string
    paymentStatus: string
    status: string
    totalMinor: number
  }
  notification: RetailOpsSharedLinkOrderNotificationPayload
  shareLink: RetailOpsProductShareLink
}

export type RetailOpsSharedLinkOrderRequest = {
  createdAt: Date
  currencyCode: string
  customer: {
    email: string | null
    name: string | null
    phone: string | null
  }
  fulfillment: {
    fulfilledAt: string | null
    fulfilledByUserId: string | null
    method: string | null
    note: string | null
    status: string | null
  }
  id: string
  line: {
    id: string
    productId: string
    productName: string
    productVariantId: string | null
    quantity: number
    sku: string | null
    totalMinor: number
    unitName: string | null
    unitPriceMinor: number
  } | null
  notes: string | null
  notification: {
    attemptCount: number
    failedAt: string | null
    failureReason: string | null
    lastAttemptAt: string | null
    sentAt: string | null
    status: string | null
  }
  orderNumber: string
  paymentState: string | null
  paymentStatus: string
  receipt: {
    id: string
    issuedAt: Date
    paymentMethod: string | null
    receiptNumber: string
    totalMinor: number
  } | null
  reservation: {
    inventoryItemId: string | null
    productVariantId: string | null
    quantity: number | null
    status: string | null
  } | null
  shareLink: {
    active: boolean | null
    createdByUserId: string | null
    id: string | null
    label: string | null
    token: string | null
    url: string | null
  }
  status: string
  totalMinor: number
  updatedAt: Date
}

export type RetailOpsSharedLinkOrderNotificationPayload = {
  businessName: string
  customerEmail: string
  customerName: string
  customerPhone?: string | null
  merchantRecipients: Array<{
    displayName?: string | null
    email: string
  }>
  notes?: string | null
  orderId: string
  orderNumber: string
  productName: string
  productUrl?: string | null
  quantity: number
  totalFormatted: string
  unitName: string
}

type RetailOpsShareLinkErrorCode =
  | "INSUFFICIENT_STOCK"
  | "ORDER_REQUEST_ALREADY_FINALIZED"
  | "ORDER_REQUEST_FORBIDDEN"
  | "ORDER_REQUEST_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_VARIANT_NOT_FOUND"
  | "SHARE_LINK_FORBIDDEN"
  | "SHARE_LINK_NOT_FOUND"

export class RetailOpsShareLinkError extends Error {
  code: RetailOpsShareLinkErrorCode

  constructor(code: RetailOpsShareLinkErrorCode, message: string) {
    super(message)
    this.name = "RetailOpsShareLinkError"
    this.code = code
  }
}

type JsonRecord = Record<string, unknown>
type SharedLinkReservationStatus = "consumed" | "released" | "reserved"

type SharedLinkReservationMetadata = {
  consumedAt: string | null
  consumedByUserId: string | null
  inventoryItemId: string | null
  productVariantId: string | null
  quantity: number | null
  releasedAt: string | null
  releasedByUserId: string | null
  reservedAt: string | null
  status: SharedLinkReservationStatus | null
}

type ProductShareLinkMetadata = {
  active: boolean
  createdAt: string
  createdByUserId: string
  deactivatedAt?: string | null
  deactivationExternalId?: string | null
  deactivatedByUserId?: string | null
  externalId?: string | null
  id: string
  label?: string | null
  lastActivityAt?: string | null
  orderCount?: number
  token: string
  url: string
  viewCount?: number
}

type DurableProductShareLinkRow = {
  createExternalId: string | null
  createdAt: Date
  createdByUserId: string
  deactivateExternalId: string | null
  deactivatedAt: Date | null
  deactivatedByUserId: string | null
  id: string
  label: string | null
  lastActivityAt: Date | null
  orderCount: number
  status: string
  token: string
  url: string
  viewCount: number
}

type DurableProductShareLinkWithProduct = DurableProductShareLinkRow & {
  product: {
    id: string
    name: string
    slug: string
  }
}

type DurableProductShareLinkWithSharedProduct = DurableProductShareLinkRow & {
  product: {
    currencyCode: string
    description: string | null
    id: string
    metadata: unknown
    name: string
    slug: string
    store: {
      currencyCode: string
      id: string
      name: string
      slug: string
      tenant: {
        id: string
        name: string
        slug: string
      }
    }
    variants: Array<{
      id: string
      inventoryItem: {
        onHandQuantity: number
        reservedQuantity: number
      } | null
      isDefault: boolean
      name: string
      priceMinor: number
      sku: string
    }>
  }
}

type SharedLinkOrderRequestOrderLineRow = {
  id: string
  metadata: unknown
  nameSnapshot: string
  productId: string
  productVariantId: string | null
  quantity: number
  skuSnapshot: string | null
  totalPriceMinor: number
  unitPriceMinor: number
  product: {
    metadata: unknown
  }
}

type SharedLinkOrderRequestOrderRow = {
  createdAt: Date
  currencyCode: string
  customerEmail: string | null
  customerName: string | null
  customerPhone: string | null
  id: string
  metadata: unknown
  notes: string | null
  orderNumber: string
  paymentStatus: string
  status: string
  totalMinor: number
  updatedAt: Date
  receipts: Array<{
    id: string
    issuedAt: Date
    paymentMethod: string | null
    receiptNumber: string
    totalMinor: number
  }>
  items: SharedLinkOrderRequestOrderLineRow[]
}

type SharedLinkOrderRequestShareLinkSummary = {
  active: boolean | null
  createdByUserId: string | null
  id: string | null
  label: string | null
  token: string | null
  url: string | null
}

type DurableSharedLinkReservationRow = {
  metadata: unknown
  productVariantId: string
  quantity: number
  status: string
}

type DurableSharedLinkNotificationRow = {
  failedAt: Date | null
  failureReason: string | null
  sentAt: Date | null
  status: string
  updatedAt: Date
}

type DurableShareLinkAnalyticsDelta = {
  cancelledOrderCount?: number
  completedOrderCount?: number
  consumedQuantity?: number
  orderRequestCount?: number
  releasedQuantity?: number
  reservedQuantity?: number
  revenueMinor?: number
  uniqueVisitorCount?: number
  viewCount?: number
}

function createToken() {
  return randomBytes(12).toString("base64url")
}

function createReference(prefix: string) {
  const timestamp = Date.now().toString(36).toUpperCase()
  const suffix = randomBytes(3).toString("hex").toUpperCase()

  return `${prefix}-${timestamp}-${suffix}`
}

function getTodayRange(now = new Date()) {
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)

  return {
    from,
    to: now,
  }
}

function getDefaultShareLinkAnalyticsRange(now = new Date()) {
  const from = new Date(now)
  from.setUTCDate(from.getUTCDate() - 29)
  from.setUTCHours(0, 0, 0, 0)

  return {
    from,
    to: now,
  }
}

function getUtcDay(happenedAt: Date) {
  const day = new Date(happenedAt)
  day.setUTCHours(0, 0, 0, 0)

  return day
}

function getAnalyticsRange(input: { from?: Date; to?: Date }) {
  const fallback = getDefaultShareLinkAnalyticsRange()

  return {
    from: input.from ?? fallback.from,
    to: input.to ?? fallback.to,
  }
}

function getRange(input: { from?: Date; to?: Date }) {
  const fallback = getTodayRange()

  return {
    from: input.from ?? fallback.from,
    to: input.to ?? fallback.to,
  }
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return value as JsonRecord
}

function getStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function getErrorCode(error: unknown) {
  return getStringField(asRecord(error).code)
}

function isDurableShareLinkTableUnavailable(error: unknown) {
  const code = getErrorCode(error)

  return code === "P2021" || code === "P2022"
}

function isMissingDurableShareLinkRecord(error: unknown) {
  return getErrorCode(error) === "P2025"
}

function isUniqueConstraintError(error: unknown) {
  return getErrorCode(error) === "P2002"
}

function getNumberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizeExternalId(externalId: string | undefined) {
  const trimmed = externalId?.trim()

  return trimmed || undefined
}

function getSharedLinkReservationStatus(value: unknown) {
  if (value === "consumed" || value === "released" || value === "reserved") {
    return value
  }

  return null
}

function getSharedLinkReservationMetadata(
  value: unknown,
): SharedLinkReservationMetadata {
  const reservation = asRecord(value)

  return {
    consumedAt: getStringField(reservation.consumedAt),
    consumedByUserId: getStringField(reservation.consumedByUserId),
    inventoryItemId: getStringField(reservation.inventoryItemId),
    productVariantId: getStringField(reservation.productVariantId),
    quantity: getNumberField(reservation.quantity),
    releasedAt: getStringField(reservation.releasedAt),
    releasedByUserId: getStringField(reservation.releasedByUserId),
    reservedAt: getStringField(reservation.reservedAt),
    status: getSharedLinkReservationStatus(reservation.status),
  }
}

function getSharedLinkOrderMetadata(metadata: unknown) {
  const retailOps = asRecord(asRecord(metadata).retailOps)

  return {
    paymentState: getStringField(retailOps.paymentState),
    shareLinkCreatorUserId: getStringField(retailOps.shareLinkCreatorUserId),
    shareLinkId: getStringField(retailOps.shareLinkId),
    shareToken: getStringField(retailOps.shareToken),
    source: getStringField(retailOps.source),
    stockReservation: getSharedLinkReservationMetadata(
      retailOps.stockReservation,
    ),
  }
}

function getSharedLinkFulfillmentMetadata(
  metadata: unknown,
): RetailOpsSharedLinkOrderRequest["fulfillment"] {
  const retailOps = asRecord(asRecord(metadata).retailOps)
  const fulfillment = asRecord(retailOps.fulfillment)

  return {
    fulfilledAt: getStringField(fulfillment.fulfilledAt),
    fulfilledByUserId: getStringField(fulfillment.fulfilledByUserId),
    method: getStringField(fulfillment.method),
    note: getStringField(fulfillment.note),
    status: getStringField(fulfillment.status),
  }
}

function hasSharedLinkFulfillmentInput(
  input: UpdateRetailOpsSharedLinkOrderRequestStatusInput,
) {
  return Boolean(
    input.fulfilledAt ||
      input.fulfillmentMethod ||
      input.fulfillmentNote?.trim() ||
      input.fulfillmentStatus,
  )
}

function getSharedLinkFulfillmentPatch(
  input: UpdateRetailOpsSharedLinkOrderRequestStatusInput,
  happenedAt: Date,
): JsonRecord | undefined {
  if (input.status === "cancelled") {
    return {
      fulfilledAt: null,
      fulfilledByUserId: input.actorUserId,
      method: null,
      note: input.fulfillmentNote?.trim() || null,
      status: "cancelled",
    }
  }

  if (!hasSharedLinkFulfillmentInput(input)) return undefined

  const status = input.fulfillmentStatus ?? "pending"
  const shouldStampFulfilledAt =
    status === "delivered" || status === "picked_up"

  return {
    fulfilledAt: (
      input.fulfilledAt ?? (shouldStampFulfilledAt ? happenedAt : null)
    )?.toISOString(),
    fulfilledByUserId: input.actorUserId,
    method: input.fulfillmentMethod ?? null,
    note: input.fulfillmentNote?.trim() || null,
    status,
  }
}

function getRetailOpsLineUnitName(metadata: unknown) {
  const retailOps = asRecord(asRecord(metadata).retailOps)

  return getStringField(retailOps.unitName)
}

function getSharedLinkNotificationDispatchMetadata(metadata: unknown) {
  const retailOps = asRecord(asRecord(metadata).retailOps)

  return asRecord(retailOps.sharedLinkNotification)
}

function getShareLinks(metadata: unknown): ProductShareLinkMetadata[] {
  const retailOps = asRecord(asRecord(metadata).retailOps)
  const shareLinks = retailOps.shareLinks

  if (!Array.isArray(shareLinks)) return []

  return shareLinks.filter((shareLink): shareLink is ProductShareLinkMetadata =>
    Boolean(
      shareLink &&
        typeof shareLink === "object" &&
        !Array.isArray(shareLink) &&
        typeof (shareLink as ProductShareLinkMetadata).id === "string" &&
        typeof (shareLink as ProductShareLinkMetadata).token === "string" &&
        typeof (shareLink as ProductShareLinkMetadata).url === "string",
    ),
  )
}

function findShareLinkByToken(metadata: unknown, token: string) {
  return getShareLinks(metadata).find((shareLink) => shareLink.token === token)
}

function findShareLinkByExternalId(metadata: unknown, externalId: string) {
  return getShareLinks(metadata).find(
    (shareLink) => shareLink.externalId === externalId,
  )
}

function findShareLinkByIdOrToken(
  metadata: unknown,
  input: {
    id: string | null
    token: string | null
  },
) {
  return getShareLinks(metadata).find(
    (shareLink) =>
      (input.id && shareLink.id === input.id) ||
      (input.token && shareLink.token === input.token),
  )
}

function mapSharedLinkOrderStatus(
  status: RetailOpsSharedLinkOrderRequestStatusFilter,
): OrderStatus | null {
  if (status === "cancelled") return "CANCELLED"
  if (status === "completed") return "COMPLETED"
  if (status === "pending") return "PENDING"

  return null
}

function mapDurableSharedLinkOrderRequestStatus(
  status: RetailOpsSharedLinkOrderRequestStatusFilter,
) {
  if (status === "cancelled") return "CANCELLED" as const
  if (status === "completed") return "COMPLETED" as const
  if (status === "pending") return "PENDING" as const

  return null
}

function mapSharedLinkOrderUpdateStatus(
  status: UpdateRetailOpsSharedLinkOrderRequestStatusInput["status"],
): OrderStatus {
  return status === "completed" ? "COMPLETED" : "CANCELLED"
}

function getSharedLinkPaymentMethodLabel(
  paymentMethod: RetailOpsSharedLinkPaymentMethod,
) {
  if (paymentMethod === "card") return "card"
  if (paymentMethod === "transfer") return "bank_transfer"

  return "cash"
}

function withShareLinks(
  metadata: unknown,
  shareLinks: ProductShareLinkMetadata[],
): Prisma.InputJsonValue {
  const existingMetadata = asRecord(metadata)
  const retailOps = asRecord(existingMetadata.retailOps)

  return {
    ...existingMetadata,
    retailOps: {
      ...retailOps,
      shareLinks,
    },
  } as Prisma.InputJsonValue
}

function withSharedLinkOrderRetailOpsMetadata(
  metadata: unknown,
  retailOpsPatch: JsonRecord,
): Prisma.InputJsonValue {
  const existingMetadata = asRecord(metadata)
  const retailOps = asRecord(existingMetadata.retailOps)

  return {
    ...existingMetadata,
    retailOps: {
      ...retailOps,
      ...retailOpsPatch,
    },
  } as Prisma.InputJsonValue
}

function replaceShareLink(
  metadata: unknown,
  nextShareLink: ProductShareLinkMetadata,
) {
  return getShareLinks(metadata).map((shareLink) =>
    shareLink.id === nextShareLink.id ? nextShareLink : shareLink,
  )
}

type StorefrontHostnameOption = {
  hostname: string
  isCustom: boolean
  isPrimary: boolean
  verifiedAt: Date | null
}

function getProtocolFromBaseUrl(publicBaseUrl: string) {
  try {
    return new URL(publicBaseUrl).protocol || "https:"
  } catch {
    return "https:"
  }
}

function isLocalOrIpHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost") ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
    hostname.includes(":")
  )
}

function getTenantSubdomainBaseUrl(input: {
  publicBaseUrl: string
  tenantSlug: string
}) {
  const tenantSlug = input.tenantSlug.trim().toLowerCase()

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tenantSlug)) {
    return null
  }

  try {
    const url = new URL(input.publicBaseUrl)
    const hostname = url.hostname.toLowerCase()

    if (!hostname || isLocalOrIpHostname(hostname)) return null

    const rootHostname = hostname.replace(/^(storefront|www)\./, "")
    url.hostname = hostname.startsWith(`${tenantSlug}.`)
      ? hostname
      : `${tenantSlug}.${rootHostname}`
    url.hash = ""
    url.pathname = ""
    url.search = ""

    return url.toString().replace(/\/+$/, "")
  } catch {
    return null
  }
}

function toHostnameBaseUrl(input: {
  hostname: string
  publicBaseUrl: string
}) {
  const hostname = input.hostname.trim().replace(/\/+$/, "")

  if (!hostname) return null

  const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(hostname)
  const urlValue = hasProtocol
    ? hostname
    : `${getProtocolFromBaseUrl(input.publicBaseUrl)}//${hostname}`

  try {
    const url = new URL(urlValue)
    const hostname = url.hostname.toLowerCase()

    if (!["http:", "https:"].includes(url.protocol)) return null
    if (!hostname || isLocalOrIpHostname(hostname)) return null

    url.hash = ""
    url.pathname = ""
    url.search = ""

    return url.toString().replace(/\/+$/, "")
  } catch {
    return null
  }
}

function getPreferredStorefrontBaseUrl(input: {
  hostnames?: StorefrontHostnameOption[]
  publicBaseUrl: string
  tenantSlug: string
}) {
  const fallbackBaseUrl = input.publicBaseUrl.replace(/\/+$/, "")
  const hostnames = input.hostnames ?? []
  const preferredHostnames = [
    ...hostnames.filter(
      (hostname) =>
        hostname.isCustom && hostname.isPrimary && hostname.verifiedAt,
    ),
    ...hostnames.filter(
      (hostname) =>
        hostname.isCustom && !hostname.isPrimary && hostname.verifiedAt,
    ),
    ...hostnames.filter((hostname) => !hostname.isCustom && hostname.isPrimary),
    ...hostnames.filter(
      (hostname) => !hostname.isCustom && !hostname.isPrimary,
    ),
  ]

  for (const preferredHostname of preferredHostnames) {
    const baseUrl = toHostnameBaseUrl({
      hostname: preferredHostname.hostname,
      publicBaseUrl: input.publicBaseUrl,
    })

    if (baseUrl) return baseUrl
  }

  return (
    getTenantSubdomainBaseUrl({
      publicBaseUrl: input.publicBaseUrl,
      tenantSlug: input.tenantSlug,
    }) ?? fallbackBaseUrl
  )
}

function buildShareUrl(input: {
  hostnames?: StorefrontHostnameOption[]
  productSlug: string
  publicBaseUrl: string
  storeSlug: string
  tenantSlug: string
  token: string
}) {
  const baseUrl = getPreferredStorefrontBaseUrl({
    hostnames: input.hostnames,
    publicBaseUrl: input.publicBaseUrl,
    tenantSlug: input.tenantSlug,
  })
  const path = [
    "p",
    encodeURIComponent(input.tenantSlug),
    encodeURIComponent(input.storeSlug),
    encodeURIComponent(input.productSlug),
  ].join("/")

  return `${baseUrl}/${path}?share=${encodeURIComponent(input.token)}`
}

function toShareLink(input: {
  metadata: ProductShareLinkMetadata
  product: {
    id: string
    name: string
    slug: string
  }
}): RetailOpsProductShareLink {
  return {
    active: input.metadata.active,
    createdAt: input.metadata.createdAt,
    createdByUserId: input.metadata.createdByUserId,
    deactivatedAt: input.metadata.deactivatedAt ?? null,
    id: input.metadata.id,
    label: input.metadata.label ?? null,
    lastActivityAt: input.metadata.lastActivityAt ?? null,
    orderCount: input.metadata.orderCount ?? 0,
    product: input.product,
    token: input.metadata.token,
    url: input.metadata.url,
    viewCount: input.metadata.viewCount ?? 0,
  }
}

function toDurableShareLinkMetadata(
  shareLink: DurableProductShareLinkRow,
): ProductShareLinkMetadata {
  return {
    active: shareLink.status === "ACTIVE",
    createdAt: shareLink.createdAt.toISOString(),
    createdByUserId: shareLink.createdByUserId,
    deactivatedAt: shareLink.deactivatedAt?.toISOString() ?? null,
    deactivationExternalId: shareLink.deactivateExternalId,
    deactivatedByUserId: shareLink.deactivatedByUserId,
    externalId: shareLink.createExternalId,
    id: shareLink.id,
    label: shareLink.label,
    lastActivityAt: shareLink.lastActivityAt?.toISOString() ?? null,
    orderCount: shareLink.orderCount,
    token: shareLink.token,
    url: shareLink.url,
    viewCount: shareLink.viewCount,
  }
}

function toDurableShareLink(
  shareLink: DurableProductShareLinkWithProduct,
): RetailOpsProductShareLink {
  return toShareLink({
    metadata: toDurableShareLinkMetadata(shareLink),
    product: shareLink.product,
  })
}

function toSharedProductFromDurableShareLink(
  shareLink: DurableProductShareLinkWithSharedProduct,
): RetailOpsSharedProduct {
  return {
    product: {
      currencyCode: shareLink.product.currencyCode,
      description: shareLink.product.description,
      id: shareLink.product.id,
      imageUrl: getProductImageUrl(shareLink.product.metadata),
      name: shareLink.product.name,
      slug: shareLink.product.slug,
      variants: shareLink.product.variants.map((variant) => ({
        availableQuantity: Math.max(
          0,
          (variant.inventoryItem?.onHandQuantity ?? 0) -
            (variant.inventoryItem?.reservedQuantity ?? 0),
        ),
        id: variant.id,
        isDefault: variant.isDefault,
        name: variant.name,
        priceMinor: variant.priceMinor,
        sku: variant.sku,
      })),
    },
    shareLink: toShareLink({
      metadata: toDurableShareLinkMetadata(shareLink),
      product: shareLink.product,
    }),
    store: {
      currencyCode: shareLink.product.store.currencyCode,
      id: shareLink.product.store.id,
      name: shareLink.product.store.name,
      slug: shareLink.product.store.slug,
    },
    tenant: shareLink.product.store.tenant,
  }
}

function getProductImageUrl(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null
  }

  const record = metadata as Record<string, unknown>
  const retailOps =
    record.retailOps && typeof record.retailOps === "object"
      ? (record.retailOps as Record<string, unknown>)
      : {}
  const candidates = [
    record.imageUrl,
    record.thumbnailUrl,
    record.previewImageUrl,
    retailOps.imageUrl,
    retailOps.thumbnailUrl,
    retailOps.previewImageUrl,
    getFirstImageFromCollection(record.images),
    getFirstImageFromCollection(record.imagesUrl),
    getFirstImageFromCollection(record.media),
    getFirstImageFromCollection(retailOps.images),
    getFirstImageFromCollection(retailOps.imagesUrl),
    getFirstImageFromCollection(retailOps.media),
  ]

  return candidates.find((candidate) => typeof candidate === "string") ?? null
}

function getFirstImageFromCollection(value: unknown) {
  if (!Array.isArray(value)) return null

  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      return item.trim()
    }

    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>
      const candidate =
        record.url ?? record.imageUrl ?? record.src ?? record.previewImageUrl

      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim()
      }
    }
  }

  return null
}

function mergeShareLinks(input: {
  durableShareLinks: RetailOpsProductShareLink[]
  fallbackShareLinks: RetailOpsProductShareLink[]
}) {
  const shareLinks: RetailOpsProductShareLink[] = []
  const seen = new Set<string>()

  for (const shareLink of [
    ...input.durableShareLinks,
    ...input.fallbackShareLinks,
  ]) {
    const keys = [`id:${shareLink.id}`, `token:${shareLink.token}`]

    if (keys.some((key) => seen.has(key))) continue

    shareLinks.push(shareLink)
    for (const key of keys) {
      seen.add(key)
    }
  }

  return shareLinks
}

function createEmptyShareLinkAnalyticsMetrics(): RetailOpsProductShareLinkAnalyticsMetrics {
  return {
    cancelledOrderCount: 0,
    completedOrderCount: 0,
    consumedQuantity: 0,
    orderRequestCount: 0,
    releasedQuantity: 0,
    reservedQuantity: 0,
    revenueMinor: 0,
    uniqueVisitorCount: 0,
    viewCount: 0,
  }
}

function addShareLinkAnalyticsMetrics(
  current: RetailOpsProductShareLinkAnalyticsMetrics,
  next: RetailOpsProductShareLinkAnalyticsMetrics,
): RetailOpsProductShareLinkAnalyticsMetrics {
  return {
    cancelledOrderCount: current.cancelledOrderCount + next.cancelledOrderCount,
    completedOrderCount: current.completedOrderCount + next.completedOrderCount,
    consumedQuantity: current.consumedQuantity + next.consumedQuantity,
    orderRequestCount: current.orderRequestCount + next.orderRequestCount,
    releasedQuantity: current.releasedQuantity + next.releasedQuantity,
    reservedQuantity: current.reservedQuantity + next.reservedQuantity,
    revenueMinor: current.revenueMinor + next.revenueMinor,
    uniqueVisitorCount: current.uniqueVisitorCount + next.uniqueVisitorCount,
    viewCount: current.viewCount + next.viewCount,
  }
}

function getShareLinkAnalyticsFallback(input: {
  range: {
    from: Date
    to: Date
  }
  shareLinks: RetailOpsProductShareLink[]
}): RetailOpsProductShareLinkAnalytics {
  const linkSummaries = input.shareLinks.map((shareLink) => ({
    ...createEmptyShareLinkAnalyticsMetrics(),
    orderRequestCount: shareLink.orderCount,
    shareLink,
    viewCount: shareLink.viewCount,
  }))
  const summaryMetrics = linkSummaries.reduce(
    (summary, linkSummary) =>
      addShareLinkAnalyticsMetrics(summary, linkSummary),
    createEmptyShareLinkAnalyticsMetrics(),
  )

  return {
    daily: [],
    linkSummaries,
    range: {
      from: input.range.from.toISOString(),
      to: input.range.to.toISOString(),
    },
    source: "link_counters",
    summary: {
      ...summaryMetrics,
      activeLinkCount: input.shareLinks.filter((shareLink) => shareLink.active)
        .length,
      linkCount: input.shareLinks.length,
    },
  }
}

function filterShareLinksForAnalytics(
  shareLinks: RetailOpsProductShareLink[],
  input: Pick<
    GetRetailOpsProductShareLinkAnalyticsInput,
    "actorUserId" | "canManageAllLinks" | "productId" | "shareLinkId"
  >,
) {
  return shareLinks.filter((shareLink) => {
    if (
      !input.canManageAllLinks &&
      shareLink.createdByUserId !== input.actorUserId
    ) {
      return false
    }

    if (input.productId && shareLink.product.id !== input.productId) {
      return false
    }

    if (input.shareLinkId && shareLink.id !== input.shareLinkId) {
      return false
    }

    return true
  })
}

async function applyDurableShareLinkAnalytics(
  db: PrismaClient,
  input: {
    shareLinks: RetailOpsProductShareLink[]
    storeId: string
    tenantId: string
  },
) {
  if (input.shareLinks.length === 0) return input.shareLinks

  try {
    const analyticsRows = await db.productShareLinkAnalyticsDaily.findMany({
      where: {
        shareLinkId: {
          in: input.shareLinks.map((shareLink) => shareLink.id),
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        orderRequestCount: true,
        shareLinkId: true,
        viewCount: true,
      },
    })
    const analyticsByShareLinkId = new Map<
      string,
      {
        orderCount: number
        viewCount: number
      }
    >()

    for (const analyticsRow of analyticsRows) {
      const current = analyticsByShareLinkId.get(analyticsRow.shareLinkId) ?? {
        orderCount: 0,
        viewCount: 0,
      }

      analyticsByShareLinkId.set(analyticsRow.shareLinkId, {
        orderCount: current.orderCount + analyticsRow.orderRequestCount,
        viewCount: current.viewCount + analyticsRow.viewCount,
      })
    }

    return input.shareLinks.map((shareLink) => {
      const analytics = analyticsByShareLinkId.get(shareLink.id)

      if (!analytics) return shareLink

      return {
        ...shareLink,
        orderCount: analytics.orderCount,
        viewCount: analytics.viewCount,
      }
    })
  } catch (error) {
    if (isDurableShareLinkTableUnavailable(error)) return input.shareLinks

    throw error
  }
}

function formatMinorMoney(valueMinor: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    currency: currencyCode,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(valueMinor / 100)
}

function toReservationResponse(
  reservation: SharedLinkReservationMetadata,
): RetailOpsSharedLinkOrderRequest["reservation"] {
  if (!reservation.status) return null

  return {
    inventoryItemId: reservation.inventoryItemId,
    productVariantId: reservation.productVariantId,
    quantity: reservation.quantity,
    status: reservation.status,
  }
}

function toNotificationDispatchResponse(
  notification: JsonRecord,
): RetailOpsSharedLinkOrderRequest["notification"] {
  return {
    attemptCount: getNumberField(notification.attemptCount) ?? 0,
    failedAt: getStringField(notification.failedAt),
    failureReason: getStringField(notification.failureReason),
    lastAttemptAt: getStringField(notification.lastAttemptAt),
    sentAt: getStringField(notification.sentAt),
    status: getStringField(notification.status),
  }
}

function toDurableReservationResponse(
  reservation: DurableSharedLinkReservationRow | null,
): RetailOpsSharedLinkOrderRequest["reservation"] {
  if (!reservation) return null

  const metadata = asRecord(asRecord(reservation.metadata).retailOps)

  return {
    inventoryItemId: getStringField(metadata.inventoryItemId),
    productVariantId: reservation.productVariantId,
    quantity: reservation.quantity,
    status: reservation.status.toLowerCase(),
  }
}

function toDurableNotificationDispatchResponse(
  notifications: DurableSharedLinkNotificationRow[],
): RetailOpsSharedLinkOrderRequest["notification"] | null {
  if (notifications.length === 0) return null

  const latestNotification = notifications[0]

  if (!latestNotification) return null

  return {
    attemptCount: 1,
    failedAt: latestNotification.failedAt?.toISOString() ?? null,
    failureReason: latestNotification.failureReason,
    lastAttemptAt: latestNotification.updatedAt.toISOString(),
    sentAt: latestNotification.sentAt?.toISOString() ?? null,
    status: latestNotification.status.toLowerCase(),
  }
}

function toSharedLinkOrderRequestFromOrder(input: {
  notification?: RetailOpsSharedLinkOrderRequest["notification"] | null
  order: SharedLinkOrderRequestOrderRow
  reservation?: RetailOpsSharedLinkOrderRequest["reservation"] | null
  shareLink: SharedLinkOrderRequestShareLinkSummary
}): RetailOpsSharedLinkOrderRequest {
  const metadata = getSharedLinkOrderMetadata(input.order.metadata)
  const line = input.order.items[0] ?? null
  const receipt = input.order.receipts[0] ?? null

  return {
    createdAt: input.order.createdAt,
    currencyCode: input.order.currencyCode,
    customer: {
      email: input.order.customerEmail,
      name: input.order.customerName,
      phone: input.order.customerPhone,
    },
    fulfillment: getSharedLinkFulfillmentMetadata(input.order.metadata),
    id: input.order.id,
    line: line
      ? {
          id: line.id,
          productId: line.productId,
          productName: line.nameSnapshot,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          sku: line.skuSnapshot,
          totalMinor: line.totalPriceMinor,
          unitName: getRetailOpsLineUnitName(line.metadata),
          unitPriceMinor: line.unitPriceMinor,
        }
      : null,
    notes: input.order.notes,
    notification:
      input.notification ??
      toNotificationDispatchResponse(
        getSharedLinkNotificationDispatchMetadata(input.order.metadata),
      ),
    orderNumber: input.order.orderNumber,
    paymentState: metadata.paymentState,
    paymentStatus: input.order.paymentStatus,
    receipt: receipt
      ? {
          id: receipt.id,
          issuedAt: receipt.issuedAt,
          paymentMethod: receipt.paymentMethod,
          receiptNumber: receipt.receiptNumber,
          totalMinor: receipt.totalMinor,
        }
      : null,
    reservation:
      input.reservation ?? toReservationResponse(metadata.stockReservation),
    shareLink: input.shareLink,
    status: input.order.status,
    totalMinor: input.order.totalMinor,
    updatedAt: input.order.updatedAt,
  }
}

function mergeSharedLinkOrderRequests(input: {
  durableRequests: RetailOpsSharedLinkOrderRequest[]
  fallbackRequests: RetailOpsSharedLinkOrderRequest[]
  limit: number
}) {
  const seen = new Set<string>()

  return [...input.durableRequests, ...input.fallbackRequests]
    .filter((orderRequest) => {
      if (seen.has(orderRequest.id)) return false

      seen.add(orderRequest.id)

      return true
    })
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, input.limit)
}

function normalizeFailureReason(failureReason: string | undefined) {
  const trimmed = failureReason?.trim()

  return trimmed ? trimmed.slice(0, 500) : null
}

function normalizeNullableFailureReason(
  failureReason: string | null | undefined,
) {
  const trimmed = failureReason?.trim()

  return trimmed ? trimmed.slice(0, 500) : null
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null

  return value instanceof Date ? value.toISOString() : value
}

function mapNotificationDispatchStatus(
  status: RetailOpsSharedLinkNotificationDispatchStatus,
) {
  if (status === "sent") return "SENT" as const
  if (status === "failed") return "FAILED" as const
  if (status === "skipped") return "SKIPPED" as const

  return "PENDING" as const
}

function getNotificationDeliveryStatus(
  delivery: RetailOpsSharedLinkNotificationDeliveryReceipt | undefined,
  fallback: RetailOpsSharedLinkNotificationDispatchStatus,
): RetailOpsSharedLinkNotificationDispatchStatus {
  return delivery?.status ?? fallback
}

function getNotificationDeliveryReceipt(
  deliveries: RetailOpsSharedLinkNotificationDeliveryReceipt[] | undefined,
  input: {
    email: string | null
    type: "ADMIN" | "CUSTOMER"
  },
) {
  if (!deliveries?.length || !input.email) return undefined

  const role = input.type === "CUSTOMER" ? "customer" : "admin"
  const email = input.email.trim().toLowerCase()

  return deliveries.find(
    (delivery) =>
      delivery.deliveryRole === role &&
      delivery.recipientEmail.trim().toLowerCase() === email,
  )
}

async function applySharedLinkOrderReservationStatus(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string
    metadata: ReturnType<typeof getSharedLinkOrderMetadata>
    now: string
    status: UpdateRetailOpsSharedLinkOrderRequestStatusInput["status"]
  },
) {
  const reservation = input.metadata.stockReservation

  if (reservation.status !== "reserved") {
    return reservation.status ? reservation : null
  }

  if (!reservation.inventoryItemId || !reservation.quantity) {
    return reservation
  }

  if (input.status === "cancelled") {
    const release = await tx.inventoryItem.updateMany({
      where: {
        id: reservation.inventoryItemId,
        reservedQuantity: { gte: reservation.quantity },
      },
      data: {
        reservedQuantity: { decrement: reservation.quantity },
        updatedByUserId: input.actorUserId,
      },
    })

    if (release.count !== 1) {
      throw new RetailOpsShareLinkError(
        "INSUFFICIENT_STOCK",
        "The reserved stock for this order request is no longer available.",
      )
    }

    return {
      ...reservation,
      releasedAt: input.now,
      releasedByUserId: input.actorUserId,
      status: "released" as const,
    }
  }

  const consume = await tx.inventoryItem.updateMany({
    where: {
      id: reservation.inventoryItemId,
      onHandQuantity: { gte: reservation.quantity },
      reservedQuantity: { gte: reservation.quantity },
    },
    data: {
      onHandQuantity: { decrement: reservation.quantity },
      reservedQuantity: { decrement: reservation.quantity },
      updatedByUserId: input.actorUserId,
    },
  })

  if (consume.count !== 1) {
    throw new RetailOpsShareLinkError(
      "INSUFFICIENT_STOCK",
      "The reserved stock for this order request is no longer available.",
    )
  }

  return {
    ...reservation,
    consumedAt: input.now,
    consumedByUserId: input.actorUserId,
    status: "consumed" as const,
  }
}

async function getSharedLinkOrderMerchantRecipients(
  db: PrismaClient,
  input: {
    shareLinkCreatorUserId: string
    tenantId: string
  },
) {
  const memberships = await db.membership.findMany({
    where: {
      OR: [
        {
          role: {
            in: ["OWNER", "ADMIN", "MANAGER"],
          },
        },
        {
          userId: input.shareLinkCreatorUserId,
        },
      ],
      status: "ACTIVE",
      tenantId: input.tenantId,
    },
    select: {
      user: {
        select: {
          displayName: true,
          email: true,
          name: true,
        },
      },
    },
  })
  const seen = new Set<string>()

  return memberships.flatMap((membership) => {
    const email = membership.user.email.trim().toLowerCase()

    if (!email || seen.has(email)) return []

    seen.add(email)

    return [
      {
        displayName:
          membership.user.displayName || membership.user.name || null,
        email,
      },
    ]
  })
}

async function getShareableProduct(
  db: PrismaClient,
  input: {
    productId: string
    storeId: string
    tenantId: string
  },
) {
  const product = await db.product.findFirst({
    where: {
      id: input.productId,
      kind: "PRODUCT",
      status: { not: "ARCHIVED" },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      metadata: true,
      name: true,
      slug: true,
      store: {
        select: {
          slug: true,
          tenant: {
            select: {
              hostnames: {
                where: {
                  surface: "STOREFRONT",
                },
                orderBy: [
                  {
                    isPrimary: "desc",
                  },
                  {
                    isCustom: "desc",
                  },
                  {
                    createdAt: "asc",
                  },
                ],
                select: {
                  hostname: true,
                  isCustom: true,
                  isPrimary: true,
                  verifiedAt: true,
                },
              },
              slug: true,
            },
          },
        },
      },
    },
  })

  if (!product) {
    throw new RetailOpsShareLinkError(
      "PRODUCT_NOT_FOUND",
      "Product not found for this store.",
    )
  }

  return product
}

async function findDurableShareLinkByExternalId(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    externalId: string | undefined
    productId: string
    storeId: string
    tenantId: string
  },
) {
  if (!input.externalId) return null

  try {
    return await db.productShareLink.findFirst({
      where: {
        createExternalId: input.externalId,
        productId: input.productId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        createExternalId: true,
        createdAt: true,
        createdByUserId: true,
        deactivateExternalId: true,
        deactivatedAt: true,
        deactivatedByUserId: true,
        id: true,
        label: true,
        lastActivityAt: true,
        orderCount: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        status: true,
        token: true,
        url: true,
        viewCount: true,
      },
    })
  } catch (error) {
    if (isDurableShareLinkTableUnavailable(error)) return null

    throw error
  }
}

async function findDurableShareLinkById(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    productId: string
    shareLinkId: string
    storeId: string
    tenantId: string
  },
) {
  try {
    return await db.productShareLink.findFirst({
      where: {
        id: input.shareLinkId,
        productId: input.productId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        createExternalId: true,
        createdAt: true,
        createdByUserId: true,
        deactivateExternalId: true,
        deactivatedAt: true,
        deactivatedByUserId: true,
        id: true,
        label: true,
        lastActivityAt: true,
        orderCount: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        status: true,
        token: true,
        url: true,
        viewCount: true,
      },
    })
  } catch (error) {
    if (isDurableShareLinkTableUnavailable(error)) return null

    throw error
  }
}

async function createDurableShareLinkEvent(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId?: string | null
    eventExternalId?: string | null
    happenedAt: Date
    metadata?: Prisma.InputJsonValue
    shareLinkId: string
    storeId: string
    tenantId: string
    type: "CREATED" | "DEACTIVATED" | "ORDER_REQUESTED" | "VIEWED"
  },
) {
  await db.productShareLinkEvent.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      eventExternalId: input.eventExternalId ?? null,
      happenedAt: input.happenedAt,
      metadata: input.metadata ?? undefined,
      shareLinkId: input.shareLinkId,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: input.type,
    },
    select: {
      id: true,
    },
  })
}

function getIncrementData(delta: DurableShareLinkAnalyticsDelta) {
  const entries = Object.entries(delta).filter(
    (entry): entry is [keyof DurableShareLinkAnalyticsDelta, number] =>
      typeof entry[1] === "number" && entry[1] !== 0,
  )

  return Object.fromEntries(
    entries.map(([key, value]) => [key, { increment: value }]),
  ) as Prisma.ProductShareLinkAnalyticsDailyUpdateManyMutationInput
}

async function recordDurableShareLinkAnalyticsDaily(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    delta: DurableShareLinkAnalyticsDelta
    happenedAt: Date
    productId: string
    shareLinkId: string
    source: string
    storeId: string
    tenantId: string
  },
) {
  const day = getUtcDay(input.happenedAt)
  const incrementData = getIncrementData(input.delta)

  if (Object.keys(incrementData).length === 0) return

  try {
    const updated = await db.productShareLinkAnalyticsDaily.updateMany({
      where: {
        day,
        shareLinkId: input.shareLinkId,
      },
      data: {
        ...incrementData,
        lastRolledUpAt: input.happenedAt,
      },
    })

    if (updated.count > 0) return

    await db.productShareLinkAnalyticsDaily.create({
      data: {
        cancelledOrderCount: input.delta.cancelledOrderCount ?? 0,
        completedOrderCount: input.delta.completedOrderCount ?? 0,
        consumedQuantity: input.delta.consumedQuantity ?? 0,
        day,
        lastRolledUpAt: input.happenedAt,
        metadata: {
          retailOps: {
            source: input.source,
          },
        } as Prisma.InputJsonValue,
        orderRequestCount: input.delta.orderRequestCount ?? 0,
        productId: input.productId,
        releasedQuantity: input.delta.releasedQuantity ?? 0,
        reservedQuantity: input.delta.reservedQuantity ?? 0,
        revenueMinor: input.delta.revenueMinor ?? 0,
        shareLinkId: input.shareLinkId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        uniqueVisitorCount: input.delta.uniqueVisitorCount ?? 0,
        viewCount: input.delta.viewCount ?? 0,
      },
      select: {
        id: true,
      },
    })
  } catch (error) {
    if (
      isDurableShareLinkTableUnavailable(error) ||
      isMissingDurableShareLinkRecord(error) ||
      isUniqueConstraintError(error)
    ) {
      return
    }

    throw error
  }
}

async function createDurableProductShareLink(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    createdAt: Date
    createdByUserId: string
    externalId?: string
    label?: string
    product: {
      id: string
      name: string
      slug: string
    }
    storeId: string
    tenantId: string
    token: string
    url: string
  },
) {
  try {
    const shareLink = await db.productShareLink.create({
      data: {
        createExternalId: input.externalId ?? null,
        createdAt: input.createdAt,
        createdByUserId: input.createdByUserId,
        label: input.label ?? null,
        lastActivityAt: input.createdAt,
        metadata: {
          retailOps: {
            source: "retail_ops_share_link",
          },
        } as Prisma.InputJsonValue,
        productId: input.product.id,
        status: "ACTIVE",
        storeId: input.storeId,
        tenantId: input.tenantId,
        token: input.token,
        url: input.url,
      },
      select: {
        createExternalId: true,
        createdAt: true,
        createdByUserId: true,
        deactivateExternalId: true,
        deactivatedAt: true,
        deactivatedByUserId: true,
        id: true,
        label: true,
        lastActivityAt: true,
        orderCount: true,
        status: true,
        token: true,
        url: true,
        viewCount: true,
      },
    })

    await createDurableShareLinkEvent(db, {
      actorUserId: input.createdByUserId,
      eventExternalId: input.externalId,
      happenedAt: input.createdAt,
      metadata: {
        retailOps: {
          source: "retail_ops_share_link",
        },
      } as Prisma.InputJsonValue,
      shareLinkId: shareLink.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: "CREATED",
    })

    return {
      ...shareLink,
      product: input.product,
    }
  } catch (error) {
    if (isDurableShareLinkTableUnavailable(error)) return null

    throw error
  }
}

async function deactivateDurableProductShareLink(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId: string
    deactivatedAt: Date
    externalId?: string
    product: {
      id: string
      name: string
      slug: string
    }
    shareLinkId: string
    storeId: string
    tenantId: string
  },
) {
  try {
    const shareLink = await db.productShareLink.update({
      where: {
        id: input.shareLinkId,
      },
      data: {
        deactivateExternalId: input.externalId ?? null,
        deactivatedAt: input.deactivatedAt,
        deactivatedByUserId: input.actorUserId,
        lastActivityAt: input.deactivatedAt,
        status: "INACTIVE",
      },
      select: {
        createExternalId: true,
        createdAt: true,
        createdByUserId: true,
        deactivateExternalId: true,
        deactivatedAt: true,
        deactivatedByUserId: true,
        id: true,
        label: true,
        lastActivityAt: true,
        orderCount: true,
        status: true,
        token: true,
        url: true,
        viewCount: true,
      },
    })

    await createDurableShareLinkEvent(db, {
      actorUserId: input.actorUserId,
      eventExternalId: input.externalId,
      happenedAt: input.deactivatedAt,
      metadata: {
        retailOps: {
          source: "retail_ops_share_link_deactivation",
        },
      } as Prisma.InputJsonValue,
      shareLinkId: shareLink.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: "DEACTIVATED",
    })

    return {
      ...shareLink,
      product: input.product,
    }
  } catch (error) {
    if (
      isDurableShareLinkTableUnavailable(error) ||
      isMissingDurableShareLinkRecord(error)
    ) {
      return null
    }

    throw error
  }
}

async function recordDurableShareLinkOrderRequest(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    customerAccountId: string | null
    customerAuthMode: string
    happenedAt: Date
    inventoryItemId: string
    orderId: string
    productId: string
    productVariantId: string
    quantity: number
    reservedByUserId: string
    shareLinkId: string
    storeId: string
    tenantId: string
    totalMinor: number
    unitName: string
  },
) {
  try {
    await db.productShareLink.update({
      where: {
        id: input.shareLinkId,
      },
      data: {
        lastActivityAt: input.happenedAt,
        orderCount: {
          increment: 1,
        },
      },
      select: {
        id: true,
      },
    })

    await createDurableShareLinkEvent(db, {
      eventExternalId: input.orderId,
      happenedAt: input.happenedAt,
      metadata: {
        retailOps: {
          orderId: input.orderId,
          source: "retail_ops_share_link_order_request",
        },
      } as Prisma.InputJsonValue,
      shareLinkId: input.shareLinkId,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: "ORDER_REQUESTED",
    })

    const orderRequest = await db.productShareLinkOrderRequest.upsert({
      where: {
        orderId: input.orderId,
      },
      create: {
        customerAccountId: input.customerAccountId,
        customerAuthMode: input.customerAuthMode,
        metadata: {
          retailOps: {
            customerIdentityScope: "platform",
            orderId: input.orderId,
            source: "retail_ops_share_link_order_request",
            unitName: input.unitName,
          },
        } as Prisma.InputJsonValue,
        orderId: input.orderId,
        productId: input.productId,
        quantity: input.quantity,
        requestedAt: input.happenedAt,
        shareLinkId: input.shareLinkId,
        status: "PENDING",
        storeId: input.storeId,
        tenantId: input.tenantId,
        totalMinor: input.totalMinor,
      },
      update: {
        customerAccountId: input.customerAccountId,
        customerAuthMode: input.customerAuthMode,
        productId: input.productId,
        quantity: input.quantity,
        requestedAt: input.happenedAt,
        status: "PENDING",
        totalMinor: input.totalMinor,
      },
      select: {
        id: true,
      },
    })

    const reservationUpdate = {
      orderId: input.orderId,
      orderRequestId: orderRequest.id,
      quantity: input.quantity,
      reservedAt: input.happenedAt,
      reservedByUserId: input.reservedByUserId,
      status: "RESERVED" as const,
    }
    const reservation = await db.productShareLinkReservation.updateMany({
      where: {
        externalId: input.orderId,
        shareLinkId: input.shareLinkId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      data: reservationUpdate,
    })

    if (reservation.count === 0) {
      await db.productShareLinkReservation.create({
        data: {
          ...reservationUpdate,
          externalId: input.orderId,
          metadata: {
            retailOps: {
              inventoryItemId: input.inventoryItemId,
              orderId: input.orderId,
              source: "retail_ops_share_link_order_request",
              unitName: input.unitName,
            },
          } as Prisma.InputJsonValue,
          productId: input.productId,
          productVariantId: input.productVariantId,
          shareLinkId: input.shareLinkId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        select: {
          id: true,
        },
      })
    }

    await recordDurableShareLinkAnalyticsDaily(db, {
      delta: {
        orderRequestCount: 1,
        reservedQuantity: input.quantity,
      },
      happenedAt: input.happenedAt,
      productId: input.productId,
      shareLinkId: input.shareLinkId,
      source: "retail_ops_share_link_order_request",
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
  } catch (error) {
    if (
      isDurableShareLinkTableUnavailable(error) ||
      isMissingDurableShareLinkRecord(error) ||
      isUniqueConstraintError(error)
    ) {
      return
    }

    throw error
  }
}

async function recordDurableShareLinkOrderRequestFollowUp(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId: string
    happenedAt: Date
    orderId: string
    status: UpdateRetailOpsSharedLinkOrderRequestStatusInput["status"]
    storeId: string
    tenantId: string
  },
) {
  try {
    const orderRequest = await db.productShareLinkOrderRequest.findFirst({
      where: {
        orderId: input.orderId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        productId: true,
        quantity: true,
        shareLinkId: true,
        totalMinor: true,
      },
    })

    await db.productShareLinkOrderRequest.updateMany({
      where: {
        orderId: input.orderId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      data: {
        cancelledAt: input.status === "cancelled" ? input.happenedAt : null,
        completedAt: input.status === "completed" ? input.happenedAt : null,
        followedUpByUserId: input.actorUserId,
        status: input.status === "completed" ? "COMPLETED" : "CANCELLED",
      },
    })

    await db.productShareLinkReservation.updateMany({
      where: {
        orderId: input.orderId,
        status: "RESERVED",
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      data: {
        consumedAt: input.status === "completed" ? input.happenedAt : null,
        releasedAt: input.status === "cancelled" ? input.happenedAt : null,
        status: input.status === "completed" ? "CONSUMED" : "RELEASED",
      },
    })

    if (!orderRequest) return

    await recordDurableShareLinkAnalyticsDaily(db, {
      delta:
        input.status === "completed"
          ? {
              completedOrderCount: 1,
              consumedQuantity: orderRequest.quantity,
              revenueMinor: orderRequest.totalMinor,
            }
          : {
              cancelledOrderCount: 1,
              releasedQuantity: orderRequest.quantity,
            },
      happenedAt: input.happenedAt,
      productId: orderRequest.productId,
      shareLinkId: orderRequest.shareLinkId,
      source: "retail_ops_share_link_order_follow_up",
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
  } catch (error) {
    if (
      isDurableShareLinkTableUnavailable(error) ||
      isMissingDurableShareLinkRecord(error)
    ) {
      return
    }

    throw error
  }
}

async function upsertDurableShareLinkNotification(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    attempt: number | null
    attemptedAt: Date
    externalId: string
    failureReason: string | null
    maxAttempts: number | null
    nextRetryAt: Date | null
    orderRequestId: string
    provider: string | null
    providerMessageId: string | null
    recipientEmail: string | null
    recipientType: "ADMIN" | "CUSTOMER"
    shareLinkId: string
    subject: string | null
    status: RetailOpsSharedLinkNotificationDispatchStatus
    storeId: string
    tenantId: string
  },
) {
  const status = mapNotificationDispatchStatus(input.status)
  const failedAt = input.status === "failed" ? input.attemptedAt : null
  const sentAt = input.status === "sent" ? input.attemptedAt : null
  const metadata = {
    retailOps: {
      attempt: input.attempt,
      maxAttempts: input.maxAttempts,
      nextRetryAt: input.nextRetryAt?.toISOString() ?? null,
      orderRequestId: input.orderRequestId,
      provider: input.provider,
      recipientScope:
        input.recipientType === "CUSTOMER" ? "customer" : "merchant",
      source: "retail_ops_share_link_notification_dispatch",
    },
  } as Prisma.InputJsonValue
  const data = {
    failedAt,
    failureReason: input.status === "failed" ? input.failureReason : null,
    orderRequestId: input.orderRequestId,
    providerMessageId: input.providerMessageId,
    recipientEmail: input.recipientEmail,
    sentAt,
    status,
    subject: input.subject ?? "Shared product order request",
  }
  const updated = await db.productShareLinkNotification.updateMany({
    where: {
      channel: "EMAIL",
      externalId: input.externalId,
      recipientType: input.recipientType,
      shareLinkId: input.shareLinkId,
      tenantId: input.tenantId,
    },
    data: {
      ...data,
      metadata,
    },
  })

  if (updated.count > 0) return

  await db.productShareLinkNotification.create({
    data: {
      ...data,
      channel: "EMAIL",
      externalId: input.externalId,
      metadata,
      recipientType: input.recipientType,
      shareLinkId: input.shareLinkId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
    },
  })
}

async function recordDurableShareLinkNotificationDispatch(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    attempt?: number
    attemptedAt: Date
    customerEmail: string | null
    deliveries?: RetailOpsSharedLinkNotificationDeliveryReceipt[]
    failureReason: string | null
    maxAttempts?: number
    nextRetryAt?: Date | null
    notification?: RetailOpsSharedLinkOrderNotificationPayload
    orderId: string
    status: RetailOpsSharedLinkNotificationDispatchStatus
  },
) {
  try {
    const orderRequest = await db.productShareLinkOrderRequest.findUnique({
      where: {
        orderId: input.orderId,
      },
      select: {
        id: true,
        shareLinkId: true,
        storeId: true,
        tenantId: true,
      },
    })

    if (!orderRequest) return

    const recipients = new Map<
      string,
      {
        email: string | null
        key: string
        type: "ADMIN" | "CUSTOMER"
      }
    >()
    const customerEmail =
      input.notification?.customerEmail ?? input.customerEmail

    if (customerEmail) {
      recipients.set(`customer:${customerEmail.toLowerCase()}`, {
        email: customerEmail,
        key: "customer",
        type: "CUSTOMER",
      })
    }

    for (const [index, recipient] of (
      input.notification?.merchantRecipients ?? []
    ).entries()) {
      const email = recipient.email.trim().toLowerCase()

      if (!email) continue

      recipients.set(`merchant:${email}`, {
        email,
        key: `merchant:${email}:${index}`,
        type: "ADMIN",
      })
    }

    if (recipients.size === 0) {
      recipients.set("merchant:aggregate", {
        email: null,
        key: "merchant",
        type: "ADMIN",
      })
    }

    for (const recipient of recipients.values()) {
      const delivery = getNotificationDeliveryReceipt(input.deliveries, {
        email: recipient.email,
        type: recipient.type,
      })
      const deliveryAttemptedAt = toIsoString(
        delivery?.sentAt ?? delivery?.failedAt,
      )
      const deliveryStatus = getNotificationDeliveryStatus(
        delivery,
        input.status,
      )

      await upsertDurableShareLinkNotification(db, {
        attempt: input.attempt ?? null,
        attemptedAt: deliveryAttemptedAt
          ? new Date(deliveryAttemptedAt)
          : input.attemptedAt,
        externalId: `${input.orderId}:${recipient.key}`,
        failureReason: normalizeNullableFailureReason(
          delivery?.error ?? input.failureReason,
        ),
        maxAttempts: input.maxAttempts ?? null,
        nextRetryAt:
          deliveryStatus === "failed" ? (input.nextRetryAt ?? null) : null,
        orderRequestId: orderRequest.id,
        provider: delivery?.provider ?? null,
        providerMessageId: delivery?.providerMessageId ?? null,
        recipientEmail: recipient.email,
        recipientType: recipient.type,
        shareLinkId: orderRequest.shareLinkId,
        status: deliveryStatus,
        subject: delivery?.subject ?? null,
        storeId: orderRequest.storeId,
        tenantId: orderRequest.tenantId,
      })
    }
  } catch (error) {
    if (
      isDurableShareLinkTableUnavailable(error) ||
      isMissingDurableShareLinkRecord(error) ||
      isUniqueConstraintError(error)
    ) {
      return
    }

    throw error
  }
}

async function listDurableProductShareLinks(
  db: PrismaClient,
  input: ListRetailOpsProductShareLinksInput,
) {
  try {
    const shareLinks = await db.productShareLink.findMany({
      where: {
        storeId: input.storeId,
        tenantId: input.tenantId,
        product: {
          status: { not: "ARCHIVED" },
        },
      },
      orderBy: [
        {
          lastActivityAt: "desc",
        },
        {
          updatedAt: "desc",
        },
      ],
      select: {
        createExternalId: true,
        createdAt: true,
        createdByUserId: true,
        deactivateExternalId: true,
        deactivatedAt: true,
        deactivatedByUserId: true,
        id: true,
        label: true,
        lastActivityAt: true,
        orderCount: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        status: true,
        token: true,
        url: true,
        viewCount: true,
      },
    })

    return shareLinks.map(toDurableShareLink)
  } catch (error) {
    if (isDurableShareLinkTableUnavailable(error)) return null

    throw error
  }
}

async function getDurableRetailOpsSharedProduct(
  db: PrismaClient,
  input: GetRetailOpsSharedProductInput,
) {
  try {
    const shareLink = await db.productShareLink.findFirst({
      where: {
        token: input.token,
        product: {
          kind: "PRODUCT",
          slug: input.productSlug,
          status: { not: "ARCHIVED" },
          store: {
            slug: input.storeSlug,
            tenant: {
              slug: input.tenantSlug,
            },
          },
        },
      },
      select: {
        createExternalId: true,
        createdAt: true,
        createdByUserId: true,
        deactivateExternalId: true,
        deactivatedAt: true,
        deactivatedByUserId: true,
        id: true,
        label: true,
        lastActivityAt: true,
        orderCount: true,
        product: {
          select: {
            currencyCode: true,
            description: true,
            id: true,
            metadata: true,
            name: true,
            slug: true,
            store: {
              select: {
                currencyCode: true,
                id: true,
                name: true,
                slug: true,
                tenant: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
            variants: {
              where: {
                isActive: true,
              },
              orderBy: {
                createdAt: "asc",
              },
              select: {
                id: true,
                inventoryItem: {
                  select: {
                    onHandQuantity: true,
                    reservedQuantity: true,
                  },
                },
                isDefault: true,
                name: true,
                priceMinor: true,
                sku: true,
              },
            },
          },
        },
        status: true,
        token: true,
        url: true,
        viewCount: true,
      },
    })

    if (!shareLink) return null

    if (shareLink.status !== "ACTIVE") {
      throw new RetailOpsShareLinkError(
        "SHARE_LINK_NOT_FOUND",
        "This product link is no longer available.",
      )
    }

    if (!input.recordView) {
      return toSharedProductFromDurableShareLink(shareLink)
    }

    const viewedAt = new Date()
    const viewedShareLink = await db.$transaction(async (tx) => {
      const updatedShareLink = await tx.productShareLink.update({
        where: {
          id: shareLink.id,
        },
        data: {
          lastActivityAt: viewedAt,
          viewCount: {
            increment: 1,
          },
        },
        select: {
          createExternalId: true,
          createdAt: true,
          createdByUserId: true,
          deactivateExternalId: true,
          deactivatedAt: true,
          deactivatedByUserId: true,
          id: true,
          label: true,
          lastActivityAt: true,
          orderCount: true,
          product: {
            select: {
              currencyCode: true,
              description: true,
              id: true,
              metadata: true,
              name: true,
              slug: true,
              store: {
                select: {
                  currencyCode: true,
                  id: true,
                  name: true,
                  slug: true,
                  tenant: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
              variants: {
                where: {
                  isActive: true,
                },
                orderBy: {
                  createdAt: "asc",
                },
                select: {
                  id: true,
                  inventoryItem: {
                    select: {
                      onHandQuantity: true,
                      reservedQuantity: true,
                    },
                  },
                  isDefault: true,
                  name: true,
                  priceMinor: true,
                  sku: true,
                },
              },
            },
          },
          status: true,
          token: true,
          url: true,
          viewCount: true,
        },
      })

      await tx.productShareLinkView.create({
        data: {
          metadata: {
            retailOps: {
              source: "retail_ops_shared_product_lookup",
            },
          } as Prisma.InputJsonValue,
          productId: shareLink.product.id,
          shareLinkId: shareLink.id,
          storeId: shareLink.product.store.id,
          tenantId: shareLink.product.store.tenant.id,
          viewedAt,
        },
        select: {
          id: true,
        },
      })

      await createDurableShareLinkEvent(tx, {
        happenedAt: viewedAt,
        metadata: {
          retailOps: {
            source: "retail_ops_shared_product_lookup",
          },
        } as Prisma.InputJsonValue,
        shareLinkId: shareLink.id,
        storeId: shareLink.product.store.id,
        tenantId: shareLink.product.store.tenant.id,
        type: "VIEWED",
      })

      await recordDurableShareLinkAnalyticsDaily(tx, {
        delta: {
          viewCount: 1,
        },
        happenedAt: viewedAt,
        productId: shareLink.product.id,
        shareLinkId: shareLink.id,
        source: "retail_ops_shared_product_lookup",
        storeId: shareLink.product.store.id,
        tenantId: shareLink.product.store.tenant.id,
      })

      return updatedShareLink
    })

    return toSharedProductFromDurableShareLink(viewedShareLink)
  } catch (error) {
    if (isDurableShareLinkTableUnavailable(error)) return null

    throw error
  }
}

export async function listRetailOpsProductShareLinks(
  db: PrismaClient,
  input: ListRetailOpsProductShareLinksInput,
): Promise<RetailOpsProductShareLink[]> {
  const durableShareLinks = await listDurableProductShareLinks(db, input)
  const products = await db.product.findMany({
    where: {
      kind: "PRODUCT",
      status: { not: "ARCHIVED" },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      metadata: true,
      name: true,
      slug: true,
    },
  })

  const fallbackShareLinks = products.flatMap((product) =>
    getShareLinks(product.metadata).map((shareLink) =>
      toShareLink({
        metadata: shareLink,
        product,
      }),
    ),
  )

  if (!durableShareLinks) return fallbackShareLinks

  const shareLinks = mergeShareLinks({
    durableShareLinks,
    fallbackShareLinks,
  })

  return applyDurableShareLinkAnalytics(db, {
    shareLinks,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
}

export async function getRetailOpsProductShareLinkAnalytics(
  db: PrismaClient,
  input: GetRetailOpsProductShareLinkAnalyticsInput,
): Promise<RetailOpsProductShareLinkAnalytics> {
  const range = getAnalyticsRange(input)
  const shareLinks = filterShareLinksForAnalytics(
    await listRetailOpsProductShareLinks(db, {
      storeId: input.storeId,
      tenantId: input.tenantId,
    }),
    input,
  )

  if (shareLinks.length === 0) {
    return getShareLinkAnalyticsFallback({
      range,
      shareLinks,
    })
  }

  try {
    const analyticsRows = await db.productShareLinkAnalyticsDaily.findMany({
      where: {
        day: {
          gte: getUtcDay(range.from),
          lte: getUtcDay(range.to),
        },
        shareLinkId: {
          in: shareLinks.map((shareLink) => shareLink.id),
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      orderBy: [
        {
          day: "asc",
        },
        {
          shareLinkId: "asc",
        },
      ],
      select: {
        cancelledOrderCount: true,
        completedOrderCount: true,
        consumedQuantity: true,
        day: true,
        orderRequestCount: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        releasedQuantity: true,
        reservedQuantity: true,
        revenueMinor: true,
        shareLinkId: true,
        uniqueVisitorCount: true,
        viewCount: true,
      },
    })
    const linkSummaries = shareLinks.map((shareLink) => ({
      ...createEmptyShareLinkAnalyticsMetrics(),
      shareLink,
    }))
    const linkSummariesById = new Map(
      linkSummaries.map((linkSummary) => [
        linkSummary.shareLink.id,
        linkSummary,
      ]),
    )
    const daily: RetailOpsProductShareLinkAnalytics["daily"] = []
    let summaryMetrics = createEmptyShareLinkAnalyticsMetrics()

    for (const analyticsRow of analyticsRows) {
      const metrics = {
        cancelledOrderCount: analyticsRow.cancelledOrderCount,
        completedOrderCount: analyticsRow.completedOrderCount,
        consumedQuantity: analyticsRow.consumedQuantity,
        orderRequestCount: analyticsRow.orderRequestCount,
        releasedQuantity: analyticsRow.releasedQuantity,
        reservedQuantity: analyticsRow.reservedQuantity,
        revenueMinor: analyticsRow.revenueMinor,
        uniqueVisitorCount: analyticsRow.uniqueVisitorCount,
        viewCount: analyticsRow.viewCount,
      }
      const linkSummary = linkSummariesById.get(analyticsRow.shareLinkId)

      if (!linkSummary) continue

      Object.assign(
        linkSummary,
        addShareLinkAnalyticsMetrics(linkSummary, metrics),
      )
      summaryMetrics = addShareLinkAnalyticsMetrics(summaryMetrics, metrics)
      daily.push({
        ...metrics,
        day: analyticsRow.day.toISOString(),
        product: analyticsRow.product,
        shareLinkId: analyticsRow.shareLinkId,
      })
    }

    return {
      daily,
      linkSummaries,
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      source: "daily_rollup",
      summary: {
        ...summaryMetrics,
        activeLinkCount: shareLinks.filter((shareLink) => shareLink.active)
          .length,
        linkCount: shareLinks.length,
      },
    }
  } catch (error) {
    if (isDurableShareLinkTableUnavailable(error)) {
      return getShareLinkAnalyticsFallback({
        range,
        shareLinks,
      })
    }

    throw error
  }
}

async function listDurableRetailOpsSharedLinkOrderRequests(
  db: PrismaClient,
  input: ListRetailOpsSharedLinkOrderRequestsInput,
  options: {
    lookbackLimit: number
    range: {
      from: Date
      to: Date
    }
    status: RetailOpsSharedLinkOrderRequestStatusFilter
  },
) {
  const mappedStatus = mapDurableSharedLinkOrderRequestStatus(options.status)
  const where: Prisma.ProductShareLinkOrderRequestWhereInput = {
    requestedAt: {
      gte: options.range.from,
      lte: options.range.to,
    },
    storeId: input.storeId,
    tenantId: input.tenantId,
  }

  if (mappedStatus) where.status = mappedStatus

  if (!input.canManageAllRequests) {
    where.shareLink = {
      createdByUserId: input.actorUserId,
    }
  }

  try {
    const orderRequests = await db.productShareLinkOrderRequest.findMany({
      where,
      orderBy: [
        {
          requestedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: options.lookbackLimit,
      select: {
        notifications: {
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            failedAt: true,
            failureReason: true,
            sentAt: true,
            status: true,
            updatedAt: true,
          },
        },
        order: {
          select: {
            createdAt: true,
            currencyCode: true,
            customerEmail: true,
            customerName: true,
            customerPhone: true,
            id: true,
            metadata: true,
            notes: true,
            orderNumber: true,
            paymentStatus: true,
            receipts: {
              orderBy: { issuedAt: "desc" },
              take: 1,
              select: {
                id: true,
                issuedAt: true,
                paymentMethod: true,
                receiptNumber: true,
                totalMinor: true,
              },
            },
            status: true,
            totalMinor: true,
            updatedAt: true,
            items: {
              orderBy: { createdAt: "asc" },
              take: 1,
              select: {
                id: true,
                metadata: true,
                nameSnapshot: true,
                productId: true,
                productVariantId: true,
                quantity: true,
                skuSnapshot: true,
                totalPriceMinor: true,
                unitPriceMinor: true,
                product: {
                  select: {
                    metadata: true,
                  },
                },
              },
            },
          },
        },
        reservations: {
          orderBy: {
            reservedAt: "desc",
          },
          take: 1,
          select: {
            metadata: true,
            productVariantId: true,
            quantity: true,
            status: true,
          },
        },
        shareLink: {
          select: {
            createdByUserId: true,
            id: true,
            label: true,
            status: true,
            token: true,
            url: true,
          },
        },
      },
    })

    return orderRequests.map((orderRequest) => {
      const metadataNotification = toNotificationDispatchResponse(
        getSharedLinkNotificationDispatchMetadata(orderRequest.order.metadata),
      )
      const durableNotification = toDurableNotificationDispatchResponse(
        orderRequest.notifications,
      )

      return toSharedLinkOrderRequestFromOrder({
        notification: metadataNotification.status
          ? metadataNotification
          : durableNotification,
        order: orderRequest.order,
        reservation:
          toDurableReservationResponse(orderRequest.reservations[0] ?? null) ??
          undefined,
        shareLink: {
          active: orderRequest.shareLink.status === "ACTIVE",
          createdByUserId: orderRequest.shareLink.createdByUserId,
          id: orderRequest.shareLink.id,
          label: orderRequest.shareLink.label,
          token: orderRequest.shareLink.token,
          url: orderRequest.shareLink.url,
        },
      })
    })
  } catch (error) {
    if (isDurableShareLinkTableUnavailable(error)) return null

    throw error
  }
}

async function listMetadataRetailOpsSharedLinkOrderRequests(
  db: PrismaClient,
  input: ListRetailOpsSharedLinkOrderRequestsInput,
  options: {
    limit: number
    lookbackLimit: number
    range: {
      from: Date
      to: Date
    }
    status: RetailOpsSharedLinkOrderRequestStatusFilter
  },
): Promise<RetailOpsSharedLinkOrderRequest[]> {
  const mappedStatus = mapSharedLinkOrderStatus(options.status)
  const where: Prisma.OrderWhereInput = {
    createdAt: {
      gte: options.range.from,
      lte: options.range.to,
    },
    storeId: input.storeId,
    tenantId: input.tenantId,
  }

  if (mappedStatus) where.status = mappedStatus

  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options.lookbackLimit,
    select: {
      createdAt: true,
      currencyCode: true,
      customerEmail: true,
      customerName: true,
      customerPhone: true,
      id: true,
      metadata: true,
      notes: true,
      orderNumber: true,
      paymentStatus: true,
      receipts: {
        orderBy: { issuedAt: "desc" },
        take: 1,
        select: {
          id: true,
          issuedAt: true,
          paymentMethod: true,
          receiptNumber: true,
          totalMinor: true,
        },
      },
      status: true,
      totalMinor: true,
      updatedAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          id: true,
          metadata: true,
          nameSnapshot: true,
          productId: true,
          productVariantId: true,
          quantity: true,
          skuSnapshot: true,
          totalPriceMinor: true,
          unitPriceMinor: true,
          product: {
            select: {
              metadata: true,
            },
          },
        },
      },
    },
  })

  return orders
    .flatMap((order) => {
      const metadata = getSharedLinkOrderMetadata(order.metadata)

      if (metadata.source !== "retail_ops_share_link_order_request") {
        return []
      }

      if (
        !input.canManageAllRequests &&
        metadata.shareLinkCreatorUserId !== input.actorUserId
      ) {
        return []
      }

      const line = order.items[0] ?? null
      const shareLink = line
        ? findShareLinkByIdOrToken(line.product.metadata, {
            id: metadata.shareLinkId,
            token: metadata.shareToken,
          })
        : null

      return [
        toSharedLinkOrderRequestFromOrder({
          order,
          shareLink: {
            active: shareLink?.active ?? null,
            createdByUserId:
              shareLink?.createdByUserId ??
              metadata.shareLinkCreatorUserId ??
              null,
            id: shareLink?.id ?? metadata.shareLinkId,
            label: shareLink?.label ?? null,
            token: shareLink?.token ?? metadata.shareToken,
            url: shareLink?.url ?? null,
          },
        }),
      ]
    })
    .slice(0, options.limit)
}

export async function listRetailOpsSharedLinkOrderRequests(
  db: PrismaClient,
  input: ListRetailOpsSharedLinkOrderRequestsInput,
): Promise<RetailOpsSharedLinkOrderRequest[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  const lookbackLimit = Math.max(limit * 5, 100)
  const range = getRange(input)
  const status = input.status ?? "pending"
  const durableRequests = await listDurableRetailOpsSharedLinkOrderRequests(
    db,
    input,
    {
      lookbackLimit,
      range,
      status,
    },
  )
  const fallbackRequests = await listMetadataRetailOpsSharedLinkOrderRequests(
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

  return mergeSharedLinkOrderRequests({
    durableRequests,
    fallbackRequests,
    limit,
  })
}

export async function updateRetailOpsSharedLinkOrderRequestStatus(
  db: PrismaClient,
  input: UpdateRetailOpsSharedLinkOrderRequestStatusInput,
): Promise<RetailOpsSharedLinkOrderRequest> {
  const order = await db.order.findFirst({
    where: {
      id: input.orderId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: {
      metadata: true,
      status: true,
      totalMinor: true,
    },
  })

  if (!order) {
    throw new RetailOpsShareLinkError(
      "ORDER_REQUEST_NOT_FOUND",
      "Shared-link order request not found.",
    )
  }

  const metadata = getSharedLinkOrderMetadata(order.metadata)

  if (metadata.source !== "retail_ops_share_link_order_request") {
    throw new RetailOpsShareLinkError(
      "ORDER_REQUEST_NOT_FOUND",
      "Shared-link order request not found.",
    )
  }

  if (
    !input.canManageAllRequests &&
    metadata.shareLinkCreatorUserId !== input.actorUserId
  ) {
    throw new RetailOpsShareLinkError(
      "ORDER_REQUEST_FORBIDDEN",
      "You can only update order requests from links you created.",
    )
  }

  if (order.status !== "PENDING") {
    throw new RetailOpsShareLinkError(
      "ORDER_REQUEST_ALREADY_FINALIZED",
      "This shared-link order request has already been finalized.",
    )
  }

  const updatedOrder = await db.$transaction(async (tx) => {
    const nowDate = new Date()
    const now = nowDate.toISOString()
    const stockReservation = await applySharedLinkOrderReservationStatus(tx, {
      actorUserId: input.actorUserId,
      metadata,
      now,
      status: input.status,
    })
    const fulfillment = getSharedLinkFulfillmentPatch(input, nowDate)
    const receipt =
      input.status === "completed" && input.paymentMethod
        ? await tx.receipt.create({
            data: {
              cashierSessionId: input.cashierSessionId,
              issuedAt: input.paidAt ?? nowDate,
              issuedByUserId: input.actorUserId,
              orderId: input.orderId,
              paymentMethod: getSharedLinkPaymentMethodLabel(
                input.paymentMethod,
              ),
              receiptNumber: createReference("RCPT"),
              storeId: input.storeId,
              subtotalMinor: order.totalMinor,
              tenantId: input.tenantId,
              totalMinor: order.totalMinor,
            },
            select: {
              id: true,
              issuedAt: true,
              paymentMethod: true,
              receiptNumber: true,
              totalMinor: true,
            },
          })
        : null

    const updatedOrder = await tx.order.update({
      where: {
        id: input.orderId,
      },
      data: {
        metadata: withSharedLinkOrderRetailOpsMetadata(order.metadata, {
          followUpAt: now,
          followUpByUserId: input.actorUserId,
          followUpStatus: input.status,
          ...(fulfillment ? { fulfillment } : {}),
          paymentMethod: input.paymentMethod ?? null,
          paymentState: receipt
            ? "paid_at_follow_up"
            : input.status === "completed"
              ? "follow_up_completed"
              : "follow_up_cancelled",
          receipt: receipt
            ? {
                id: receipt.id,
                issuedAt: receipt.issuedAt.toISOString(),
                paymentMethod: receipt.paymentMethod,
                receiptNumber: receipt.receiptNumber,
                totalMinor: receipt.totalMinor,
              }
            : null,
          stockReservation,
        }),
        paymentStatus: receipt ? "PAID" : undefined,
        status: mapSharedLinkOrderUpdateStatus(input.status),
      },
      select: {
        createdAt: true,
        currencyCode: true,
        customerEmail: true,
        customerName: true,
        customerPhone: true,
        id: true,
        metadata: true,
        notes: true,
        orderNumber: true,
        paymentStatus: true,
        receipts: {
          orderBy: { issuedAt: "desc" },
          take: 1,
          select: {
            id: true,
            issuedAt: true,
            paymentMethod: true,
            receiptNumber: true,
            totalMinor: true,
          },
        },
        status: true,
        totalMinor: true,
        updatedAt: true,
        items: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            id: true,
            metadata: true,
            nameSnapshot: true,
            productId: true,
            productVariantId: true,
            quantity: true,
            skuSnapshot: true,
            totalPriceMinor: true,
            unitPriceMinor: true,
            product: {
              select: {
                metadata: true,
              },
            },
          },
        },
      },
    })

    await recordDurableShareLinkOrderRequestFollowUp(tx, {
      actorUserId: input.actorUserId,
      happenedAt: nowDate,
      orderId: input.orderId,
      status: input.status,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })

    return updatedOrder
  })
  const updatedMetadata = getSharedLinkOrderMetadata(updatedOrder.metadata)
  const line = updatedOrder.items[0] ?? null
  const receipt = updatedOrder.receipts[0] ?? null
  const shareLink = line
    ? findShareLinkByIdOrToken(line.product.metadata, {
        id: updatedMetadata.shareLinkId,
        token: updatedMetadata.shareToken,
      })
    : null

  return {
    createdAt: updatedOrder.createdAt,
    currencyCode: updatedOrder.currencyCode,
    customer: {
      email: updatedOrder.customerEmail,
      name: updatedOrder.customerName,
      phone: updatedOrder.customerPhone,
    },
    fulfillment: getSharedLinkFulfillmentMetadata(updatedOrder.metadata),
    id: updatedOrder.id,
    line: line
      ? {
          id: line.id,
          productId: line.productId,
          productName: line.nameSnapshot,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          sku: line.skuSnapshot,
          totalMinor: line.totalPriceMinor,
          unitName: getRetailOpsLineUnitName(line.metadata),
          unitPriceMinor: line.unitPriceMinor,
        }
      : null,
    notes: updatedOrder.notes,
    notification: toNotificationDispatchResponse(
      getSharedLinkNotificationDispatchMetadata(updatedOrder.metadata),
    ),
    orderNumber: updatedOrder.orderNumber,
    paymentState: updatedMetadata.paymentState,
    paymentStatus: updatedOrder.paymentStatus,
    receipt: receipt
      ? {
          id: receipt.id,
          issuedAt: receipt.issuedAt,
          paymentMethod: receipt.paymentMethod,
          receiptNumber: receipt.receiptNumber,
          totalMinor: receipt.totalMinor,
        }
      : null,
    reservation: toReservationResponse(updatedMetadata.stockReservation),
    shareLink: {
      active: shareLink?.active ?? null,
      createdByUserId:
        shareLink?.createdByUserId ??
        updatedMetadata.shareLinkCreatorUserId ??
        null,
      id: shareLink?.id ?? updatedMetadata.shareLinkId,
      label: shareLink?.label ?? null,
      token: shareLink?.token ?? updatedMetadata.shareToken,
      url: shareLink?.url ?? null,
    },
    status: updatedOrder.status,
    totalMinor: updatedOrder.totalMinor,
    updatedAt: updatedOrder.updatedAt,
  }
}

export async function recordRetailOpsSharedLinkNotificationDispatch(
  db: PrismaClient,
  input: RecordRetailOpsSharedLinkNotificationDispatchInput,
): Promise<void> {
  const order = await db.order.findUnique({
    where: {
      id: input.orderId,
    },
    select: {
      customerEmail: true,
      metadata: true,
    },
  })

  if (!order) return

  const metadata = getSharedLinkOrderMetadata(order.metadata)

  if (metadata.source !== "retail_ops_share_link_order_request") return

  const now = (input.attemptedAt ?? new Date()).toISOString()
  const existingDispatch = getSharedLinkNotificationDispatchMetadata(
    order.metadata,
  )
  const existingAttemptCount =
    getNumberField(existingDispatch.attemptCount) ?? 0
  const attemptCount =
    input.status === "queued"
      ? existingAttemptCount
      : Math.max(
          input.attempt ?? existingAttemptCount + 1,
          existingAttemptCount,
        )
  const failureReason = normalizeFailureReason(input.failureReason)
  const deliveryResults = (input.deliveries ?? []).map((delivery) => ({
    error: normalizeNullableFailureReason(delivery.error),
    failedAt: toIsoString(delivery.failedAt),
    provider: delivery.provider ?? null,
    providerMessageId: delivery.providerMessageId ?? null,
    recipientEmail: delivery.recipientEmail,
    recipientType: delivery.deliveryRole,
    sentAt: toIsoString(delivery.sentAt),
    status: delivery.status,
    subject: delivery.subject ?? null,
  }))
  const sharedLinkNotification = {
    ...existingDispatch,
    attemptCount,
    deliveryResults,
    failedAt:
      input.status === "failed"
        ? now
        : getStringField(existingDispatch.failedAt),
    failureReason: input.status === "failed" ? failureReason : null,
    lastAttemptAt:
      input.status === "queued"
        ? getStringField(existingDispatch.lastAttemptAt)
        : now,
    maxAttempts:
      input.maxAttempts ?? getNumberField(existingDispatch.maxAttempts),
    nextRetryAt:
      input.status === "failed"
        ? (input.nextRetryAt?.toISOString() ?? null)
        : null,
    queuedAt:
      input.status === "queued"
        ? now
        : getStringField(existingDispatch.queuedAt),
    sentAt:
      input.status === "sent" ? now : getStringField(existingDispatch.sentAt),
    status: input.status,
  }

  await db.order.update({
    where: {
      id: input.orderId,
    },
    data: {
      metadata: withSharedLinkOrderRetailOpsMetadata(order.metadata, {
        sharedLinkNotification,
      }),
    },
    select: {
      id: true,
    },
  })
  await recordDurableShareLinkNotificationDispatch(db, {
    attempt: input.attempt,
    attemptedAt: input.attemptedAt ?? new Date(now),
    customerEmail: order.customerEmail,
    deliveries: input.deliveries,
    failureReason,
    maxAttempts: input.maxAttempts,
    nextRetryAt: input.nextRetryAt,
    notification: input.notification,
    orderId: input.orderId,
    status: input.status,
  })
}

export async function getRetailOpsSharedProduct(
  db: PrismaClient,
  input: GetRetailOpsSharedProductInput,
): Promise<RetailOpsSharedProduct> {
  const durableSharedProduct = await getDurableRetailOpsSharedProduct(db, input)

  if (durableSharedProduct) return durableSharedProduct

  const product = await db.product.findFirst({
    where: {
      kind: "PRODUCT",
      slug: input.productSlug,
      status: { not: "ARCHIVED" },
      store: {
        slug: input.storeSlug,
        tenant: {
          slug: input.tenantSlug,
        },
      },
    },
    select: {
      currencyCode: true,
      description: true,
      id: true,
      metadata: true,
      name: true,
      slug: true,
      store: {
        select: {
          currencyCode: true,
          id: true,
          name: true,
          slug: true,
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      variants: {
        where: {
          isActive: true,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          inventoryItem: {
            select: {
              onHandQuantity: true,
              reservedQuantity: true,
            },
          },
          isDefault: true,
          name: true,
          priceMinor: true,
          sku: true,
        },
      },
    },
  })

  if (!product) {
    throw new RetailOpsShareLinkError(
      "PRODUCT_NOT_FOUND",
      "Shared product not found.",
    )
  }

  const existingShareLink = findShareLinkByToken(product.metadata, input.token)

  if (!existingShareLink?.active) {
    throw new RetailOpsShareLinkError(
      "SHARE_LINK_NOT_FOUND",
      "This product link is no longer available.",
    )
  }

  const now = new Date().toISOString()
  const viewedShareLink = input.recordView
    ? {
        ...existingShareLink,
        lastActivityAt: now,
        viewCount: (existingShareLink.viewCount ?? 0) + 1,
      }
    : existingShareLink

  if (input.recordView) {
    await db.product.update({
      where: {
        id: product.id,
      },
      data: {
        metadata: withShareLinks(
          product.metadata,
          replaceShareLink(product.metadata, viewedShareLink),
        ),
      },
      select: {
        id: true,
      },
    })
  }

  return {
    product: {
      currencyCode: product.currencyCode,
      description: product.description,
      id: product.id,
      imageUrl: getProductImageUrl(product.metadata),
      name: product.name,
      slug: product.slug,
      variants: product.variants.map((variant) => ({
        availableQuantity: Math.max(
          0,
          (variant.inventoryItem?.onHandQuantity ?? 0) -
            (variant.inventoryItem?.reservedQuantity ?? 0),
        ),
        id: variant.id,
        isDefault: variant.isDefault,
        name: variant.name,
        priceMinor: variant.priceMinor,
        sku: variant.sku,
      })),
    },
    shareLink: toShareLink({
      metadata: viewedShareLink,
      product,
    }),
    store: {
      currencyCode: product.store.currencyCode,
      id: product.store.id,
      name: product.store.name,
      slug: product.store.slug,
    },
    tenant: product.store.tenant,
  }
}

export async function createRetailOpsProductShareLink(
  db: PrismaClient,
  input: CreateRetailOpsProductShareLinkInput,
): Promise<RetailOpsProductShareLink> {
  const product = await getShareableProduct(db, input)
  const externalId = normalizeExternalId(input.externalId)
  const durableReplayedShareLink = await findDurableShareLinkByExternalId(db, {
    externalId,
    productId: input.productId,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })

  if (durableReplayedShareLink) {
    return toDurableShareLink(durableReplayedShareLink)
  }

  const replayedShareLink = externalId
    ? findShareLinkByExternalId(product.metadata, externalId)
    : null

  if (replayedShareLink) {
    return toShareLink({
      metadata: replayedShareLink,
      product,
    })
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const token = createToken()
  const url = buildShareUrl({
    hostnames: product.store.tenant.hostnames,
    productSlug: product.slug,
    publicBaseUrl: input.publicBaseUrl,
    storeSlug: product.store.slug,
    tenantSlug: product.store.tenant.slug,
    token,
  })
  const fallbackShareLink: ProductShareLinkMetadata = {
    active: true,
    createdAt: nowIso,
    createdByUserId: input.actorUserId,
    externalId: externalId ?? null,
    id: `share_${token}`,
    label: input.label ?? null,
    lastActivityAt: nowIso,
    orderCount: 0,
    token,
    url,
    viewCount: 0,
  }
  const durableShareLink = await db.$transaction(async (tx) => {
    const durableLink = await createDurableProductShareLink(tx, {
      createdAt: now,
      createdByUserId: input.actorUserId,
      externalId,
      label: input.label,
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
      },
      storeId: input.storeId,
      tenantId: input.tenantId,
      token,
      url,
    })
    const shareLink = durableLink
      ? toDurableShareLinkMetadata(durableLink)
      : fallbackShareLink
    const shareLinks = [shareLink, ...getShareLinks(product.metadata)]

    await tx.product.update({
      where: {
        id: product.id,
      },
      data: {
        metadata: withShareLinks(product.metadata, shareLinks),
      },
      select: {
        id: true,
      },
    })

    return durableLink
  })

  if (durableShareLink) return toDurableShareLink(durableShareLink)

  return toShareLink({
    metadata: fallbackShareLink,
    product,
  })
}

export async function deactivateRetailOpsProductShareLink(
  db: PrismaClient,
  input: DeactivateRetailOpsProductShareLinkInput,
): Promise<RetailOpsProductShareLink> {
  const product = await getShareableProduct(db, input)
  const externalId = normalizeExternalId(input.externalId)
  const durableShareLink = await findDurableShareLinkById(db, {
    productId: input.productId,
    shareLinkId: input.shareLinkId,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  const shareLinks = getShareLinks(product.metadata)
  const existingShareLink = shareLinks.find(
    (shareLink) => shareLink.id === input.shareLinkId,
  )
  const shareLinkForChecks = existingShareLink
    ? existingShareLink
    : durableShareLink
      ? toDurableShareLinkMetadata(durableShareLink)
      : null

  if (!shareLinkForChecks) {
    throw new RetailOpsShareLinkError(
      "SHARE_LINK_NOT_FOUND",
      "Share link not found for this product.",
    )
  }

  if (
    shareLinkForChecks.createdByUserId !== input.actorUserId &&
    !input.canManageAllLinks
  ) {
    throw new RetailOpsShareLinkError(
      "SHARE_LINK_FORBIDDEN",
      "You can only deactivate your own product links.",
    )
  }

  if (externalId && shareLinkForChecks.deactivationExternalId === externalId) {
    return durableShareLink
      ? toDurableShareLink(durableShareLink)
      : toShareLink({
          metadata: shareLinkForChecks,
          product,
        })
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const deactivatedShareLink = await db.$transaction(async (tx) => {
    const durableDeactivatedShareLink = durableShareLink
      ? await deactivateDurableProductShareLink(tx, {
          actorUserId: input.actorUserId,
          deactivatedAt: now,
          externalId,
          product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
          },
          shareLinkId: durableShareLink.id,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
      : null
    const metadataShareLink = durableDeactivatedShareLink
      ? toDurableShareLinkMetadata(durableDeactivatedShareLink)
      : {
          ...shareLinkForChecks,
          active: false,
          deactivatedAt: nowIso,
          deactivationExternalId: externalId ?? null,
          deactivatedByUserId: input.actorUserId,
          lastActivityAt: nowIso,
        }
    const nextShareLinks = existingShareLink
      ? shareLinks.map((shareLink) =>
          shareLink.id === shareLinkForChecks.id
            ? metadataShareLink
            : shareLink,
        )
      : [metadataShareLink, ...shareLinks]

    await tx.product.update({
      where: {
        id: product.id,
      },
      data: {
        metadata: withShareLinks(product.metadata, nextShareLinks),
      },
      select: {
        id: true,
      },
    })

    return durableDeactivatedShareLink ?? metadataShareLink
  })

  return toShareLink({
    metadata:
      "product" in deactivatedShareLink
        ? toDurableShareLinkMetadata(deactivatedShareLink)
        : deactivatedShareLink,
    product,
  })
}

export async function createRetailOpsSharedProductOrderRequest(
  db: PrismaClient,
  input: CreateRetailOpsSharedProductOrderRequestInput,
): Promise<CreatedRetailOpsSharedProductOrderRequest> {
  const sharedProduct = await getRetailOpsSharedProduct(db, {
    productSlug: input.productSlug,
    recordView: false,
    storeSlug: input.storeSlug,
    tenantSlug: input.tenantSlug,
    token: input.token,
  })
  const selectedVariant = sharedProduct.product.variants.find(
    (variant) => variant.id === input.productVariantId,
  )

  if (!selectedVariant) {
    throw new RetailOpsShareLinkError(
      "PRODUCT_VARIANT_NOT_FOUND",
      "Product variant not found for this product link.",
    )
  }

  if (selectedVariant.availableQuantity < input.quantity) {
    throw new RetailOpsShareLinkError(
      "INSUFFICIENT_STOCK",
      "Not enough stock is available for this order request.",
    )
  }

  const requestedAtDate = new Date()
  const requestedAt = requestedAtDate.toISOString()
  const totalMinor = selectedVariant.priceMinor * input.quantity
  const notificationBase = {
    businessName: sharedProduct.store.name,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    customerPhone: input.customerPhone ?? null,
    notes: input.notes ?? null,
    productName: sharedProduct.product.name,
    productUrl: sharedProduct.shareLink.url,
    quantity: input.quantity,
    totalFormatted: formatMinorMoney(
      totalMinor,
      sharedProduct.product.currencyCode,
    ),
    unitName: selectedVariant.name,
  }

  const { order, orderedShareLink, product } = await db.$transaction(
    async (tx) => {
      const inventoryItem = await tx.inventoryItem.findFirst({
        where: {
          productVariantId: selectedVariant.id,
          storeId: sharedProduct.store.id,
          tenantId: sharedProduct.tenant.id,
        },
        select: {
          id: true,
          onHandQuantity: true,
          reservedQuantity: true,
        },
      })

      if (
        !inventoryItem ||
        inventoryItem.onHandQuantity - inventoryItem.reservedQuantity <
          input.quantity
      ) {
        throw new RetailOpsShareLinkError(
          "INSUFFICIENT_STOCK",
          "Not enough stock is available for this order request.",
        )
      }

      const stockReservation = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          onHandQuantity: {
            gte: inventoryItem.reservedQuantity + input.quantity,
          },
          reservedQuantity: inventoryItem.reservedQuantity,
        },
        data: {
          reservedQuantity: { increment: input.quantity },
          updatedByUserId: sharedProduct.shareLink.createdByUserId,
        },
      })

      if (stockReservation.count !== 1) {
        throw new RetailOpsShareLinkError(
          "INSUFFICIENT_STOCK",
          "Not enough stock is available for this order request.",
        )
      }

      const order = await tx.order.create({
        data: {
          currencyCode: sharedProduct.product.currencyCode,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          metadata: {
            retailOps: {
              paymentState: "pending_follow_up",
              requestedAt,
              customerAccountId: input.customerAccount?.id ?? null,
              customerAuthMode: input.customerAccount?.mode ?? "guest",
              customerIdentityScope: "platform",
              shareLinkCreatorUserId: sharedProduct.shareLink.createdByUserId,
              shareLinkId: sharedProduct.shareLink.id,
              shareToken: sharedProduct.shareLink.token,
              source: "retail_ops_share_link_order_request",
              stockReservation: {
                inventoryItemId: inventoryItem.id,
                productVariantId: selectedVariant.id,
                quantity: input.quantity,
                reservedAt: requestedAt,
                status: "reserved",
              },
            },
          },
          notes: input.notes,
          orderNumber: createReference("REQ"),
          paymentStatus: "PENDING",
          status: "PENDING",
          storeId: sharedProduct.store.id,
          subtotalMinor: totalMinor,
          tenantId: sharedProduct.tenant.id,
          totalMinor,
          items: {
            create: {
              metadata: {
                retailOps: {
                  stockReservation: {
                    inventoryItemId: inventoryItem.id,
                    quantity: input.quantity,
                    reservedAt: requestedAt,
                    status: "reserved",
                  },
                  unitName: selectedVariant.name,
                },
              },
              nameSnapshot: sharedProduct.product.name,
              productId: sharedProduct.product.id,
              productVariantId: selectedVariant.id,
              quantity: input.quantity,
              skuSnapshot: selectedVariant.sku,
              totalPriceMinor: totalMinor,
              unitPriceMinor: selectedVariant.priceMinor,
            },
          },
        },
        select: {
          currencyCode: true,
          id: true,
          orderNumber: true,
          paymentStatus: true,
          status: true,
          totalMinor: true,
        },
      })

      await recordRetailOpsSharedLinkCustomer(tx, {
        actorUserId: sharedProduct.shareLink.createdByUserId,
        customerAccountId: input.customerAccount?.id ?? null,
        email: input.customerEmail,
        name: input.customerName,
        orderId: order.id,
        phone: input.customerPhone ?? null,
        storeId: sharedProduct.store.id,
        tenantId: sharedProduct.tenant.id,
      })

      await recordDurableShareLinkOrderRequest(tx, {
        customerAccountId: input.customerAccount?.id ?? null,
        customerAuthMode: input.customerAccount?.mode ?? "guest",
        happenedAt: requestedAtDate,
        inventoryItemId: inventoryItem.id,
        orderId: order.id,
        productId: sharedProduct.product.id,
        productVariantId: selectedVariant.id,
        quantity: input.quantity,
        reservedByUserId: sharedProduct.shareLink.createdByUserId,
        shareLinkId: sharedProduct.shareLink.id,
        storeId: sharedProduct.store.id,
        tenantId: sharedProduct.tenant.id,
        totalMinor,
        unitName: selectedVariant.name,
      })

      const product = await tx.product.findUnique({
        where: {
          id: sharedProduct.product.id,
        },
        select: {
          id: true,
          metadata: true,
          name: true,
          slug: true,
        },
      })

      if (!product) {
        return {
          order,
          orderedShareLink: null,
          product,
        }
      }

      const shareLink = findShareLinkByToken(product.metadata, input.token)
      const orderedShareLink = shareLink
        ? {
            ...shareLink,
            lastActivityAt: requestedAt,
            orderCount: (shareLink.orderCount ?? 0) + 1,
          }
        : null

      if (orderedShareLink) {
        await tx.product.update({
          where: {
            id: product.id,
          },
          data: {
            metadata: withShareLinks(
              product.metadata,
              replaceShareLink(product.metadata, orderedShareLink),
            ),
          },
          select: {
            id: true,
          },
        })
      }

      return {
        order,
        orderedShareLink,
        product,
      }
    },
  )

  if (!product) {
    const merchantRecipients = await getSharedLinkOrderMerchantRecipients(db, {
      shareLinkCreatorUserId: sharedProduct.shareLink.createdByUserId,
      tenantId: sharedProduct.tenant.id,
    })

    return {
      line: {
        productId: sharedProduct.product.id,
        productName: sharedProduct.product.name,
        quantity: input.quantity,
        totalMinor,
        unitName: selectedVariant.name,
        unitPriceMinor: selectedVariant.priceMinor,
      },
      notification: {
        ...notificationBase,
        merchantRecipients,
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
      order,
      shareLink: sharedProduct.shareLink,
    }
  }

  const merchantRecipients = await getSharedLinkOrderMerchantRecipients(db, {
    shareLinkCreatorUserId: sharedProduct.shareLink.createdByUserId,
    tenantId: sharedProduct.tenant.id,
  })

  return {
    line: {
      productId: sharedProduct.product.id,
      productName: sharedProduct.product.name,
      quantity: input.quantity,
      totalMinor,
      unitName: selectedVariant.name,
      unitPriceMinor: selectedVariant.priceMinor,
    },
    notification: {
      ...notificationBase,
      merchantRecipients,
      orderId: order.id,
      orderNumber: order.orderNumber,
    },
    order,
    shareLink: orderedShareLink
      ? toShareLink({
          metadata: orderedShareLink,
          product,
        })
      : sharedProduct.shareLink,
  }
}
