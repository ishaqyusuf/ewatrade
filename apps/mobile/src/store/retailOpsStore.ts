import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { zustandStorage } from "./mmkv"

export type RetailOpsVariant = {
  conversionMultiplier?: number
  currentStock?: number
  enabled?: boolean
  id: string
  imageLinks?: string[]
  imageUrl?: string
  name: string
  price: number
  remoteId?: string
  startingStock?: number
  variantLabel?: string
}

export type RetailOpsProduct = {
  businessId?: string
  currentStock: number
  description?: string
  imageLinks?: string[]
  id: string
  imageUrl?: string
  name: string
  price: number
  remoteId?: string
  remoteVariantId?: string
  startingStock: number
  syncStatus: "pending" | "synced"
  unitName: string
  variants: RetailOpsVariant[]
}

export type RetailOpsStockAdjustmentReason =
  | "correction"
  | "damage"
  | "found_stock"
  | "loss"

export type RetailOpsStockAdjustmentDirection = "decrease" | "increase"

export type RetailOpsPaymentMethod = "cash" | "transfer"

export type RetailOpsSale = {
  attendantName: string
  businessId?: string
  createdAt: string
  customerName: string
  id: string
  paymentMethod: RetailOpsPaymentMethod
  productId: string
  productName: string
  quantity: number
  remoteId?: string
  repSessionId?: string
  syncStatus: "pending" | "synced"
  total: number
  unitName: string
  unitPrice: number
  variantId?: string
}

export type RetailOpsCustomer = {
  businessId?: string
  id: string
  lastSeenAt: string
  name: string
  remoteId?: string
  saleCount: number
  syncStatus: "pending" | "synced"
}

export type RetailOpsStaffMember = {
  businessId?: string
  email: string
  id: string
  invitedAt: string
  name: string
  remoteId?: string
  role: "attendant"
  status: "pending" | "active" | "suspended"
  syncStatus: "pending" | "synced"
}

export type RetailOpsShareLink = {
  businessId?: string
  createdAt: string
  id: string
  orders: number
  productId: string
  productName: string
  remoteId?: string
  slug: string
  status: "active" | "inactive"
  syncStatus: "pending" | "synced"
  url: string
  views: number
}

export type RetailOpsStockMovement = {
  businessId?: string
  createdAt: string
  id: string
  note?: string
  productId: string
  productName: string
  quantity: number
  stockAdjustmentReason?: RetailOpsStockAdjustmentReason
  relatedMovementId?: string
  syncStatus: "pending" | "synced"
  syncGroupId?: string
  type:
    | "conversion_in"
    | "conversion_out"
    | "opening_stock"
    | "sale"
    | "stock_adjustment"
    | "stock_intake"
  unitName: string
  variantId?: string
}

export type RetailOpsCloseoutInventoryLine = {
  declaredQuantity: number
  expectedQuantity: number
  productId: string
  productName: string
  unitName: string
  variance: number
  variantId?: string
}

export type RetailOpsCloseout = {
  approvalStatus: "pending_review" | "approved" | "flagged"
  attendantName: string
  businessId?: string
  cashVariance: number
  createdAt: string
  declaredCash: number
  declaredTransfer: number
  expectedCash: number
  expectedTransfer: number
  grossSales: number
  id: string
  inventoryLines: RetailOpsCloseoutInventoryLine[]
  note?: string
  repSessionId?: string
  salesCount: number
  syncStatus: "pending" | "synced"
  transferVariance: number
}

export type RetailOpsRepSessionInventoryLine = {
  confirmedQuantity: number
  expectedQuantity: number
  productId: string
  productName: string
  unitName: string
  variance: number
  variantId?: string
}

export type RetailOpsRepSession = {
  attendantName: string
  businessId?: string
  clockedInAt: string
  clockedOutAt?: string
  hasOpeningVariance: boolean
  id: string
  note?: string
  openingInventoryLines: RetailOpsRepSessionInventoryLine[]
  remoteId?: string
  status: "open" | "closed"
  syncStatus: "pending" | "synced"
}

export type RetailOpsSyncEvent = {
  actorId?: string
  actorName?: string
  businessId?: string
  createdAt: string
  dependencies?: Array<{
    id: string
    kind:
      | "customer"
      | "product"
      | "rep_session"
      | "sale"
      | "share_link"
      | "staff"
      | "stock_movement"
      | "unit"
    remoteId?: string
  }>
  deviceId?: string
  entityId: string
  errorCode?: string
  errorMessage?: string
  failedAt?: string
  id: string
  label: string
  nextRetryAt?: string
  retryCount?: number
  storeId?: string
  status: "pending" | "synced" | "failed" | "conflict"
  updatedAt?: string
  type:
    | "closeout_created"
    | "customer_upsert"
    | "product_setup"
    | "rep_session_opened"
    | "sale_created"
    | "share_link_created"
    | "share_link_deactivated"
    | "stock_adjustment_recorded"
    | "stock_intake_recorded"
    | "staff_invited"
    | "unit_conversion_recorded"
}

export type RetailOpsSyncSummary = {
  appliedCount: number
  attemptedAt: string
  completedAt: string
  deviceId: string
  errorMessage?: string
  failedCount: number
  skippedCount: number
  status: "completed" | "failed" | "partial"
  totalCount: number
}

type FirstProductInput = {
  businessId?: string
  description?: string
  imageLinks?: string[]
  imageUrl?: string
  name: string
  price: number
  remoteId?: string
  remoteVariantId?: string
  startingStock: number
  syncStatus?: "pending" | "synced"
  unitName: string
  variants: Array<{
    currentStock?: number
    conversionMultiplier?: number
    enabled?: boolean
    imageLinks?: string[]
    imageUrl?: string
    name: string
    price: number
    remoteId?: string
    startingStock?: number
    variantLabel?: string
  }>
}

type CreateSaleInput = {
  attendantName: string
  businessId?: string
  customerName: string
  paymentMethod: RetailOpsPaymentMethod
  productId: string
  productName: string
  quantity: number
  remoteId?: string
  syncStatus?: "pending" | "synced"
  unitName: string
  unitPrice: number
  variantId?: string
}

type InviteStaffInput = {
  businessId?: string
  email: string
  name: string
}

type CreateShareLinkInput = {
  businessId?: string
  productId: string
  productName: string
}

type RecordStockIntakeInput = {
  businessId?: string
  note?: string
  productId: string
  quantity: number
  syncStatus?: "pending" | "synced"
  variantId?: string
}

type RecordStockAdjustmentInput = {
  businessId?: string
  direction: RetailOpsStockAdjustmentDirection
  note?: string
  productId: string
  quantity: number
  reason: RetailOpsStockAdjustmentReason
  syncStatus?: "pending" | "synced"
  variantId?: string
}

type RecordUnitConversionInput = {
  businessId?: string
  convertedAt?: string
  note?: string
  outputQuantity: number
  productId: string
  sourceQuantity: number
  sourceStockAfter?: number
  syncStatus?: "pending" | "synced"
  targetStockAfter?: number
  targetVariantId: string
}

type CreateCloseoutInput = {
  attendantName: string
  businessId?: string
  createdAt?: string
  declaredCash: number
  declaredTransfer: number
  inventoryLines: Array<{
    declaredQuantity: number
    expectedQuantity: number
    productId: string
    productName: string
    unitName: string
    variantId?: string
  }>
  note?: string
  syncStatus?: "pending" | "synced"
}

type ClockInRepSessionInput = {
  attendantName: string
  businessId?: string
  clockedInAt?: string
  openingInventoryLines: Array<{
    confirmedQuantity: number
    expectedQuantity: number
    productId: string
    productName: string
    unitName: string
    variantId?: string
  }>
  remoteId?: string
  note?: string
  syncStatus?: "pending" | "synced"
}

type RetailOpsState = {
  addFirstProduct: (input: FirstProductInput) => void
  clockInRepSession: (input: ClockInRepSessionInput) => void
  closeouts: RetailOpsCloseout[]
  createCloseout: (input: CreateCloseoutInput) => void
  createShareLink: (input: CreateShareLinkInput) => RetailOpsShareLink
  createSale: (input: CreateSaleInput) => void
  customers: RetailOpsCustomer[]
  deactivateShareLink: (id: string) => void
  hasHydrated: boolean
  inviteStaff: (input: InviteStaffInput) => void
  isOfflineMode: boolean
  lastSyncSummary?: RetailOpsSyncSummary
  markPendingEventsSynced: (businessId?: string) => void
  markSyncEventsResolved: (input: {
    businessId?: string
    failedEventIds?: string[]
    failedEvents?: Array<{
      errorCode?: string
      errorMessage?: string
      eventId: string
    }>
    customerMappings?: Array<{
      customerId: string
      eventId: string
    }>
    productMappings?: Array<{
      eventId: string
      productId: string
      units: Array<{
        id: string
        isDefault: boolean
        name: string
      }>
    }>
    repSessionMappings?: Array<{
      cashierSessionId: string
      eventId: string
    }>
    saleMappings?: Array<{
      eventId: string
      orderId: string
    }>
    staffMappings?: Array<{
      eventId: string
      membershipId: string
    }>
    shareLinkMappings?: Array<{
      active: boolean | null
      eventId: string
      shareLinkId: string
      url: string | null
    }>
    syncedEventIds?: string[]
  }) => void
  offlineDeviceId: string
  products: RetailOpsProduct[]
  repSessions: RetailOpsRepSession[]
  recordStockAdjustment: (input: RecordStockAdjustmentInput) => void
  recordStockIntake: (input: RecordStockIntakeInput) => void
  recordSyncSummary: (summary: RetailOpsSyncSummary) => void
  recordUnitConversion: (input: RecordUnitConversionInput) => void
  retrySyncEvents: (input: {
    businessId?: string
    eventIds?: string[]
  }) => void
  setOfflineMode: (isOfflineMode: boolean) => void
  sales: RetailOpsSale[]
  shareLinks: RetailOpsShareLink[]
  staff: RetailOpsStaffMember[]
  stockMovements: RetailOpsStockMovement[]
  syncEvents: RetailOpsSyncEvent[]
  resetProducts: () => void
  setHasHydrated: (hasHydrated: boolean) => void
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`
}

function resolveBusinessId(businessId?: string) {
  return businessId || "local-business"
}

function toNonNegativeWholeQuantity(value: number) {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0))
}

function createSyncEvent(
  type: RetailOpsSyncEvent["type"],
  label: string,
  entityId: string,
  businessId?: string,
  options: {
    actorName?: string
    dependencies?: RetailOpsSyncEvent["dependencies"]
    deviceId?: string
    storeId?: string
  } = {},
) {
  const now = new Date().toISOString()

  return {
    actorName: options.actorName,
    businessId,
    createdAt: now,
    dependencies: options.dependencies ?? [],
    deviceId: options.deviceId,
    entityId,
    id: createId("sync"),
    label,
    retryCount: 0,
    status: "pending",
    storeId: options.storeId,
    type,
    updatedAt: now,
  } satisfies RetailOpsSyncEvent
}

function compactDependencies(dependencies: RetailOpsSyncEvent["dependencies"]) {
  return dependencies?.filter((dependency) => !!dependency.id)
}

function getProductSyncDependencies(input: {
  productId?: string
  productRemoteId?: string
  unitId?: string
  unitRemoteId?: string
}) {
  const dependencies: RetailOpsSyncEvent["dependencies"] = []

  if (input.productId) {
    dependencies.push({
      id: input.productId,
      kind: "product",
      remoteId: input.productRemoteId,
    })
  }

  if (input.unitId) {
    dependencies.push({
      id: input.unitId,
      kind: "unit",
      remoteId: input.unitRemoteId,
    })
  }

  return compactDependencies(dependencies)
}

function createSlug(value: string) {
  const baseSlug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36)
  const token = Math.random().toString(36).slice(2, 8)

  return `${baseSlug || "product"}-${token}`
}

function getProductStock(product: RetailOpsProduct) {
  return toNonNegativeWholeQuantity(
    product.currentStock ?? product.startingStock ?? 0,
  )
}

function getVariantStock(variant: RetailOpsVariant) {
  return toNonNegativeWholeQuantity(
    variant.currentStock ?? variant.startingStock ?? 0,
  )
}

function stockAdjustmentReasonLabel(reason: RetailOpsStockAdjustmentReason) {
  if (reason === "damage") return "Damage"
  if (reason === "found_stock") return "Found stock"
  if (reason === "loss") return "Loss"

  return "Count correction"
}

export function normalizeStockAdjustmentDirection(input: {
  direction: RetailOpsStockAdjustmentDirection
  reason: RetailOpsStockAdjustmentReason
}) {
  if (input.reason === "damage" || input.reason === "loss") return "decrease"
  if (input.reason === "found_stock") return "increase"

  return input.direction
}

function getSalesAfterLastCloseout(
  sales: RetailOpsSale[],
  closeouts: RetailOpsCloseout[],
) {
  const latestCloseout = closeouts[0]

  if (!latestCloseout) return sales

  const latestCloseoutTime = new Date(latestCloseout.createdAt).getTime()

  if (Number.isNaN(latestCloseoutTime)) return sales

  return sales.filter((sale) => {
    const saleTime = new Date(sale.createdAt).getTime()

    return !Number.isNaN(saleTime) && saleTime > latestCloseoutTime
  })
}

function getPaymentTotals(sales: RetailOpsSale[]) {
  return sales.reduce(
    (totals, sale) => {
      if (sale.paymentMethod === "cash") {
        totals.cash += sale.total
      } else {
        totals.transfer += sale.total
      }

      totals.gross += sale.total

      return totals
    },
    {
      cash: 0,
      gross: 0,
      transfer: 0,
    },
  )
}

function isSyncConflictCode(errorCode?: string) {
  return errorCode === "CONFLICT"
}

function getNextRetryAt(retryCount = 0) {
  const retryDelaysMs = [30_000, 120_000, 300_000, 900_000]
  const delayMs =
    retryDelaysMs[Math.min(retryCount, retryDelaysMs.length - 1)] ??
    retryDelaysMs[retryDelaysMs.length - 1]

  return new Date(Date.now() + delayMs).toISOString()
}

export const useRetailOpsStore = create<RetailOpsState>()(
  persist(
    (set, get) => ({
      closeouts: [],
      customers: [],
      hasHydrated: false,
      isOfflineMode: false,
      lastSyncSummary: undefined,
      offlineDeviceId: createId("device"),
      products: [],
      repSessions: [],
      sales: [],
      shareLinks: [],
      staff: [],
      stockMovements: [],
      syncEvents: [],
      addFirstProduct: (input) =>
        set((state) => {
          const businessId = resolveBusinessId(input.businessId)
          const productId = createId("product")
          const stockMovementId = createId("stock")
          const syncStatus = input.syncStatus ?? "pending"
          const shouldQueueSync = syncStatus === "pending"
          const startingStock = toNonNegativeWholeQuantity(input.startingStock)

          return {
            products: [
              ...state.products,
              {
                businessId,
                currentStock: startingStock,
                description: input.description,
                imageLinks: input.imageLinks,
                id: productId,
                imageUrl: input.imageUrl,
                name: input.name,
                price: input.price,
                remoteId: input.remoteId,
                remoteVariantId: input.remoteVariantId,
                startingStock,
                syncStatus,
                unitName: input.unitName,
                variants: input.variants.map((variant) => {
                  const variantStartingStock = toNonNegativeWholeQuantity(
                    variant.startingStock ?? 0,
                  )
                  const variantCurrentStock = toNonNegativeWholeQuantity(
                    variant.currentStock ?? variantStartingStock,
                  )

                  return {
                    ...variant,
                    currentStock: variantCurrentStock,
                    id: createId("variant"),
                    startingStock: variantStartingStock,
                  }
                }),
              },
            ],
            stockMovements: [
              {
                businessId,
                createdAt: new Date().toISOString(),
                id: stockMovementId,
                note: "Opening stock",
                productId,
                productName: input.name,
                quantity: startingStock,
                syncStatus,
                type: "opening_stock",
                unitName: input.unitName,
              },
              ...state.stockMovements,
            ],
            syncEvents: shouldQueueSync
              ? [
                  createSyncEvent(
                    "product_setup",
                    `Product setup: ${input.name}`,
                    productId,
                    businessId,
                    {
                      dependencies: [],
                      deviceId: state.offlineDeviceId,
                    },
                  ),
                  ...state.syncEvents,
                ]
              : state.syncEvents,
          }
        }),
      clockInRepSession: (input) =>
        set((state) => {
          const businessId = resolveBusinessId(input.businessId)
          const syncStatus = input.syncStatus ?? "pending"
          const shouldQueueSync = syncStatus === "pending"
          const hasOpenSession = state.repSessions.some(
            (session) =>
              (session.businessId ?? businessId) === businessId &&
              session.status === "open" &&
              session.attendantName === input.attendantName,
          )

          if (hasOpenSession || input.openingInventoryLines.length === 0) {
            return state
          }

          const repSessionId = createId("session")
          const openingInventoryLines = input.openingInventoryLines.map(
            (line) => {
              const expectedQuantity = toNonNegativeWholeQuantity(
                line.expectedQuantity,
              )
              const confirmedQuantity = toNonNegativeWholeQuantity(
                line.confirmedQuantity,
              )

              return {
                ...line,
                confirmedQuantity,
                expectedQuantity,
                variance: confirmedQuantity - expectedQuantity,
              }
            },
          )
          const hasOpeningVariance = openingInventoryLines.some(
            (line) => line.variance !== 0,
          )

          return {
            repSessions: [
              {
                attendantName: input.attendantName,
                businessId,
                clockedInAt: input.clockedInAt ?? new Date().toISOString(),
                hasOpeningVariance,
                id: repSessionId,
                note: input.note?.trim() || undefined,
                openingInventoryLines,
                remoteId: input.remoteId,
                status: "open",
                syncStatus,
              },
              ...state.repSessions,
            ],
            syncEvents: shouldQueueSync
              ? [
                  createSyncEvent(
                    "rep_session_opened",
                    `Clock in: ${input.attendantName}`,
                    repSessionId,
                    businessId,
                    {
                      actorName: input.attendantName,
                      dependencies: openingInventoryLines.flatMap(
                        (line) =>
                          getProductSyncDependencies({
                            productId: line.productId,
                            unitId: line.variantId,
                          }) ?? [],
                      ),
                      deviceId: state.offlineDeviceId,
                    },
                  ),
                  ...state.syncEvents,
                ]
              : state.syncEvents,
          }
        }),
      createSale: (input) =>
        set((state) => {
          const now = new Date().toISOString()
          const syncStatus = input.syncStatus ?? "pending"
          const shouldQueueSync = syncStatus === "pending"
          const product = state.products.find(
            (currentProduct) => currentProduct.id === input.productId,
          )
          const businessId = resolveBusinessId(
            input.businessId ?? product?.businessId,
          )
          const customerName = input.customerName.trim()
          const saleId = createId("sale")
          const stockMovementId = createId("stock")
          const quantity = toNonNegativeWholeQuantity(input.quantity)
          const openSession = state.repSessions.find(
            (session) =>
              (session.businessId ?? businessId) === businessId &&
              session.status === "open" &&
              session.attendantName === input.attendantName,
          )

          if (!openSession || quantity <= 0) return state

          const existingCustomer = state.customers.find(
            (customer) =>
              (customer.businessId ?? businessId) === businessId &&
              customer.name.toLowerCase() === customerName.toLowerCase(),
          )
          const customerId = existingCustomer?.id ?? createId("customer")
          const nextCustomers =
            customerName && existingCustomer
              ? state.customers.map((customer) =>
                  customer.id === existingCustomer.id
                    ? {
                        ...customer,
                        businessId,
                        lastSeenAt: now,
                        saleCount: (customer.saleCount ?? 0) + 1,
                        syncStatus,
                      }
                    : customer,
                )
              : customerName
                ? [
                    {
                      id: customerId,
                      businessId,
                      lastSeenAt: now,
                      name: customerName,
                      saleCount: 1,
                      syncStatus,
                    },
                    ...state.customers,
                  ]
                : state.customers

          return {
            customers: nextCustomers,
            products: state.products.map((product) =>
              product.id === input.productId
                ? input.variantId
                  ? {
                      ...product,
                      syncStatus:
                        syncStatus === "synced"
                          ? product.syncStatus
                          : "pending",
                      variants: product.variants.map((variant) =>
                        variant.id === input.variantId
                          ? {
                              ...variant,
                              currentStock: Math.max(
                                0,
                                getVariantStock(variant) - quantity,
                              ),
                            }
                          : variant,
                      ),
                    }
                  : {
                      ...product,
                      currentStock: Math.max(
                        0,
                        getProductStock(product) - quantity,
                      ),
                      syncStatus:
                        syncStatus === "synced"
                          ? product.syncStatus
                          : "pending",
                    }
                : product,
            ),
            sales: [
              {
                createdAt: now,
                id: saleId,
                remoteId: input.remoteId,
                repSessionId: openSession.id,
                syncStatus,
                ...input,
                businessId,
                customerName: customerName || "Walk-in customer",
                quantity,
                total: input.unitPrice * quantity,
              },
              ...state.sales,
            ],
            stockMovements: [
              {
                businessId,
                createdAt: now,
                id: stockMovementId,
                productId: input.productId,
                productName: input.productName,
                quantity: -quantity,
                syncStatus,
                type: "sale",
                unitName: input.unitName,
                variantId: input.variantId,
              },
              ...state.stockMovements,
            ],
            syncEvents: shouldQueueSync
              ? [
                  createSyncEvent(
                    "sale_created",
                    `Sale: ${input.productName} ${input.unitName}`,
                    saleId,
                    businessId,
                    {
                      actorName: input.attendantName,
                      dependencies: [
                        ...(getProductSyncDependencies({
                          productId: input.productId,
                          productRemoteId: product?.remoteId,
                          unitId: input.variantId ?? input.productId,
                          unitRemoteId: input.variantId
                            ? product?.variants.find(
                                (variant) => variant.id === input.variantId,
                              )?.remoteId
                            : product?.remoteVariantId,
                        }) ?? []),
                        {
                          id: openSession.id,
                          kind: "rep_session",
                          remoteId: openSession.remoteId,
                        },
                        ...(customerName
                          ? [
                              {
                                id: customerId,
                                kind: "customer" as const,
                                remoteId: existingCustomer?.remoteId,
                              },
                            ]
                          : []),
                      ],
                      deviceId: state.offlineDeviceId,
                    },
                  ),
                  ...(customerName
                    ? [
                        createSyncEvent(
                          "customer_upsert",
                          `Customer: ${customerName}`,
                          customerId,
                          businessId,
                          {
                            actorName: input.attendantName,
                            dependencies: [
                              {
                                id: saleId,
                                kind: "sale",
                              },
                            ],
                            deviceId: state.offlineDeviceId,
                          },
                        ),
                      ]
                    : []),
                  ...state.syncEvents,
                ]
              : state.syncEvents,
          }
        }),
      createCloseout: (input) =>
        set((state) => {
          const now = input.createdAt ?? new Date().toISOString()
          const syncStatus = input.syncStatus ?? "pending"
          const shouldQueueSync = syncStatus === "pending"
          const businessId = resolveBusinessId(input.businessId)
          const closeoutId = createId("closeout")
          const openSales = getSalesAfterLastCloseout(
            state.sales.filter(
              (sale) => (sale.businessId ?? businessId) === businessId,
            ),
            state.closeouts.filter(
              (closeout) => (closeout.businessId ?? businessId) === businessId,
            ),
          )
          const paymentTotals = getPaymentTotals(openSales)
          const declaredCash = Math.max(0, input.declaredCash)
          const declaredTransfer = Math.max(0, input.declaredTransfer)
          const openSession = state.repSessions.find(
            (session) =>
              (session.businessId ?? businessId) === businessId &&
              session.status === "open" &&
              session.attendantName === input.attendantName,
          )
          const inventoryLines = input.inventoryLines.map((line) => {
            const declaredQuantity = toNonNegativeWholeQuantity(
              line.declaredQuantity,
            )
            const expectedQuantity = toNonNegativeWholeQuantity(
              line.expectedQuantity,
            )

            return {
              ...line,
              declaredQuantity,
              expectedQuantity,
              variance: declaredQuantity - expectedQuantity,
            }
          })

          return {
            closeouts: [
              {
                approvalStatus: "pending_review",
                attendantName: input.attendantName,
                businessId,
                cashVariance: declaredCash - paymentTotals.cash,
                createdAt: now,
                declaredCash,
                declaredTransfer,
                expectedCash: paymentTotals.cash,
                expectedTransfer: paymentTotals.transfer,
                grossSales: paymentTotals.gross,
                id: closeoutId,
                inventoryLines,
                note: input.note?.trim() || undefined,
                repSessionId: openSession?.id,
                salesCount: openSales.length,
                syncStatus,
                transferVariance: declaredTransfer - paymentTotals.transfer,
              },
              ...state.closeouts,
            ],
            repSessions: state.repSessions.map((session) =>
              session.id === openSession?.id
                ? {
                    ...session,
                    clockedOutAt: now,
                    status: "closed",
                    syncStatus: syncStatus === "synced" ? "synced" : "pending",
                  }
                : session,
            ),
            syncEvents: shouldQueueSync
              ? [
                  createSyncEvent(
                    "closeout_created",
                    `Closeout: ${openSales.length} sale${
                      openSales.length === 1 ? "" : "s"
                    }`,
                    closeoutId,
                    businessId,
                    {
                      actorName: input.attendantName,
                      dependencies: [
                        ...(openSession
                          ? [
                              {
                                id: openSession.id,
                                kind: "rep_session" as const,
                                remoteId: openSession.remoteId,
                              },
                            ]
                          : []),
                        ...openSales.map((sale) => ({
                          id: sale.id,
                          kind: "sale" as const,
                          remoteId: sale.remoteId,
                        })),
                        ...inventoryLines.flatMap(
                          (line) =>
                            getProductSyncDependencies({
                              productId: line.productId,
                              unitId: line.variantId,
                            }) ?? [],
                        ),
                      ],
                      deviceId: state.offlineDeviceId,
                    },
                  ),
                  ...state.syncEvents,
                ]
              : state.syncEvents,
          }
        }),
      createShareLink: (input) => {
        const product = get().products.find(
          (currentProduct) => currentProduct.id === input.productId,
        )
        const businessId = resolveBusinessId(
          input.businessId ?? product?.businessId,
        )
        const slug = createSlug(input.productName)
        const shareLinkId = createId("share")
        const shareLink = {
          businessId,
          createdAt: new Date().toISOString(),
          id: shareLinkId,
          orders: 0,
          productId: input.productId,
          productName: input.productName,
          slug,
          status: "active",
          syncStatus: "pending",
          url: `https://storefront.ewatrade.com/products/${slug}`,
          views: 0,
        } satisfies RetailOpsShareLink

        set((state) => ({
          shareLinks: [shareLink, ...state.shareLinks],
          syncEvents: [
            createSyncEvent(
              "share_link_created",
              `Share link: ${input.productName}`,
              shareLinkId,
              businessId,
              {
                dependencies: [
                  {
                    id: input.productId,
                    kind: "product",
                    remoteId: product?.remoteId,
                  },
                ],
                deviceId: get().offlineDeviceId,
              },
            ),
            ...state.syncEvents,
          ],
        }))

        return shareLink
      },
      deactivateShareLink: (id) =>
        set((state) => ({
          shareLinks: state.shareLinks.map((shareLink) =>
            shareLink.id === id
              ? {
                  ...shareLink,
                  status: "inactive",
                  syncStatus: "pending",
                }
              : shareLink,
          ),
          syncEvents: [
            createSyncEvent(
              "share_link_deactivated",
              "Deactivate link",
              id,
              state.shareLinks.find((shareLink) => shareLink.id === id)
                ?.businessId,
              {
                dependencies: [
                  {
                    id,
                    kind: "share_link",
                    remoteId: state.shareLinks.find(
                      (shareLink) => shareLink.id === id,
                    )?.remoteId,
                  },
                ],
                deviceId: state.offlineDeviceId,
              },
            ),
            ...state.syncEvents,
          ],
        })),
      inviteStaff: (input) =>
        set((state) => {
          const businessId = resolveBusinessId(input.businessId)
          const email = input.email.trim().toLowerCase()
          const name = input.name.trim()
          const existingBusinessStaff = state.staff.find(
            (staffMember) =>
              (staffMember.businessId ?? businessId) === businessId &&
              staffMember.email.toLowerCase() === email,
          )

          if (existingBusinessStaff) {
            return {
              staff: state.staff.map((staffMember) =>
                staffMember.id === existingBusinessStaff.id
                  ? {
                      ...staffMember,
                      businessId,
                      name: name || staffMember.name,
                      status: "pending",
                      syncStatus: "pending",
                    }
                  : staffMember,
              ),
              syncEvents: [
                createSyncEvent(
                  "staff_invited",
                  `Staff invite: ${email}`,
                  existingBusinessStaff.id,
                  businessId,
                  {
                    dependencies: [
                      {
                        id: existingBusinessStaff.id,
                        kind: "staff",
                        remoteId: existingBusinessStaff.remoteId,
                      },
                    ],
                    deviceId: state.offlineDeviceId,
                  },
                ),
                ...state.syncEvents,
              ],
            }
          }
          const staffId = createId("staff")

          return {
            staff: [
              {
                email,
                businessId,
                id: staffId,
                invitedAt: new Date().toISOString(),
                name: name || email,
                role: "attendant",
                status: "pending",
                syncStatus: "pending",
              },
              ...state.staff,
            ],
            syncEvents: [
              createSyncEvent(
                "staff_invited",
                `Staff invite: ${email}`,
                staffId,
                businessId,
                {
                  dependencies: [
                    {
                      id: staffId,
                      kind: "staff",
                    },
                  ],
                  deviceId: state.offlineDeviceId,
                },
              ),
              ...state.syncEvents,
            ],
          }
        }),
      markPendingEventsSynced: (businessId) =>
        set((state) => ({
          closeouts: state.closeouts.map((closeout) =>
            !businessId || (closeout.businessId ?? businessId) === businessId
              ? {
                  ...closeout,
                  syncStatus: "synced",
                }
              : closeout,
          ),
          customers: state.customers.map((customer) =>
            !businessId || (customer.businessId ?? businessId) === businessId
              ? {
                  ...customer,
                  syncStatus: "synced",
                }
              : customer,
          ),
          products: state.products.map((product) =>
            !businessId || (product.businessId ?? businessId) === businessId
              ? {
                  ...product,
                  syncStatus: "synced",
                }
              : product,
          ),
          repSessions: state.repSessions.map((session) =>
            !businessId || (session.businessId ?? businessId) === businessId
              ? {
                  ...session,
                  syncStatus: "synced",
                }
              : session,
          ),
          sales: state.sales.map((sale) =>
            !businessId || (sale.businessId ?? businessId) === businessId
              ? {
                  ...sale,
                  syncStatus: "synced",
                }
              : sale,
          ),
          shareLinks: state.shareLinks.map((shareLink) =>
            !businessId || (shareLink.businessId ?? businessId) === businessId
              ? {
                  ...shareLink,
                  syncStatus: "synced",
                }
              : shareLink,
          ),
          staff: state.staff.map((staffMember) =>
            !businessId || (staffMember.businessId ?? businessId) === businessId
              ? {
                  ...staffMember,
                  syncStatus: "synced",
                }
              : staffMember,
          ),
          stockMovements: state.stockMovements.map((movement) =>
            !businessId || (movement.businessId ?? businessId) === businessId
              ? {
                  ...movement,
                  syncStatus: "synced",
                }
              : movement,
          ),
          syncEvents: state.syncEvents.map((event) =>
            event.status === "pending" &&
            (!businessId || (event.businessId ?? businessId) === businessId)
              ? {
                  ...event,
                  status: "synced",
                  updatedAt: new Date().toISOString(),
                }
              : event,
          ),
        })),
      markSyncEventsResolved: (input) =>
        set((state) => {
          const syncedEventIds = new Set(input.syncedEventIds ?? [])
          const failedEventIds = new Set([
            ...(input.failedEventIds ?? []),
            ...(input.failedEvents ?? []).map((event) => event.eventId),
          ])
          const failedEventsById = new Map(
            (input.failedEvents ?? []).map((event) => [event.eventId, event]),
          )
          const syncedEntityIds = new Set(
            state.syncEvents
              .filter((event) => syncedEventIds.has(event.id))
              .map((event) => event.entityId),
          )
          const syncedCloseoutRepSessionIds = new Set(
            state.closeouts
              .filter(
                (closeout) =>
                  syncedEntityIds.has(closeout.id) && closeout.repSessionId,
              )
              .map((closeout) => closeout.repSessionId as string),
          )
          const customerMappingsByLocalId = new Map(
            (input.customerMappings ?? []).flatMap((mapping) => {
              const event = state.syncEvents.find(
                (currentEvent) => currentEvent.id === mapping.eventId,
              )

              return event ? [[event.entityId, mapping]] : []
            }),
          )
          const productMappingsByLocalId = new Map(
            (input.productMappings ?? []).flatMap((mapping) => {
              const event = state.syncEvents.find(
                (currentEvent) => currentEvent.id === mapping.eventId,
              )

              return event ? [[event.entityId, mapping]] : []
            }),
          )
          const repSessionMappingsByLocalId = new Map(
            (input.repSessionMappings ?? []).flatMap((mapping) => {
              const event = state.syncEvents.find(
                (currentEvent) => currentEvent.id === mapping.eventId,
              )

              return event ? [[event.entityId, mapping]] : []
            }),
          )
          const saleMappingsByLocalId = new Map(
            (input.saleMappings ?? []).flatMap((mapping) => {
              const event = state.syncEvents.find(
                (currentEvent) => currentEvent.id === mapping.eventId,
              )

              return event ? [[event.entityId, mapping]] : []
            }),
          )
          const staffMappingsByLocalId = new Map(
            (input.staffMappings ?? []).flatMap((mapping) => {
              const event = state.syncEvents.find(
                (currentEvent) => currentEvent.id === mapping.eventId,
              )

              return event ? [[event.entityId, mapping]] : []
            }),
          )
          const shareLinkMappingsByLocalId = new Map(
            (input.shareLinkMappings ?? []).flatMap((mapping) => {
              const event = state.syncEvents.find(
                (currentEvent) => currentEvent.id === mapping.eventId,
              )

              return event ? [[event.entityId, mapping]] : []
            }),
          )
          const matchesBusiness = (businessId?: string) =>
            !input.businessId ||
            (businessId ?? input.businessId) === input.businessId

          return {
            closeouts: state.closeouts.map((closeout) =>
              syncedEntityIds.has(closeout.id) &&
              matchesBusiness(closeout.businessId)
                ? {
                    ...closeout,
                    syncStatus: "synced",
                  }
                : closeout,
            ),
            products: state.products.map((product) => {
              const mapping = productMappingsByLocalId.get(product.id)

              if (!mapping || !matchesBusiness(product.businessId)) {
                return product
              }

              const defaultUnit = mapping.units.find((unit) => unit.isDefault)

              return {
                ...product,
                remoteId: mapping.productId,
                remoteVariantId: defaultUnit?.id ?? product.remoteVariantId,
                syncStatus: "synced",
                variants: product.variants.map((variant) => {
                  const remoteUnit = mapping.units.find(
                    (unit) =>
                      !unit.isDefault &&
                      unit.name.trim().toLowerCase() ===
                        variant.name.trim().toLowerCase(),
                  )

                  return remoteUnit
                    ? {
                        ...variant,
                        remoteId: remoteUnit.id,
                      }
                    : variant
                }),
              }
            }),
            customers: state.customers.map((customer) => {
              const mapping = customerMappingsByLocalId.get(customer.id)

              return syncedEntityIds.has(customer.id) &&
                matchesBusiness(customer.businessId)
                ? {
                    ...customer,
                    remoteId: mapping?.customerId ?? customer.remoteId,
                    syncStatus: "synced",
                  }
                : customer
            }),
            sales: state.sales.map((sale) => {
              const mapping = saleMappingsByLocalId.get(sale.id)

              return syncedEntityIds.has(sale.id) &&
                matchesBusiness(sale.businessId)
                ? {
                    ...sale,
                    remoteId: mapping?.orderId ?? sale.remoteId,
                    syncStatus: "synced",
                  }
                : sale
            }),
            repSessions: state.repSessions.map((session) => {
              const mapping = repSessionMappingsByLocalId.get(session.id)

              return (syncedEntityIds.has(session.id) ||
                syncedCloseoutRepSessionIds.has(session.id)) &&
                matchesBusiness(session.businessId)
                ? {
                    ...session,
                    remoteId: mapping?.cashierSessionId ?? session.remoteId,
                    syncStatus: "synced",
                  }
                : session
            }),
            staff: state.staff.map((staffMember) => {
              const mapping = staffMappingsByLocalId.get(staffMember.id)

              return syncedEntityIds.has(staffMember.id) &&
                matchesBusiness(staffMember.businessId)
                ? {
                    ...staffMember,
                    remoteId: mapping?.membershipId ?? staffMember.remoteId,
                    syncStatus: "synced",
                  }
                : staffMember
            }),
            shareLinks: state.shareLinks.map((shareLink) => {
              const mapping = shareLinkMappingsByLocalId.get(shareLink.id)

              return syncedEntityIds.has(shareLink.id) &&
                matchesBusiness(shareLink.businessId)
                ? {
                    ...shareLink,
                    remoteId: mapping?.shareLinkId ?? shareLink.remoteId,
                    status:
                      mapping?.active === false ? "inactive" : shareLink.status,
                    syncStatus: "synced",
                    url: mapping?.url ?? shareLink.url,
                  }
                : shareLink
            }),
            stockMovements: state.stockMovements.map((movement) =>
              matchesBusiness(movement.businessId) &&
              (syncedEntityIds.has(movement.id) ||
                (movement.syncGroupId
                  ? syncedEntityIds.has(movement.syncGroupId)
                  : false))
                ? {
                    ...movement,
                    syncStatus: "synced",
                  }
                : movement,
            ),
            syncEvents: state.syncEvents.map((event) =>
              syncedEventIds.has(event.id) && matchesBusiness(event.businessId)
                ? {
                    ...event,
                    errorCode: undefined,
                    errorMessage: undefined,
                    failedAt: undefined,
                    nextRetryAt: undefined,
                    status: "synced",
                    updatedAt: new Date().toISOString(),
                  }
                : failedEventIds.has(event.id) &&
                    matchesBusiness(event.businessId)
                  ? {
                      ...event,
                      errorCode: failedEventsById.get(event.id)?.errorCode,
                      errorMessage:
                        failedEventsById.get(event.id)?.errorMessage ??
                        "This event could not sync. Review the details and retry.",
                      failedAt: new Date().toISOString(),
                      nextRetryAt: isSyncConflictCode(
                        failedEventsById.get(event.id)?.errorCode,
                      )
                        ? undefined
                        : getNextRetryAt(event.retryCount ?? 0),
                      status: isSyncConflictCode(
                        failedEventsById.get(event.id)?.errorCode,
                      )
                        ? "conflict"
                        : "failed",
                      updatedAt: new Date().toISOString(),
                    }
                  : event,
            ),
          }
        }),
      retrySyncEvents: (input) =>
        set((state) => {
          const eventIds = input.eventIds ? new Set(input.eventIds) : null
          const matchesBusiness = (businessId?: string) =>
            !input.businessId ||
            (businessId ?? input.businessId) === input.businessId

          return {
            syncEvents: state.syncEvents.map((event) =>
              (event.status === "failed" || event.status === "conflict") &&
              matchesBusiness(event.businessId) &&
              (!eventIds || eventIds.has(event.id))
                ? {
                    ...event,
                    errorCode: undefined,
                    errorMessage: undefined,
                    failedAt: undefined,
                    nextRetryAt: undefined,
                    retryCount: (event.retryCount ?? 0) + 1,
                    status: "pending",
                    updatedAt: new Date().toISOString(),
                  }
                : event,
            ),
          }
        }),
      recordStockIntake: (input) =>
        set((state) => {
          const syncStatus = input.syncStatus ?? "pending"
          const shouldQueueSync = syncStatus === "pending"
          const product = state.products.find(
            (currentProduct) => currentProduct.id === input.productId,
          )
          const targetVariant = input.variantId
            ? product?.variants.find(
                (variant) => variant.id === input.variantId,
              )
            : null

          if (!product || (input.variantId && !targetVariant)) return state

          const businessId = resolveBusinessId(
            input.businessId ?? product.businessId,
          )
          const stockMovementId = createId("stock")
          const quantity = toNonNegativeWholeQuantity(input.quantity)
          const unitName = targetVariant?.name ?? product.unitName

          if (quantity <= 0) return state

          return {
            products: state.products.map((currentProduct) =>
              currentProduct.id === input.productId
                ? {
                    ...currentProduct,
                    currentStock: targetVariant
                      ? currentProduct.currentStock
                      : getProductStock(currentProduct) + quantity,
                    syncStatus:
                      syncStatus === "synced"
                        ? currentProduct.syncStatus
                        : "pending",
                    variants: currentProduct.variants.map((variant) =>
                      variant.id === targetVariant?.id
                        ? {
                            ...variant,
                            currentStock: getVariantStock(variant) + quantity,
                          }
                        : variant,
                    ),
                  }
                : currentProduct,
            ),
            stockMovements: [
              {
                businessId,
                createdAt: new Date().toISOString(),
                id: stockMovementId,
                note: input.note?.trim() || "Stock intake",
                productId: product.id,
                productName: product.name,
                quantity,
                syncStatus,
                type: "stock_intake",
                unitName,
                variantId: targetVariant?.id,
              },
              ...state.stockMovements,
            ],
            syncEvents: shouldQueueSync
              ? [
                  createSyncEvent(
                    "stock_intake_recorded",
                    `Stock intake: ${product.name}`,
                    stockMovementId,
                    businessId,
                    {
                      dependencies: getProductSyncDependencies({
                        productId: product.id,
                        productRemoteId: product.remoteId,
                        unitId: targetVariant?.id ?? product.id,
                        unitRemoteId:
                          targetVariant?.remoteId ?? product.remoteVariantId,
                      }),
                      deviceId: state.offlineDeviceId,
                    },
                  ),
                  ...state.syncEvents,
                ]
              : state.syncEvents,
          }
        }),
      recordStockAdjustment: (input) =>
        set((state) => {
          const syncStatus = input.syncStatus ?? "pending"
          const shouldQueueSync = syncStatus === "pending"
          const product = state.products.find(
            (currentProduct) => currentProduct.id === input.productId,
          )
          const targetVariant = input.variantId
            ? product?.variants.find(
                (variant) => variant.id === input.variantId,
              )
            : null

          if (!product || (input.variantId && !targetVariant)) return state

          const quantity = toNonNegativeWholeQuantity(input.quantity)
          const normalizedDirection = normalizeStockAdjustmentDirection({
            direction: input.direction,
            reason: input.reason,
          })
          const currentStock = targetVariant
            ? getVariantStock(targetVariant)
            : getProductStock(product)

          if (
            quantity <= 0 ||
            (normalizedDirection === "decrease" && quantity > currentStock)
          ) {
            return state
          }

          const businessId = resolveBusinessId(
            input.businessId ?? product.businessId,
          )
          const stockMovementId = createId("stock")
          const signedQuantity =
            normalizedDirection === "increase" ? quantity : -quantity
          const reasonLabel = stockAdjustmentReasonLabel(input.reason)
          const unitName = targetVariant?.name ?? product.unitName
          const note = input.note?.trim() || reasonLabel

          return {
            products: state.products.map((currentProduct) =>
              currentProduct.id === input.productId
                ? {
                    ...currentProduct,
                    currentStock: targetVariant
                      ? currentProduct.currentStock
                      : getProductStock(currentProduct) + signedQuantity,
                    syncStatus:
                      syncStatus === "synced"
                        ? currentProduct.syncStatus
                        : "pending",
                    variants: currentProduct.variants.map((variant) =>
                      variant.id === targetVariant?.id
                        ? {
                            ...variant,
                            currentStock:
                              getVariantStock(variant) + signedQuantity,
                          }
                        : variant,
                    ),
                  }
                : currentProduct,
            ),
            stockMovements: [
              {
                businessId,
                createdAt: new Date().toISOString(),
                id: stockMovementId,
                note,
                productId: product.id,
                productName: product.name,
                quantity: signedQuantity,
                stockAdjustmentReason: input.reason,
                syncStatus,
                type: "stock_adjustment",
                unitName,
                variantId: targetVariant?.id,
              },
              ...state.stockMovements,
            ],
            syncEvents: shouldQueueSync
              ? [
                  createSyncEvent(
                    "stock_adjustment_recorded",
                    `Stock adjustment: ${product.name}`,
                    stockMovementId,
                    businessId,
                    {
                      dependencies: getProductSyncDependencies({
                        productId: product.id,
                        productRemoteId: product.remoteId,
                        unitId: targetVariant?.id ?? product.id,
                        unitRemoteId:
                          targetVariant?.remoteId ?? product.remoteVariantId,
                      }),
                      deviceId: state.offlineDeviceId,
                    },
                  ),
                  ...state.syncEvents,
                ]
              : state.syncEvents,
          }
        }),
      recordSyncSummary: (summary) => set({ lastSyncSummary: summary }),
      recordUnitConversion: (input) =>
        set((state) => {
          const syncStatus = input.syncStatus ?? "pending"
          const shouldQueueSync = syncStatus === "pending"
          const product = state.products.find(
            (currentProduct) => currentProduct.id === input.productId,
          )
          const targetVariant = product?.variants.find(
            (variant) => variant.id === input.targetVariantId,
          )

          if (!product || !targetVariant) return state

          const businessId = resolveBusinessId(
            input.businessId ?? product.businessId,
          )
          const sourceQuantity = toNonNegativeWholeQuantity(
            input.sourceQuantity,
          )
          const outputQuantity = toNonNegativeWholeQuantity(
            input.outputQuantity,
          )
          const sourceStock = getProductStock(product)

          if (
            sourceQuantity <= 0 ||
            outputQuantity <= 0 ||
            sourceQuantity > sourceStock
          ) {
            return state
          }

          const now = input.convertedAt ?? new Date().toISOString()
          const conversionId = createId("conversion")
          const conversionOutId = createId("stock")
          const conversionInId = createId("stock")
          const note =
            input.note?.trim() ||
            `Converted ${sourceQuantity} ${product.unitName} to ${outputQuantity} ${targetVariant.name}`

          return {
            products: state.products.map((currentProduct) =>
              currentProduct.id === product.id
                ? {
                    ...currentProduct,
                    currentStock:
                      input.sourceStockAfter ??
                      getProductStock(currentProduct) - sourceQuantity,
                    syncStatus:
                      syncStatus === "synced"
                        ? currentProduct.syncStatus
                        : "pending",
                    variants: currentProduct.variants.map((variant) =>
                      variant.id === targetVariant.id
                        ? {
                            ...variant,
                            currentStock:
                              input.targetStockAfter ??
                              getVariantStock(variant) + outputQuantity,
                          }
                        : variant,
                    ),
                  }
                : currentProduct,
            ),
            stockMovements: [
              {
                businessId,
                createdAt: now,
                id: conversionInId,
                note,
                productId: product.id,
                productName: product.name,
                quantity: outputQuantity,
                relatedMovementId: conversionOutId,
                syncStatus,
                syncGroupId: conversionId,
                type: "conversion_in",
                unitName: targetVariant.name,
                variantId: targetVariant.id,
              },
              {
                businessId,
                createdAt: now,
                id: conversionOutId,
                note,
                productId: product.id,
                productName: product.name,
                quantity: -sourceQuantity,
                relatedMovementId: conversionInId,
                syncStatus,
                syncGroupId: conversionId,
                type: "conversion_out",
                unitName: product.unitName,
              },
              ...state.stockMovements,
            ],
            syncEvents: shouldQueueSync
              ? [
                  createSyncEvent(
                    "unit_conversion_recorded",
                    `Unit conversion: ${product.name}`,
                    conversionId,
                    businessId,
                    {
                      dependencies: [
                        ...(getProductSyncDependencies({
                          productId: product.id,
                          productRemoteId: product.remoteId,
                          unitId: product.id,
                          unitRemoteId: product.remoteVariantId,
                        }) ?? []),
                        ...(getProductSyncDependencies({
                          productId: product.id,
                          productRemoteId: product.remoteId,
                          unitId: targetVariant.id,
                          unitRemoteId: targetVariant.remoteId,
                        }) ?? []),
                      ],
                      deviceId: state.offlineDeviceId,
                    },
                  ),
                  ...state.syncEvents,
                ]
              : state.syncEvents,
          }
        }),
      resetProducts: () => set({ products: [] }),
      setOfflineMode: (isOfflineMode) => set({ isOfflineMode }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "ewatrade-mobile-retail-ops",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        closeouts: state.closeouts,
        customers: state.customers,
        isOfflineMode: state.isOfflineMode,
        lastSyncSummary: state.lastSyncSummary,
        offlineDeviceId: state.offlineDeviceId,
        products: state.products,
        repSessions: state.repSessions,
        sales: state.sales,
        shareLinks: state.shareLinks,
        staff: state.staff,
        stockMovements: state.stockMovements,
        syncEvents: state.syncEvents,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
