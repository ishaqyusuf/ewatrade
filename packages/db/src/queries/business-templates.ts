import { randomUUID } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import type { DbClient } from "./types"

export const BUSINESS_TEMPLATE_KEYS = [
  "product_sales",
  "dry_cleaning_laundry",
  "other_generic",
] as const

export type BusinessTemplateKey = (typeof BUSINESS_TEMPLATE_KEYS)[number]

export type BusinessTemplateDefinition = {
  key: BusinessTemplateKey
  label: string
  description: string
  primaryWorkflow: "inventory_sales" | "service_orders" | "demand_capture"
  terminology: {
    catalogItem: string
    customerAction: string
    order: string
  }
  enabledCapabilities: string[]
}

export type DryCleaningServiceItemStatus = "active" | "archived"
export type DryCleaningServiceOrderStatus =
  | "cancelled"
  | "completed"
  | "delayed"
  | "delivery_pending"
  | "in_progress"
  | "pickup_pending"
  | "ready"
  | "received"
export type DryCleaningPaymentStatus =
  | "paid"
  | "partial"
  | "pay_on_collection"
  | "pay_on_delivery"
  | "unpaid"
export type DryCleaningServiceRequestStatus =
  | "cancelled"
  | "confirmed"
  | "converted"
  | "pending"
  | "rejected"

type JsonRecord = Record<string, unknown>

export type DryCleaningSettings = {
  expressSurchargePercent: number
  updatedAt: string | null
}

export type DryCleaningServiceItemVariant = {
  id: string
  name: string
  priceMinor: number
}

export type DryCleaningServiceItem = {
  category: string | null
  createdAt: string
  description: string | null
  estimatedTurnaroundHours: number | null
  id: string
  name: string
  priceMinor: number
  status: DryCleaningServiceItemStatus
  updatedAt: string
  variants: DryCleaningServiceItemVariant[]
}

export type DryCleaningServiceLine = {
  category: string | null
  note: string | null
  quantity: number
  serviceItemId: string
  serviceItemName: string
  totalPriceMinor: number
  unitPriceMinor: number
  variantId: string | null
  variantName: string | null
}

export type DryCleaningCustomerSnapshot = {
  email: string | null
  name: string
  phone: string | null
}

export type DryCleaningOrderEvent = {
  actorUserId: string | null
  at: string
  note: string | null
  status: DryCleaningServiceOrderStatus
  type: string
}

export type DryCleaningEvidence = {
  addedAt: string
  actorUserId: string | null
  id: string
  label: string | null
  url: string
}

export type DryCleaningNotificationIntent = {
  channel: "manual"
  createdAt: string
  customerPhone: string | null
  id: string
  manualCopy: string
  orderId: string
  status: "pending"
  type: "delay" | "ready"
}

export type DryCleaningServiceOrder = {
  actorUserId: string | null
  completedAt: string | null
  createdAt: string
  currencyCode: string
  customer: DryCleaningCustomerSnapshot
  dueAt: string | null
  evidence: DryCleaningEvidence[]
  events: DryCleaningOrderEvent[]
  id: string
  lines: DryCleaningServiceLine[]
  notes: Array<{
    actorUserId: string | null
    at: string
    text: string
  }>
  paymentStatus: DryCleaningPaymentStatus
  source: "public_request" | "walk_in"
  status: DryCleaningServiceOrderStatus
  totalMinor: number
  trackingToken: string
  updatedAt: string
}

export type DryCleaningServiceRequestLink = {
  createdAt: string
  createdByUserId: string | null
  disabledAt: string | null
  id: string
  label: string
  token: string
}

export type DryCleaningServiceRequest = {
  convertedOrderId: string | null
  createdAt: string
  customer: DryCleaningCustomerSnapshot
  id: string
  lines: DryCleaningServiceLine[]
  notes: string | null
  requestLinkId: string
  status: DryCleaningServiceRequestStatus
  totalMinor: number
  trackingToken: string
  updatedAt: string
}

export type DryCleaningOperationalReport = {
  averageCompletionHours: number | null
  completedOrderCount: number
  delayedOrderCount: number
  from: string | null
  orderCount: number
  paymentStatusCounts: Record<DryCleaningPaymentStatus, number>
  popularServices: Array<{
    quantity: number
    serviceItemId: string
    serviceItemName: string
    totalMinor: number
  }>
  requestConversionRate: number | null
  requestCount: number
  revenueMinor: number
  statusCounts: Record<DryCleaningServiceOrderStatus, number>
  to: string | null
}

export type UnsupportedBusinessDemandSignal = {
  count: number
  firstSeenAt: string
  key: string
  label: string
  lastSeenAt: string
  samples: string[]
}

export class BusinessTemplateError extends Error {
  constructor(
    readonly code:
      | "INVALID_STATUS_TRANSITION"
      | "REQUEST_LINK_DISABLED"
      | "SERVICE_ITEM_ARCHIVED"
      | "SERVICE_ITEM_NOT_FOUND"
      | "SERVICE_ORDER_NOT_FOUND"
      | "SERVICE_REQUEST_NOT_FOUND"
      | "STORE_NOT_FOUND"
      | "TEMPLATE_CHANGE_BLOCKED"
      | "TEMPLATE_MISMATCH",
    message: string,
  ) {
    super(message)
    this.name = "BusinessTemplateError"
  }
}

export const BUSINESS_TEMPLATES: Record<
  BusinessTemplateKey,
  BusinessTemplateDefinition
> = {
  dry_cleaning_laundry: {
    description:
      "Service catalog, garment intake, status lifecycle, notifications, public requests, and customer tracking.",
    enabledCapabilities: [
      "service_catalog",
      "service_orders",
      "service_request_links",
      "customer_tracking",
      "operational_reports",
    ],
    key: "dry_cleaning_laundry",
    label: "Dry Cleaning / Laundry",
    primaryWorkflow: "service_orders",
    terminology: {
      catalogItem: "service",
      customerAction: "request service",
      order: "service order",
    },
  },
  other_generic: {
    description:
      "Capture unsupported business demand while keeping the merchant in a generic setup path.",
    enabledCapabilities: ["demand_capture"],
    key: "other_generic",
    label: "Other business",
    primaryWorkflow: "demand_capture",
    terminology: {
      catalogItem: "offering",
      customerAction: "request",
      order: "request",
    },
  },
  product_sales: {
    description:
      "Product catalog, inventory, POS sales, stock movement, share links, and customer book.",
    enabledCapabilities: [
      "product_catalog",
      "inventory",
      "pos_sales",
      "share_links",
      "customer_book",
    ],
    key: "product_sales",
    label: "Product Sales",
    primaryWorkflow: "inventory_sales",
    terminology: {
      catalogItem: "product",
      customerAction: "buy",
      order: "sale",
    },
  },
}

const DRY_CLEANING_STATUS_TRANSITIONS: Record<
  DryCleaningServiceOrderStatus,
  DryCleaningServiceOrderStatus[]
> = {
  cancelled: [],
  completed: [],
  delayed: ["cancelled", "in_progress", "ready"],
  delivery_pending: ["completed", "delayed"],
  in_progress: ["cancelled", "delayed", "ready"],
  pickup_pending: ["completed", "delayed"],
  ready: ["completed", "delivery_pending", "pickup_pending"],
  received: ["cancelled", "delayed", "in_progress"],
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return value as JsonRecord
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return null
  const text = value.trim()

  return text ? text : null
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function cleanPositiveInteger(value: unknown) {
  const number = cleanNumber(value)

  return number && Number.isInteger(number) && number > 0 ? number : null
}

function cleanNonNegativeInteger(value: unknown) {
  const number = cleanNumber(value)

  return number !== null && Number.isInteger(number) && number >= 0
    ? number
    : null
}

function normalizeIsoDate(value: unknown) {
  const rawValue = cleanText(value)
  if (!rawValue) return null

  const date = new Date(rawValue)
  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`
}

function createTrackingToken() {
  return randomUUID().replaceAll("-", "")
}

function cloneJsonRecord(value: unknown): JsonRecord {
  return { ...asRecord(value) }
}

function getRetailOpsMetadata(metadata: unknown) {
  return asRecord(asRecord(metadata).retailOps)
}

function withRetailOpsMetadata(
  metadata: unknown,
  retailOpsMetadata: JsonRecord,
) {
  return {
    ...cloneJsonRecord(metadata),
    retailOps: retailOpsMetadata as Prisma.InputJsonObject,
  } as Prisma.InputJsonObject
}

function getDryCleaningMetadata(metadata: unknown) {
  return asRecord(getRetailOpsMetadata(metadata).dryCleaning)
}

function getDryCleaningSettings(metadata: unknown): DryCleaningSettings {
  const settings = asRecord(getDryCleaningMetadata(metadata).settings)
  const expressSurchargePercent = cleanNonNegativeInteger(
    settings.expressSurchargePercent,
  )

  return {
    expressSurchargePercent: Math.min(expressSurchargePercent ?? 0, 500),
    updatedAt: normalizeIsoDate(settings.updatedAt),
  }
}

function normalizeTemplateKey(value: unknown): BusinessTemplateKey | null {
  const text = cleanText(value)
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")

  if (!text) return null
  if (text === "dry_cleaning" || text === "laundry") {
    return "dry_cleaning_laundry"
  }
  if (text === "dry_cleaning_laundry") return "dry_cleaning_laundry"
  if (text === "product" || text === "product_sales" || text === "retail") {
    return "product_sales"
  }
  if (text === "other" || text === "other_generic") return "other_generic"

  return null
}

export function resolveBusinessTemplateKey(input?: {
  businessTemplateKey?: string | null
  businessType?: string | null
}): BusinessTemplateKey {
  const explicit = normalizeTemplateKey(input?.businessTemplateKey)
  if (explicit) return explicit

  const businessType = normalizeTemplateKey(input?.businessType)
  if (businessType) return businessType

  return "product_sales"
}

export function listBusinessTemplates() {
  return BUSINESS_TEMPLATE_KEYS.map((key) => BUSINESS_TEMPLATES[key])
}

export function getBusinessTemplateDefinition(key: BusinessTemplateKey) {
  return BUSINESS_TEMPLATES[key]
}

function getTemplateKeyFromMetadata(metadata: unknown): BusinessTemplateKey {
  const retailOps = getRetailOpsMetadata(metadata)
  const businessTemplate = asRecord(retailOps.businessTemplate)
  const onboarding = asRecord(retailOps.onboarding)

  return resolveBusinessTemplateKey({
    businessTemplateKey:
      cleanText(businessTemplate.key) ??
      cleanText(onboarding.businessTemplateKey) ??
      cleanText(onboarding.businessTemplate),
    businessType: cleanText(onboarding.businessType),
  })
}

function getDryCleaningServiceItems(
  metadata: unknown,
): DryCleaningServiceItem[] {
  const items = getDryCleaningMetadata(metadata).serviceItems
  if (!Array.isArray(items)) return []

  return items.flatMap((item) => {
    const record = asRecord(item)
    const id = cleanText(record.id)
    const name = cleanText(record.name)
    const priceMinor = cleanNonNegativeInteger(record.priceMinor)
    const createdAt = normalizeIsoDate(record.createdAt)
    const updatedAt = normalizeIsoDate(record.updatedAt)

    if (!id || !name || priceMinor === null || !createdAt || !updatedAt) {
      return []
    }

    const status = cleanText(record.status)
    const variants = Array.isArray(record.variants)
      ? record.variants.flatMap((variant) => {
          const variantRecord = asRecord(variant)
          const variantId = cleanText(variantRecord.id)
          const variantName = cleanText(variantRecord.name)
          const variantPriceMinor = cleanNonNegativeInteger(
            variantRecord.priceMinor,
          )

          return variantId && variantName && variantPriceMinor !== null
            ? [
                {
                  id: variantId,
                  name: variantName,
                  priceMinor: variantPriceMinor,
                },
              ]
            : []
        })
      : []

    return [
      {
        category: cleanText(record.category),
        createdAt,
        description: cleanText(record.description),
        estimatedTurnaroundHours: cleanPositiveInteger(
          record.estimatedTurnaroundHours,
        ),
        id,
        name,
        priceMinor,
        status: status === "archived" ? "archived" : "active",
        updatedAt,
        variants,
      },
    ]
  })
}

function getDryCleaningServiceOrders(
  metadata: unknown,
): DryCleaningServiceOrder[] {
  const orders = getDryCleaningMetadata(metadata).serviceOrders
  if (!Array.isArray(orders)) return []

  return orders.flatMap((order) => {
    const record = asRecord(order)
    const id = cleanText(record.id)
    const createdAt = normalizeIsoDate(record.createdAt)
    const updatedAt = normalizeIsoDate(record.updatedAt)
    const trackingToken = cleanText(record.trackingToken)
    const status = cleanText(record.status)

    if (!id || !createdAt || !updatedAt || !trackingToken) return []

    const customer = asRecord(record.customer)
    const customerName = cleanText(customer.name)
    if (!customerName) return []

    const lines = normalizeDryCleaningLines(record.lines)
    const paymentStatus = cleanText(record.paymentStatus)
    const source = cleanText(record.source)

    return [
      {
        actorUserId: cleanText(record.actorUserId),
        completedAt: normalizeIsoDate(record.completedAt),
        createdAt,
        currencyCode: cleanText(record.currencyCode) ?? "NGN",
        customer: {
          email: cleanText(customer.email),
          name: customerName,
          phone: cleanText(customer.phone),
        },
        dueAt: normalizeIsoDate(record.dueAt),
        evidence: normalizeDryCleaningEvidence(record.evidence),
        events: normalizeDryCleaningOrderEvents(record.events),
        id,
        lines,
        notes: normalizeDryCleaningNotes(record.notes),
        paymentStatus:
          paymentStatus === "paid" ||
          paymentStatus === "partial" ||
          paymentStatus === "pay_on_collection" ||
          paymentStatus === "pay_on_delivery"
            ? paymentStatus
            : "unpaid",
        source: source === "public_request" ? "public_request" : "walk_in",
        status: normalizeDryCleaningOrderStatus(status),
        totalMinor:
          cleanNonNegativeInteger(record.totalMinor) ??
          lines.reduce((sum, line) => sum + line.totalPriceMinor, 0),
        trackingToken,
        updatedAt,
      },
    ]
  })
}

function normalizeDryCleaningOrderStatus(
  status: string | null,
): DryCleaningServiceOrderStatus {
  if (
    status === "cancelled" ||
    status === "completed" ||
    status === "delayed" ||
    status === "delivery_pending" ||
    status === "in_progress" ||
    status === "pickup_pending" ||
    status === "ready" ||
    status === "received"
  ) {
    return status
  }

  return "received"
}

function normalizeDryCleaningRequestStatus(
  status: string | null,
): DryCleaningServiceRequestStatus {
  if (
    status === "cancelled" ||
    status === "confirmed" ||
    status === "converted" ||
    status === "pending" ||
    status === "rejected"
  ) {
    return status
  }

  return "pending"
}

function normalizeDryCleaningLines(value: unknown): DryCleaningServiceLine[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((line) => {
    const record = asRecord(line)
    const serviceItemId = cleanText(record.serviceItemId)
    const serviceItemName = cleanText(record.serviceItemName)
    const quantity = cleanPositiveInteger(record.quantity)
    const unitPriceMinor = cleanNonNegativeInteger(record.unitPriceMinor)
    const totalPriceMinor = cleanNonNegativeInteger(record.totalPriceMinor)

    if (
      !serviceItemId ||
      !serviceItemName ||
      !quantity ||
      unitPriceMinor === null ||
      totalPriceMinor === null
    ) {
      return []
    }

    return [
      {
        category: cleanText(record.category),
        note: cleanText(record.note),
        quantity,
        serviceItemId,
        serviceItemName,
        totalPriceMinor,
        unitPriceMinor,
        variantId: cleanText(record.variantId),
        variantName: cleanText(record.variantName),
      },
    ]
  })
}

function normalizeDryCleaningEvidence(value: unknown): DryCleaningEvidence[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    const record = asRecord(entry)
    const id = cleanText(record.id)
    const url = cleanText(record.url)
    const addedAt = normalizeIsoDate(record.addedAt)

    return id && url && addedAt
      ? [
          {
            actorUserId: cleanText(record.actorUserId),
            addedAt,
            id,
            label: cleanText(record.label),
            url,
          },
        ]
      : []
  })
}

function normalizeDryCleaningOrderEvents(
  value: unknown,
): DryCleaningOrderEvent[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    const record = asRecord(entry)
    const at = normalizeIsoDate(record.at)
    const status = normalizeDryCleaningOrderStatus(cleanText(record.status))
    const type = cleanText(record.type)

    return at && type
      ? [
          {
            actorUserId: cleanText(record.actorUserId),
            at,
            note: cleanText(record.note),
            status,
            type,
          },
        ]
      : []
  })
}

function normalizeDryCleaningNotes(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    const record = asRecord(entry)
    const at = normalizeIsoDate(record.at)
    const text = cleanText(record.text)

    return at && text
      ? [{ actorUserId: cleanText(record.actorUserId), at, text }]
      : []
  })
}

function getDryCleaningRequestLinks(
  metadata: unknown,
): DryCleaningServiceRequestLink[] {
  const links = getDryCleaningMetadata(metadata).serviceRequestLinks
  if (!Array.isArray(links)) return []

  return links.flatMap((link) => {
    const record = asRecord(link)
    const id = cleanText(record.id)
    const token = cleanText(record.token)
    const createdAt = normalizeIsoDate(record.createdAt)

    return id && token && createdAt
      ? [
          {
            createdAt,
            createdByUserId: cleanText(record.createdByUserId),
            disabledAt: normalizeIsoDate(record.disabledAt),
            id,
            label: cleanText(record.label) ?? "Service request link",
            token,
          },
        ]
      : []
  })
}

function getDryCleaningServiceRequests(
  metadata: unknown,
): DryCleaningServiceRequest[] {
  const requests = getDryCleaningMetadata(metadata).serviceRequests
  if (!Array.isArray(requests)) return []

  return requests.flatMap((request) => {
    const record = asRecord(request)
    const id = cleanText(record.id)
    const createdAt = normalizeIsoDate(record.createdAt)
    const updatedAt = normalizeIsoDate(record.updatedAt)
    const requestLinkId = cleanText(record.requestLinkId)
    const trackingToken = cleanText(record.trackingToken)
    const customer = asRecord(record.customer)
    const customerName = cleanText(customer.name)

    if (
      !id ||
      !createdAt ||
      !updatedAt ||
      !requestLinkId ||
      !trackingToken ||
      !customerName
    ) {
      return []
    }

    const lines = normalizeDryCleaningLines(record.lines)

    return [
      {
        convertedOrderId: cleanText(record.convertedOrderId),
        createdAt,
        customer: {
          email: cleanText(customer.email),
          name: customerName,
          phone: cleanText(customer.phone),
        },
        id,
        lines,
        notes: cleanText(record.notes),
        requestLinkId,
        status: normalizeDryCleaningRequestStatus(cleanText(record.status)),
        totalMinor:
          cleanNonNegativeInteger(record.totalMinor) ??
          lines.reduce((sum, line) => sum + line.totalPriceMinor, 0),
        trackingToken,
        updatedAt,
      },
    ]
  })
}

function getDryCleaningNotificationIntents(
  metadata: unknown,
): DryCleaningNotificationIntent[] {
  const intents = getDryCleaningMetadata(metadata).notificationIntents
  if (!Array.isArray(intents)) return []

  return intents.flatMap((intent) => {
    const record = asRecord(intent)
    const id = cleanText(record.id)
    const createdAt = normalizeIsoDate(record.createdAt)
    const manualCopy = cleanText(record.manualCopy)
    const orderId = cleanText(record.orderId)
    const type = cleanText(record.type)

    return id &&
      createdAt &&
      manualCopy &&
      orderId &&
      (type === "delay" || type === "ready")
      ? [
          {
            channel: "manual" as const,
            createdAt,
            customerPhone: cleanText(record.customerPhone),
            id,
            manualCopy,
            orderId,
            status: "pending" as const,
            type,
          },
        ]
      : []
  })
}

function buildDryCleaningMetadata(input: {
  notificationIntents?: DryCleaningNotificationIntent[]
  serviceItems?: DryCleaningServiceItem[]
  serviceOrders?: DryCleaningServiceOrder[]
  serviceRequestLinks?: DryCleaningServiceRequestLink[]
  serviceRequests?: DryCleaningServiceRequest[]
  settings?: DryCleaningSettings
}) {
  return {
    notificationIntents: input.notificationIntents ?? [],
    serviceItems: input.serviceItems ?? [],
    serviceOrders: input.serviceOrders ?? [],
    serviceRequestLinks: input.serviceRequestLinks ?? [],
    serviceRequests: input.serviceRequests ?? [],
    settings: input.settings ?? {
      expressSurchargePercent: 0,
      updatedAt: null,
    },
  }
}

async function getStoreOrThrow(
  db: DbClient,
  input: {
    storeId: string
    tenantId: string
  },
) {
  const store = await db.store.findFirst({
    where: {
      id: input.storeId,
      status: { not: "ARCHIVED" },
      tenantId: input.tenantId,
    },
    select: {
      currencyCode: true,
      id: true,
      metadata: true,
      name: true,
      slug: true,
      supportEmail: true,
      supportPhone: true,
      tenantId: true,
    },
  })

  if (!store) {
    throw new BusinessTemplateError(
      "STORE_NOT_FOUND",
      "Store not found for this tenant.",
    )
  }

  return store
}

async function updateStoreRetailOpsMetadata(
  db: DbClient,
  store: { id: string; metadata: unknown },
  retailOpsMetadata: JsonRecord,
) {
  return db.store.update({
    data: {
      metadata: withRetailOpsMetadata(store.metadata, retailOpsMetadata),
    },
    where: { id: store.id },
  })
}

function assertDryCleaningTemplate(metadata: unknown) {
  const templateKey = getTemplateKeyFromMetadata(metadata)

  if (templateKey !== "dry_cleaning_laundry") {
    throw new BusinessTemplateError(
      "TEMPLATE_MISMATCH",
      "Dry cleaning workflows are only available to Dry Cleaning / Laundry stores.",
    )
  }
}

function buildServiceLines(
  items: DryCleaningServiceItem[],
  inputLines: Array<{
    note?: string | null
    quantity: number
    serviceItemId: string
    unitPriceMinor?: number | null
    variantId?: string | null
  }>,
) {
  return inputLines.map((inputLine) => {
    const item = items.find((entry) => entry.id === inputLine.serviceItemId)

    if (!item) {
      throw new BusinessTemplateError(
        "SERVICE_ITEM_NOT_FOUND",
        "Service item not found.",
      )
    }

    if (item.status !== "active") {
      throw new BusinessTemplateError(
        "SERVICE_ITEM_ARCHIVED",
        "Archived service items cannot be added to new service orders.",
      )
    }

    const variant = inputLine.variantId
      ? item.variants.find((entry) => entry.id === inputLine.variantId)
      : null
    const unitPriceMinor =
      inputLine.unitPriceMinor ?? variant?.priceMinor ?? item.priceMinor
    const quantity = Math.max(1, Math.trunc(inputLine.quantity))

    return {
      category: item.category,
      note: cleanText(inputLine.note),
      quantity,
      serviceItemId: item.id,
      serviceItemName: item.name,
      totalPriceMinor: unitPriceMinor * quantity,
      unitPriceMinor,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
    } satisfies DryCleaningServiceLine
  })
}

function buildOrder(input: {
  actorUserId?: string | null
  createdAt: string
  currencyCode: string
  customer: DryCleaningCustomerSnapshot
  dueAt?: Date | null
  evidence?: Array<{
    label?: string | null
    url: string
  }>
  lines: DryCleaningServiceLine[]
  notes?: string | null
  paymentStatus?: DryCleaningPaymentStatus
  source: "public_request" | "walk_in"
}) {
  const note = cleanText(input.notes)
  const totalMinor = input.lines.reduce(
    (sum, line) => sum + line.totalPriceMinor,
    0,
  )

  return {
    actorUserId: cleanText(input.actorUserId),
    completedAt: null,
    createdAt: input.createdAt,
    currencyCode: input.currencyCode,
    customer: input.customer,
    dueAt: input.dueAt ? input.dueAt.toISOString() : null,
    evidence: (input.evidence ?? []).flatMap((entry) => {
      const url = cleanText(entry.url)

      return url
        ? [
            {
              actorUserId: cleanText(input.actorUserId),
              addedAt: input.createdAt,
              id: createId("dc_evidence"),
              label: cleanText(entry.label),
              url,
            },
          ]
        : []
    }),
    events: [
      {
        actorUserId: cleanText(input.actorUserId),
        at: input.createdAt,
        note,
        status: "received",
        type: "created",
      },
    ],
    id: createId("dc_order"),
    lines: input.lines,
    notes: note
      ? [
          {
            actorUserId: cleanText(input.actorUserId),
            at: input.createdAt,
            text: note,
          },
        ]
      : [],
    paymentStatus: input.paymentStatus ?? "unpaid",
    source: input.source,
    status: "received",
    totalMinor,
    trackingToken: createTrackingToken(),
    updatedAt: input.createdAt,
  } satisfies DryCleaningServiceOrder
}

export async function getStoreBusinessTemplate(
  db: DbClient,
  input: {
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  const key = getTemplateKeyFromMetadata(store.metadata)

  return {
    ...BUSINESS_TEMPLATES[key],
    storeId: store.id,
  }
}

export async function updateStoreBusinessTemplate(
  db: DbClient,
  input: {
    actorUserId?: string | null
    allowOperationalDataChange?: boolean
    nextTemplateKey: BusinessTemplateKey
    reason?: string | null
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  const currentTemplateKey = getTemplateKeyFromMetadata(store.metadata)
  const nextTemplate = BUSINESS_TEMPLATES[input.nextTemplateKey]
  const changedAt = new Date().toISOString()
  const retailOps = cloneJsonRecord(getRetailOpsMetadata(store.metadata))

  if (currentTemplateKey === input.nextTemplateKey) {
    return {
      changed: false,
      currentTemplateKey,
      template: nextTemplate,
    }
  }

  const dryCleaning = getDryCleaningMetadata(store.metadata)
  const dryCleaningRecordCount =
    getDryCleaningServiceItems(store.metadata).length +
    getDryCleaningServiceOrders(store.metadata).length +
    getDryCleaningServiceRequests(store.metadata).length
  const [productCount, orderCount] = await Promise.all([
    db.product.count({
      where: {
        status: { not: "ARCHIVED" },
        storeId: store.id,
        tenantId: input.tenantId,
      },
    }),
    db.order.count({
      where: {
        storeId: store.id,
        tenantId: input.tenantId,
      },
    }),
  ])

  if (
    !input.allowOperationalDataChange &&
    (productCount > 0 || orderCount > 0 || dryCleaningRecordCount > 0)
  ) {
    throw new BusinessTemplateError(
      "TEMPLATE_CHANGE_BLOCKED",
      "Business template cannot be changed after operational records exist.",
    )
  }

  const changes = Array.isArray(retailOps.businessTemplateChanges)
    ? retailOps.businessTemplateChanges
    : []

  retailOps.businessTemplate = {
    changedAt,
    key: nextTemplate.key,
    label: nextTemplate.label,
    previousKey: currentTemplateKey,
  }
  retailOps.businessTemplateChanges = [
    {
      actorUserId: cleanText(input.actorUserId),
      at: changedAt,
      from: currentTemplateKey,
      reason: cleanText(input.reason),
      to: nextTemplate.key,
    },
    ...changes,
  ].slice(0, 50)
  if (input.nextTemplateKey === "dry_cleaning_laundry") {
    retailOps.dryCleaning = {
      ...buildDryCleaningMetadata({}),
      ...dryCleaning,
    }
  }

  await updateStoreRetailOpsMetadata(db, store, retailOps)

  return {
    changed: true,
    currentTemplateKey: input.nextTemplateKey,
    previousTemplateKey: currentTemplateKey,
    template: nextTemplate,
  }
}

export async function listUnsupportedBusinessDemand(
  db: DbClient,
  input?: { limit?: number },
): Promise<UnsupportedBusinessDemandSignal[]> {
  const sessions = await db.onboardingSession.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      formData: true,
      id: true,
    },
    take: 500,
    where: { completed: true },
  })
  const grouped = new Map<string, UnsupportedBusinessDemandSignal>()

  for (const session of sessions) {
    const formData = asRecord(session.formData)
    const onboarding = asRecord(formData.onboarding)
    const key = resolveBusinessTemplateKey({
      businessTemplateKey: cleanText(onboarding.businessTemplateKey),
      businessType: cleanText(onboarding.businessType),
    })

    if (key !== "other_generic") continue

    const label =
      cleanText(onboarding.otherBusinessDescription) ??
      cleanText(onboarding.businessType) ??
      "Other business"
    const normalizedKey = label.toLowerCase().replace(/\s+/g, " ").trim()
    const seenAt = session.createdAt.toISOString()
    const existing = grouped.get(normalizedKey)

    if (!existing) {
      grouped.set(normalizedKey, {
        count: 1,
        firstSeenAt: seenAt,
        key: normalizedKey,
        label,
        lastSeenAt: seenAt,
        samples: [label],
      })
      continue
    }

    existing.count += 1
    existing.firstSeenAt =
      existing.firstSeenAt < seenAt ? existing.firstSeenAt : seenAt
    existing.lastSeenAt =
      existing.lastSeenAt > seenAt ? existing.lastSeenAt : seenAt
    if (!existing.samples.includes(label) && existing.samples.length < 5) {
      existing.samples.push(label)
    }
  }

  return Array.from(grouped.values())
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count

      return right.lastSeenAt.localeCompare(left.lastSeenAt)
    })
    .slice(0, input?.limit ?? 25)
}

export async function listDryCleaningServiceItems(
  db: DbClient,
  input: {
    includeArchived?: boolean
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  return getDryCleaningServiceItems(store.metadata)
    .filter((item) => input.includeArchived || item.status === "active")
    .sort((left, right) => left.name.localeCompare(right.name))
}

export async function getDryCleaningStoreSettings(
  db: DbClient,
  input: {
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  return getDryCleaningSettings(store.metadata)
}

export async function updateDryCleaningStoreSettings(
  db: DbClient,
  input: {
    expressSurchargePercent: number
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  const retailOps = cloneJsonRecord(getRetailOpsMetadata(store.metadata))
  const dryCleaning = getDryCleaningMetadata(store.metadata)
  const nextSettings = {
    expressSurchargePercent: Math.min(
      500,
      Math.max(0, Math.trunc(input.expressSurchargePercent)),
    ),
    updatedAt: new Date().toISOString(),
  } satisfies DryCleaningSettings

  retailOps.dryCleaning = {
    ...buildDryCleaningMetadata({
      notificationIntents: getDryCleaningNotificationIntents(store.metadata),
      serviceItems: getDryCleaningServiceItems(store.metadata),
      serviceOrders: getDryCleaningServiceOrders(store.metadata),
      serviceRequestLinks: getDryCleaningRequestLinks(store.metadata),
      serviceRequests: getDryCleaningServiceRequests(store.metadata),
      settings: nextSettings,
    }),
    ...dryCleaning,
    settings: nextSettings,
  }
  await updateStoreRetailOpsMetadata(db, store, retailOps)

  return nextSettings
}

export async function createDryCleaningServiceItem(
  db: DbClient,
  input: {
    category?: string | null
    description?: string | null
    estimatedTurnaroundHours?: number | null
    name: string
    priceMinor: number
    storeId: string
    tenantId: string
    variants?: Array<{
      name: string
      priceMinor: number
    }>
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  const now = new Date().toISOString()
  const retailOps = cloneJsonRecord(getRetailOpsMetadata(store.metadata))
  const items = getDryCleaningServiceItems(store.metadata)
  const serviceItem = {
    category: cleanText(input.category),
    createdAt: now,
    description: cleanText(input.description),
    estimatedTurnaroundHours:
      input.estimatedTurnaroundHours && input.estimatedTurnaroundHours > 0
        ? Math.trunc(input.estimatedTurnaroundHours)
        : null,
    id: createId("dc_service"),
    name: cleanText(input.name) ?? "Service",
    priceMinor: Math.max(0, Math.trunc(input.priceMinor)),
    status: "active",
    updatedAt: now,
    variants: (input.variants ?? []).map((variant) => ({
      id: createId("dc_variant"),
      name: cleanText(variant.name) ?? "Variant",
      priceMinor: Math.max(0, Math.trunc(variant.priceMinor)),
    })),
  } satisfies DryCleaningServiceItem
  const dryCleaning = buildDryCleaningMetadata({
    notificationIntents: getDryCleaningNotificationIntents(store.metadata),
    serviceItems: [serviceItem, ...items].slice(0, 500),
    serviceOrders: getDryCleaningServiceOrders(store.metadata),
    serviceRequestLinks: getDryCleaningRequestLinks(store.metadata),
    serviceRequests: getDryCleaningServiceRequests(store.metadata),
    settings: getDryCleaningSettings(store.metadata),
  })

  retailOps.dryCleaning = dryCleaning
  await updateStoreRetailOpsMetadata(db, store, retailOps)

  return serviceItem
}

export async function updateDryCleaningServiceItem(
  db: DbClient,
  input: {
    category?: string | null
    description?: string | null
    estimatedTurnaroundHours?: number | null
    name?: string | null
    priceMinor?: number | null
    serviceItemId: string
    status?: DryCleaningServiceItemStatus
    storeId: string
    tenantId: string
    variants?: Array<{
      id?: string | null
      name: string
      priceMinor: number
    }>
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  const items = getDryCleaningServiceItems(store.metadata)
  const existing = items.find((item) => item.id === input.serviceItemId)

  if (!existing) {
    throw new BusinessTemplateError(
      "SERVICE_ITEM_NOT_FOUND",
      "Service item not found.",
    )
  }

  const updatedItem = {
    ...existing,
    category:
      input.category === undefined
        ? existing.category
        : cleanText(input.category),
    description:
      input.description === undefined
        ? existing.description
        : cleanText(input.description),
    estimatedTurnaroundHours:
      input.estimatedTurnaroundHours === undefined
        ? existing.estimatedTurnaroundHours
        : input.estimatedTurnaroundHours && input.estimatedTurnaroundHours > 0
          ? Math.trunc(input.estimatedTurnaroundHours)
          : null,
    name: cleanText(input.name) ?? existing.name,
    priceMinor:
      input.priceMinor === undefined || input.priceMinor === null
        ? existing.priceMinor
        : Math.max(0, Math.trunc(input.priceMinor)),
    status: input.status ?? existing.status,
    updatedAt: new Date().toISOString(),
    variants:
      input.variants === undefined
        ? existing.variants
        : input.variants.map((variant) => ({
            id: cleanText(variant.id) ?? createId("dc_variant"),
            name: cleanText(variant.name) ?? "Variant",
            priceMinor: Math.max(0, Math.trunc(variant.priceMinor)),
          })),
  } satisfies DryCleaningServiceItem
  const retailOps = cloneJsonRecord(getRetailOpsMetadata(store.metadata))

  retailOps.dryCleaning = buildDryCleaningMetadata({
    notificationIntents: getDryCleaningNotificationIntents(store.metadata),
    serviceItems: items.map((item) =>
      item.id === updatedItem.id ? updatedItem : item,
    ),
    serviceOrders: getDryCleaningServiceOrders(store.metadata),
    serviceRequestLinks: getDryCleaningRequestLinks(store.metadata),
    serviceRequests: getDryCleaningServiceRequests(store.metadata),
    settings: getDryCleaningSettings(store.metadata),
  })
  await updateStoreRetailOpsMetadata(db, store, retailOps)

  return updatedItem
}

export async function createDryCleaningServiceOrder(
  db: DbClient,
  input: {
    actorUserId?: string | null
    customer: DryCleaningCustomerSnapshot
    dueAt?: Date | null
    evidence?: Array<{
      label?: string | null
      url: string
    }>
    lines: Array<{
      note?: string | null
      quantity: number
      serviceItemId: string
      unitPriceMinor?: number | null
      variantId?: string | null
    }>
    notes?: string | null
    paymentStatus?: DryCleaningPaymentStatus
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  const items = getDryCleaningServiceItems(store.metadata)
  const now = new Date().toISOString()
  const lines = buildServiceLines(items, input.lines)
  const order = buildOrder({
    actorUserId: input.actorUserId,
    createdAt: now,
    currencyCode: store.currencyCode,
    customer: {
      email: cleanText(input.customer.email),
      name: cleanText(input.customer.name) ?? "Walk-in customer",
      phone: cleanText(input.customer.phone),
    },
    dueAt: input.dueAt,
    evidence: input.evidence,
    lines,
    notes: input.notes,
    paymentStatus: input.paymentStatus,
    source: "walk_in",
  })
  const retailOps = cloneJsonRecord(getRetailOpsMetadata(store.metadata))

  retailOps.dryCleaning = buildDryCleaningMetadata({
    notificationIntents: getDryCleaningNotificationIntents(store.metadata),
    serviceItems: items,
    serviceOrders: [
      order,
      ...getDryCleaningServiceOrders(store.metadata),
    ].slice(0, 1_000),
    serviceRequestLinks: getDryCleaningRequestLinks(store.metadata),
    serviceRequests: getDryCleaningServiceRequests(store.metadata),
    settings: getDryCleaningSettings(store.metadata),
  })
  await updateStoreRetailOpsMetadata(db, store, retailOps)

  return order
}

export async function listDryCleaningServiceOrders(
  db: DbClient,
  input: {
    from?: Date
    limit?: number
    status?: DryCleaningServiceOrderStatus
    storeId: string
    tenantId: string
    to?: Date
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  return getDryCleaningServiceOrders(store.metadata)
    .filter((order) => {
      if (input.status && order.status !== input.status) return false
      const createdAt = new Date(order.createdAt)
      if (input.from && createdAt < input.from) return false
      if (input.to && createdAt > input.to) return false

      return true
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, input.limit ?? 50)
}

function buildNotificationIntent(input: {
  note?: string | null
  order: DryCleaningServiceOrder
  status: "delayed" | "ready"
  storeName: string
}) {
  const amount = `${input.order.currencyCode} ${(
    input.order.totalMinor / 100
  ).toLocaleString("en", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
  const expectation = input.order.dueAt
    ? ` Expected by ${new Date(input.order.dueAt).toLocaleString("en")}.`
    : ""
  const note = cleanText(input.note)
  const manualCopy =
    input.status === "ready"
      ? `${input.storeName}: ${input.order.customer.name}, your dry cleaning order is ready. Total: ${amount}. Tracking: ${input.order.trackingToken}.${expectation}`
      : `${input.storeName}: ${input.order.customer.name}, your dry cleaning order is delayed${note ? `: ${note}` : ""}. Total: ${amount}. Tracking: ${input.order.trackingToken}.${expectation}`

  return {
    channel: "manual",
    createdAt: new Date().toISOString(),
    customerPhone: input.order.customer.phone,
    id: createId("dc_notification"),
    manualCopy,
    orderId: input.order.id,
    status: "pending",
    type: input.status === "ready" ? "ready" : "delay",
  } satisfies DryCleaningNotificationIntent
}

export async function updateDryCleaningServiceOrderStatus(
  db: DbClient,
  input: {
    actorUserId?: string | null
    evidence?: Array<{
      label?: string | null
      url: string
    }>
    note?: string | null
    notifyCustomer?: boolean
    orderId: string
    status: DryCleaningServiceOrderStatus
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  const orders = getDryCleaningServiceOrders(store.metadata)
  const existing = orders.find((order) => order.id === input.orderId)

  if (!existing) {
    throw new BusinessTemplateError(
      "SERVICE_ORDER_NOT_FOUND",
      "Service order not found.",
    )
  }

  if (
    !DRY_CLEANING_STATUS_TRANSITIONS[existing.status].includes(input.status)
  ) {
    throw new BusinessTemplateError(
      "INVALID_STATUS_TRANSITION",
      `Cannot move service order from ${existing.status} to ${input.status}.`,
    )
  }

  const now = new Date().toISOString()
  const note = cleanText(input.note)
  const evidence = [
    ...existing.evidence,
    ...(input.evidence ?? []).flatMap((entry) => {
      const url = cleanText(entry.url)

      return url
        ? [
            {
              actorUserId: cleanText(input.actorUserId),
              addedAt: now,
              id: createId("dc_evidence"),
              label: cleanText(entry.label),
              url,
            },
          ]
        : []
    }),
  ].slice(-100)
  const updatedOrder = {
    ...existing,
    completedAt: input.status === "completed" ? now : existing.completedAt,
    evidence,
    events: [
      {
        actorUserId: cleanText(input.actorUserId),
        at: now,
        note,
        status: input.status,
        type: "status_changed",
      },
      ...existing.events,
    ].slice(0, 100),
    notes: note
      ? [
          {
            actorUserId: cleanText(input.actorUserId),
            at: now,
            text: note,
          },
          ...existing.notes,
        ].slice(0, 100)
      : existing.notes,
    status: input.status,
    updatedAt: now,
  } satisfies DryCleaningServiceOrder
  const existingNotifications = getDryCleaningNotificationIntents(
    store.metadata,
  )
  const notificationIntents =
    input.notifyCustomer &&
    (input.status === "ready" || input.status === "delayed")
      ? [
          buildNotificationIntent({
            note,
            order: updatedOrder,
            status: input.status,
            storeName: store.name,
          }),
          ...existingNotifications,
        ].slice(0, 500)
      : existingNotifications
  const retailOps = cloneJsonRecord(getRetailOpsMetadata(store.metadata))

  retailOps.dryCleaning = buildDryCleaningMetadata({
    notificationIntents,
    serviceItems: getDryCleaningServiceItems(store.metadata),
    serviceOrders: orders.map((order) =>
      order.id === updatedOrder.id ? updatedOrder : order,
    ),
    serviceRequestLinks: getDryCleaningRequestLinks(store.metadata),
    serviceRequests: getDryCleaningServiceRequests(store.metadata),
    settings: getDryCleaningSettings(store.metadata),
  })
  await updateStoreRetailOpsMetadata(db, store, retailOps)

  return {
    notificationIntent:
      notificationIntents[0]?.orderId === updatedOrder.id
        ? notificationIntents[0]
        : null,
    order: updatedOrder,
  }
}

export async function createDryCleaningServiceRequestLink(
  db: DbClient,
  input: {
    createdByUserId?: string | null
    label?: string | null
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  const link = {
    createdAt: new Date().toISOString(),
    createdByUserId: cleanText(input.createdByUserId),
    disabledAt: null,
    id: createId("dc_link"),
    label: cleanText(input.label) ?? "Service request link",
    token: createTrackingToken(),
  } satisfies DryCleaningServiceRequestLink
  const retailOps = cloneJsonRecord(getRetailOpsMetadata(store.metadata))

  retailOps.dryCleaning = buildDryCleaningMetadata({
    notificationIntents: getDryCleaningNotificationIntents(store.metadata),
    serviceItems: getDryCleaningServiceItems(store.metadata),
    serviceOrders: getDryCleaningServiceOrders(store.metadata),
    serviceRequestLinks: [
      link,
      ...getDryCleaningRequestLinks(store.metadata),
    ].slice(0, 100),
    serviceRequests: getDryCleaningServiceRequests(store.metadata),
    settings: getDryCleaningSettings(store.metadata),
  })
  await updateStoreRetailOpsMetadata(db, store, retailOps)

  return link
}

export async function listDryCleaningServiceRequestLinks(
  db: DbClient,
  input: {
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  return getDryCleaningRequestLinks(store.metadata).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )
}

async function findStoreByDryCleaningToken(
  db: DbClient,
  input: {
    token: string
  },
) {
  const stores = await db.store.findMany({
    select: {
      currencyCode: true,
      id: true,
      metadata: true,
      name: true,
      slug: true,
      supportEmail: true,
      supportPhone: true,
      tenantId: true,
    },
    take: 500,
    where: {
      status: { not: "ARCHIVED" },
    },
  })

  return (
    stores.find((store) => {
      const links = getDryCleaningRequestLinks(store.metadata)
      const orders = getDryCleaningServiceOrders(store.metadata)
      const requests = getDryCleaningServiceRequests(store.metadata)

      return (
        links.some((link) => link.token === input.token) ||
        orders.some((order) => order.trackingToken === input.token) ||
        requests.some((request) => request.trackingToken === input.token)
      )
    }) ?? null
  )
}

export async function resolveDryCleaningServiceRequestLink(
  db: DbClient,
  input: {
    token: string
  },
) {
  const store = await findStoreByDryCleaningToken(db, input)
  if (!store) {
    throw new BusinessTemplateError(
      "REQUEST_LINK_DISABLED",
      "Service request link is not available.",
    )
  }

  const link = getDryCleaningRequestLinks(store.metadata).find(
    (entry) => entry.token === input.token,
  )
  if (!link || link.disabledAt) {
    throw new BusinessTemplateError(
      "REQUEST_LINK_DISABLED",
      "Service request link is not available.",
    )
  }

  return {
    link,
    serviceItems: getDryCleaningServiceItems(store.metadata).filter(
      (item) => item.status === "active",
    ),
    store: {
      currencyCode: store.currencyCode,
      id: store.id,
      name: store.name,
      slug: store.slug,
      supportEmail: store.supportEmail,
      supportPhone: store.supportPhone,
      tenantId: store.tenantId,
    },
  }
}

export async function createDryCleaningPublicServiceRequest(
  db: DbClient,
  input: {
    customer: DryCleaningCustomerSnapshot
    lines: Array<{
      note?: string | null
      quantity: number
      serviceItemId: string
      variantId?: string | null
    }>
    notes?: string | null
    token: string
  },
) {
  const store = await findStoreByDryCleaningToken(db, input)
  if (!store) {
    throw new BusinessTemplateError(
      "REQUEST_LINK_DISABLED",
      "Service request link is not available.",
    )
  }
  const link = getDryCleaningRequestLinks(store.metadata).find(
    (entry) => entry.token === input.token,
  )
  if (!link || link.disabledAt) {
    throw new BusinessTemplateError(
      "REQUEST_LINK_DISABLED",
      "Service request link is not available.",
    )
  }

  assertDryCleaningTemplate(store.metadata)

  const now = new Date().toISOString()
  const lines = buildServiceLines(
    getDryCleaningServiceItems(store.metadata),
    input.lines,
  )
  const request = {
    convertedOrderId: null,
    createdAt: now,
    customer: {
      email: cleanText(input.customer.email),
      name: cleanText(input.customer.name) ?? "Customer",
      phone: cleanText(input.customer.phone),
    },
    id: createId("dc_request"),
    lines,
    notes: cleanText(input.notes),
    requestLinkId: link.id,
    status: "pending",
    totalMinor: lines.reduce((sum, line) => sum + line.totalPriceMinor, 0),
    trackingToken: createTrackingToken(),
    updatedAt: now,
  } satisfies DryCleaningServiceRequest
  const retailOps = cloneJsonRecord(getRetailOpsMetadata(store.metadata))

  retailOps.dryCleaning = buildDryCleaningMetadata({
    notificationIntents: getDryCleaningNotificationIntents(store.metadata),
    serviceItems: getDryCleaningServiceItems(store.metadata),
    serviceOrders: getDryCleaningServiceOrders(store.metadata),
    serviceRequestLinks: getDryCleaningRequestLinks(store.metadata),
    serviceRequests: [
      request,
      ...getDryCleaningServiceRequests(store.metadata),
    ].slice(0, 1_000),
    settings: getDryCleaningSettings(store.metadata),
  })
  await updateStoreRetailOpsMetadata(db, store, retailOps)

  return request
}

export async function listDryCleaningServiceRequests(
  db: DbClient,
  input: {
    limit?: number
    status?: DryCleaningServiceRequestStatus
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  return getDryCleaningServiceRequests(store.metadata)
    .filter((request) => !input.status || request.status === input.status)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, input.limit ?? 50)
}

export async function updateDryCleaningServiceRequestStatus(
  db: DbClient,
  input: {
    requestId: string
    status: Exclude<DryCleaningServiceRequestStatus, "converted">
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  const requests = getDryCleaningServiceRequests(store.metadata)
  const existing = requests.find((request) => request.id === input.requestId)
  if (!existing) {
    throw new BusinessTemplateError(
      "SERVICE_REQUEST_NOT_FOUND",
      "Service request not found.",
    )
  }

  const updated = {
    ...existing,
    status: input.status,
    updatedAt: new Date().toISOString(),
  } satisfies DryCleaningServiceRequest
  const retailOps = cloneJsonRecord(getRetailOpsMetadata(store.metadata))

  retailOps.dryCleaning = buildDryCleaningMetadata({
    notificationIntents: getDryCleaningNotificationIntents(store.metadata),
    serviceItems: getDryCleaningServiceItems(store.metadata),
    serviceOrders: getDryCleaningServiceOrders(store.metadata),
    serviceRequestLinks: getDryCleaningRequestLinks(store.metadata),
    serviceRequests: requests.map((request) =>
      request.id === updated.id ? updated : request,
    ),
    settings: getDryCleaningSettings(store.metadata),
  })
  await updateStoreRetailOpsMetadata(db, store, retailOps)

  return updated
}

export async function convertDryCleaningServiceRequestToOrder(
  db: DbClient,
  input: {
    actorUserId?: string | null
    paymentStatus?: DryCleaningPaymentStatus
    requestId: string
    storeId: string
    tenantId: string
  },
) {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  const requests = getDryCleaningServiceRequests(store.metadata)
  const existing = requests.find((request) => request.id === input.requestId)
  if (!existing) {
    throw new BusinessTemplateError(
      "SERVICE_REQUEST_NOT_FOUND",
      "Service request not found.",
    )
  }

  const now = new Date().toISOString()
  const order = buildOrder({
    actorUserId: input.actorUserId,
    createdAt: now,
    currencyCode: store.currencyCode,
    customer: existing.customer,
    lines: existing.lines,
    notes: existing.notes,
    paymentStatus: input.paymentStatus,
    source: "public_request",
  })
  const updatedRequest = {
    ...existing,
    convertedOrderId: order.id,
    status: "converted",
    updatedAt: now,
  } satisfies DryCleaningServiceRequest
  const retailOps = cloneJsonRecord(getRetailOpsMetadata(store.metadata))

  retailOps.dryCleaning = buildDryCleaningMetadata({
    notificationIntents: getDryCleaningNotificationIntents(store.metadata),
    serviceItems: getDryCleaningServiceItems(store.metadata),
    serviceOrders: [
      order,
      ...getDryCleaningServiceOrders(store.metadata),
    ].slice(0, 1_000),
    serviceRequestLinks: getDryCleaningRequestLinks(store.metadata),
    serviceRequests: requests.map((request) =>
      request.id === updatedRequest.id ? updatedRequest : request,
    ),
    settings: getDryCleaningSettings(store.metadata),
  })
  await updateStoreRetailOpsMetadata(db, store, retailOps)

  return {
    order,
    request: updatedRequest,
  }
}

export async function resolveDryCleaningTrackingToken(
  db: DbClient,
  input: {
    token: string
  },
) {
  const store = await findStoreByDryCleaningToken(db, input)
  if (!store) return null

  const order = getDryCleaningServiceOrders(store.metadata).find(
    (entry) => entry.trackingToken === input.token,
  )
  if (order) {
    return {
      kind: "service_order" as const,
      order: {
        createdAt: order.createdAt,
        customerName: order.customer.name,
        dueAt: order.dueAt,
        events: order.events,
        status: order.status,
        totalMinor: order.totalMinor,
        trackingToken: order.trackingToken,
      },
      store: {
        name: store.name,
        supportEmail: store.supportEmail,
        supportPhone: store.supportPhone,
      },
    }
  }

  const request = getDryCleaningServiceRequests(store.metadata).find(
    (entry) => entry.trackingToken === input.token,
  )
  if (!request) return null

  return {
    kind: "service_request" as const,
    request: {
      createdAt: request.createdAt,
      customerName: request.customer.name,
      status: request.status,
      totalMinor: request.totalMinor,
      trackingToken: request.trackingToken,
    },
    store: {
      name: store.name,
      supportEmail: store.supportEmail,
      supportPhone: store.supportPhone,
    },
  }
}

export async function getDryCleaningOperationalReport(
  db: DbClient,
  input: {
    from?: Date
    storeId: string
    tenantId: string
    to?: Date
  },
): Promise<DryCleaningOperationalReport> {
  const store = await getStoreOrThrow(db, input)
  assertDryCleaningTemplate(store.metadata)

  const orders = getDryCleaningServiceOrders(store.metadata).filter((order) => {
    const createdAt = new Date(order.createdAt)
    if (input.from && createdAt < input.from) return false
    if (input.to && createdAt > input.to) return false

    return true
  })
  const requests = getDryCleaningServiceRequests(store.metadata).filter(
    (request) => {
      const createdAt = new Date(request.createdAt)
      if (input.from && createdAt < input.from) return false
      if (input.to && createdAt > input.to) return false

      return true
    },
  )
  const statusCounts = Object.fromEntries(
    Object.keys(DRY_CLEANING_STATUS_TRANSITIONS).map((status) => [status, 0]),
  ) as Record<DryCleaningServiceOrderStatus, number>
  const paymentStatusCounts: Record<DryCleaningPaymentStatus, number> = {
    paid: 0,
    partial: 0,
    pay_on_collection: 0,
    pay_on_delivery: 0,
    unpaid: 0,
  }
  const services = new Map<
    string,
    {
      quantity: number
      serviceItemId: string
      serviceItemName: string
      totalMinor: number
    }
  >()
  let completionHoursTotal = 0
  let completionHoursCount = 0

  for (const order of orders) {
    statusCounts[order.status] += 1
    paymentStatusCounts[order.paymentStatus] += 1
    for (const line of order.lines) {
      const existing = services.get(line.serviceItemId) ?? {
        quantity: 0,
        serviceItemId: line.serviceItemId,
        serviceItemName: line.serviceItemName,
        totalMinor: 0,
      }
      existing.quantity += line.quantity
      existing.totalMinor += line.totalPriceMinor
      services.set(line.serviceItemId, existing)
    }
    if (order.completedAt) {
      const createdAt = new Date(order.createdAt).getTime()
      const completedAt = new Date(order.completedAt).getTime()
      if (completedAt >= createdAt) {
        completionHoursTotal += (completedAt - createdAt) / 3_600_000
        completionHoursCount += 1
      }
    }
  }

  const convertedRequestCount = requests.filter(
    (request) => request.status === "converted",
  ).length

  return {
    averageCompletionHours: completionHoursCount
      ? Math.round((completionHoursTotal / completionHoursCount) * 10) / 10
      : null,
    completedOrderCount: statusCounts.completed,
    delayedOrderCount: statusCounts.delayed,
    from: input.from?.toISOString() ?? null,
    orderCount: orders.length,
    paymentStatusCounts,
    popularServices: Array.from(services.values())
      .sort((left, right) => right.quantity - left.quantity)
      .slice(0, 10),
    requestConversionRate: requests.length
      ? Math.round((convertedRequestCount / requests.length) * 1000) / 10
      : null,
    requestCount: requests.length,
    revenueMinor: orders
      .filter((order) => order.status === "completed")
      .reduce((sum, order) => sum + order.totalMinor, 0),
    statusCounts,
    to: input.to?.toISOString() ?? null,
  }
}
