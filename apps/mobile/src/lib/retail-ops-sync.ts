import type {
  RetailOpsCloseout,
  RetailOpsCustomer,
  RetailOpsProduct,
  RetailOpsRepSession,
  RetailOpsSale,
  RetailOpsShareLink,
  RetailOpsStaffMember,
  RetailOpsStockMovement,
  RetailOpsSyncEvent,
} from "@/store/retailOpsStore"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"

type RetailOpsSyncEventsInput = RouterInputs["retailOps"]["syncEvents"]
type RetailOpsSyncEventsOutput = RouterOutputs["retailOps"]["syncEvents"]
type RetailOpsSyncEventInput = RetailOpsSyncEventsInput["events"][number]
type RetailOpsProductSetupSyncEventInput = Extract<
  RetailOpsSyncEventInput,
  { type: "product_setup" }
>
type RetailOpsCloseoutSyncEventInput = Extract<
  RetailOpsSyncEventInput,
  { type: "closeout_created" }
>
type RetailOpsCustomerUpsertSyncEventInput = Extract<
  RetailOpsSyncEventInput,
  { type: "customer_upsert" }
>
type RetailOpsRepSessionOpenSyncEventInput = Extract<
  RetailOpsSyncEventInput,
  { type: "rep_session_opened" }
>
type RetailOpsStaffInviteSyncEventInput = Extract<
  RetailOpsSyncEventInput,
  { type: "staff_invited" }
>
type RetailOpsSaleSyncEventInput = Extract<
  RetailOpsSyncEventInput,
  { type: "sale_created" }
>
type RetailOpsShareLinkCreateSyncEventInput = Extract<
  RetailOpsSyncEventInput,
  { type: "share_link_created" }
>
type RetailOpsShareLinkDeactivateSyncEventInput = Extract<
  RetailOpsSyncEventInput,
  { type: "share_link_deactivated" }
>
type RetailOpsStockIntakeSyncEventInput = Extract<
  RetailOpsSyncEventInput,
  { type: "stock_intake_recorded" }
>
type RetailOpsStockAdjustmentSyncEventInput = Extract<
  RetailOpsSyncEventInput,
  { type: "stock_adjustment_recorded" }
>
type RetailOpsUnitConversionSyncEventInput = Extract<
  RetailOpsSyncEventInput,
  { type: "unit_conversion_recorded" }
>

type BuildRetailOpsSyncEventsInput = {
  activeBusinessId: string | null
  closeouts: RetailOpsCloseout[]
  customers: RetailOpsCustomer[]
  deviceId?: string
  products: RetailOpsProduct[]
  repSessions: RetailOpsRepSession[]
  sales: RetailOpsSale[]
  shareLinks: RetailOpsShareLink[]
  staff: RetailOpsStaffMember[]
  stockMovements: RetailOpsStockMovement[]
  syncEvents: RetailOpsSyncEvent[]
}

export type RetailOpsSyncBlockedEvent = {
  eventId: string
  label: string
  reason: string
  type: RetailOpsSyncEvent["type"]
}

function belongsToActiveBusiness(
  value: { businessId?: string },
  activeBusinessId: string | null,
) {
  return (
    !activeBusinessId ||
    (value.businessId ?? activeBusinessId) === activeBusinessId
  )
}

function toDate(value: string) {
  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? new Date() : date
}

function toNonNegativeWholeQuantity(value: number) {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0))
}

function toRemoteVariantId(input: {
  product?: RetailOpsProduct
  variantId?: string
}) {
  if (!input.product) return null

  if (!input.variantId) return input.product.remoteVariantId ?? null

  return (
    input.product.variants.find((variant) => variant.id === input.variantId)
      ?.remoteId ?? null
  )
}

function toRemoteSessionId(input: {
  repSessionId?: string
  repSessions: RetailOpsRepSession[]
}) {
  if (!input.repSessionId) return null

  return (
    input.repSessions.find((session) => session.id === input.repSessionId)
      ?.remoteId ?? null
  )
}

type LocalInventorySyncLine = {
  confirmedQuantity?: number
  declaredQuantity?: number
  note?: string
  productId: string
  variantId?: string
}

function toRemoteInventoryLines(input: {
  products: RetailOpsProduct[]
  quantityKey: "confirmedQuantity" | "declaredQuantity"
  lines: LocalInventorySyncLine[]
}) {
  const inventoryLines: Array<{
    countedQuantity: number
    note?: string
    productVariantId: string
  }> = []

  for (const line of input.lines) {
    const product = input.products.find(
      (currentProduct) => currentProduct.id === line.productId,
    )
    const productVariantId = toRemoteVariantId({
      product,
      variantId: line.variantId,
    })

    if (!productVariantId) return null

    const countedQuantity =
      input.quantityKey === "confirmedQuantity"
        ? (line.confirmedQuantity ?? 0)
        : (line.declaredQuantity ?? 0)

    inventoryLines.push({
      countedQuantity: toNonNegativeWholeQuantity(countedQuantity),
      note: line.note,
      productVariantId,
    })
  }

  return inventoryLines
}

function findCloseoutSession(
  closeout: RetailOpsCloseout,
  repSessions: RetailOpsRepSession[],
) {
  if (closeout.repSessionId) {
    return repSessions.find((session) => session.id === closeout.repSessionId)
  }

  return (
    repSessions.find(
      (session) =>
        session.status === "closed" &&
        session.attendantName === closeout.attendantName &&
        session.clockedOutAt === closeout.createdAt &&
        belongsToActiveBusiness(session, closeout.businessId ?? null),
    ) ??
    repSessions.find(
      (session) =>
        session.status === "closed" &&
        session.attendantName === closeout.attendantName &&
        belongsToActiveBusiness(session, closeout.businessId ?? null),
    )
  )
}

function findProductSetupPayload(
  event: RetailOpsSyncEvent,
  products: RetailOpsProduct[],
): RetailOpsProductSetupSyncEventInput["payload"] | null {
  const product = products.find(
    (currentProduct) => currentProduct.id === event.entityId,
  )

  if (!product) return null

  return {
    description: product.description,
    externalId: event.id,
    imageUrl: product.imageUrl,
    name: product.name,
    openingStockQuantity: toNonNegativeWholeQuantity(product.startingStock),
    priceMinor: product.price,
    primaryUnitName: product.unitName,
    variants: product.variants.map((variant) => ({
      conversionMultiplier: variant.conversionMultiplier,
      name: variant.name,
      openingStockQuantity: toNonNegativeWholeQuantity(
        variant.startingStock ?? 0,
      ),
      priceMinor: variant.price,
    })),
  }
}

function findCloseoutPayload(
  event: RetailOpsSyncEvent,
  closeouts: RetailOpsCloseout[],
  products: RetailOpsProduct[],
  repSessions: RetailOpsRepSession[],
): RetailOpsCloseoutSyncEventInput["payload"] | null {
  const closeout = closeouts.find(
    (currentCloseout) => currentCloseout.id === event.entityId,
  )

  if (!closeout) return null

  const session = findCloseoutSession(closeout, repSessions)

  if (!session?.remoteId) return null

  const inventoryLines = toRemoteInventoryLines({
    lines: closeout.inventoryLines,
    products,
    quantityKey: "declaredQuantity",
  })

  if (!inventoryLines) return null

  return {
    cashierSessionId: session.remoteId,
    closedAt: toDate(closeout.createdAt),
    closingFloatMinor: closeout.declaredCash,
    declaredTransferMinor: closeout.declaredTransfer,
    externalId: event.id,
    inventoryLines,
    notes: closeout.note,
  }
}

function findCustomerUpsertPayload(
  event: RetailOpsSyncEvent,
  customers: RetailOpsCustomer[],
  sales: RetailOpsSale[],
  syncEvents: RetailOpsSyncEvent[],
): RetailOpsCustomerUpsertSyncEventInput["payload"] | null {
  const customer = customers.find(
    (currentCustomer) => currentCustomer.id === event.entityId,
  )

  if (!customer) return null

  const customerName = customer.name.trim().toLowerCase()
  const sale = sales.find(
    (currentSale) =>
      currentSale.customerName.trim().toLowerCase() === customerName &&
      belongsToActiveBusiness(currentSale, customer.businessId ?? null),
  )

  if (!sale) return null

  const saleEvent = syncEvents.find(
    (currentEvent) =>
      currentEvent.type === "sale_created" && currentEvent.entityId === sale.id,
  )

  if (!saleEvent) return null

  return {
    externalId: event.id,
    lastSaleExternalId: saleEvent.id,
    lastSeenAt: toDate(customer.lastSeenAt),
    name: customer.name,
  }
}

function findSalePayload(
  event: RetailOpsSyncEvent,
  products: RetailOpsProduct[],
  repSessions: RetailOpsRepSession[],
  sales: RetailOpsSale[],
): RetailOpsSaleSyncEventInput["payload"] | null {
  const sale = sales.find((currentSale) => currentSale.id === event.entityId)

  if (!sale) return null

  const product = products.find(
    (currentProduct) => currentProduct.id === sale.productId,
  )
  const productVariantId = toRemoteVariantId({
    product,
    variantId: sale.variantId,
  })

  if (!productVariantId) return null

  const cashierSessionId = toRemoteSessionId({
    repSessionId: sale.repSessionId,
    repSessions,
  })

  if (sale.repSessionId && !cashierSessionId) return null

  const quantity = toNonNegativeWholeQuantity(sale.quantity)
  if (quantity <= 0) return null

  return {
    cashierSessionId: cashierSessionId ?? undefined,
    customerName: sale.customerName,
    externalId: event.id,
    paymentMethod: sale.paymentMethod,
    productVariantId,
    quantity,
    soldAt: toDate(sale.createdAt),
  }
}

function findRepSessionOpenPayload(
  event: RetailOpsSyncEvent,
  products: RetailOpsProduct[],
  repSessions: RetailOpsRepSession[],
): RetailOpsRepSessionOpenSyncEventInput["payload"] | null {
  const session = repSessions.find(
    (currentSession) => currentSession.id === event.entityId,
  )

  if (!session) return null

  const inventoryLines = toRemoteInventoryLines({
    lines: session.openingInventoryLines,
    products,
    quantityKey: "confirmedQuantity",
  })

  if (!inventoryLines) return null

  return {
    externalId: event.id,
    inventoryLines,
    notes: session.note,
    openedAt: toDate(session.clockedInAt),
    openingFloatMinor: 0,
  }
}

function findStaffInvitePayload(
  event: RetailOpsSyncEvent,
  staff: RetailOpsStaffMember[],
): RetailOpsStaffInviteSyncEventInput["payload"] | null {
  const staffMember = staff.find(
    (currentStaffMember) => currentStaffMember.id === event.entityId,
  )

  if (!staffMember) return null

  return {
    email: staffMember.email,
    externalId: event.id,
    name: staffMember.name,
    role: "cashier",
  }
}

function findShareLinkCreatePayload(
  event: RetailOpsSyncEvent,
  products: RetailOpsProduct[],
  shareLinks: RetailOpsShareLink[],
): RetailOpsShareLinkCreateSyncEventInput["payload"] | null {
  const shareLink = shareLinks.find(
    (currentShareLink) => currentShareLink.id === event.entityId,
  )

  if (!shareLink) return null

  const product = products.find(
    (currentProduct) => currentProduct.id === shareLink.productId,
  )

  if (!product?.remoteId) return null

  return {
    externalId: event.id,
    label: shareLink.productName,
    productId: product.remoteId,
  }
}

function findShareLinkDeactivatePayload(
  event: RetailOpsSyncEvent,
  products: RetailOpsProduct[],
  shareLinks: RetailOpsShareLink[],
): RetailOpsShareLinkDeactivateSyncEventInput["payload"] | null {
  const shareLink = shareLinks.find(
    (currentShareLink) => currentShareLink.id === event.entityId,
  )

  if (!shareLink?.remoteId) return null

  const product = products.find(
    (currentProduct) => currentProduct.id === shareLink.productId,
  )

  if (!product?.remoteId) return null

  return {
    externalId: event.id,
    productId: product.remoteId,
    shareLinkId: shareLink.remoteId,
  }
}

function findStockIntakePayload(
  event: RetailOpsSyncEvent,
  products: RetailOpsProduct[],
  stockMovements: RetailOpsStockMovement[],
): RetailOpsStockIntakeSyncEventInput["payload"] | null {
  const movement = stockMovements.find(
    (currentMovement) =>
      currentMovement.id === event.entityId &&
      currentMovement.type === "stock_intake",
  )

  const quantity = movement ? toNonNegativeWholeQuantity(movement.quantity) : 0

  if (!movement || quantity <= 0) return null

  const product = products.find(
    (currentProduct) => currentProduct.id === movement.productId,
  )
  const productVariantId = toRemoteVariantId({
    product,
    variantId: movement.variantId,
  })

  if (!productVariantId) return null

  return {
    externalId: event.id,
    note: movement.note,
    productVariantId,
    quantity,
    receivedAt: toDate(movement.createdAt),
  }
}

function findStockAdjustmentPayload(
  event: RetailOpsSyncEvent,
  products: RetailOpsProduct[],
  stockMovements: RetailOpsStockMovement[],
): RetailOpsStockAdjustmentSyncEventInput["payload"] | null {
  const movement = stockMovements.find(
    (currentMovement) =>
      currentMovement.id === event.entityId &&
      currentMovement.type === "stock_adjustment",
  )

  const quantity = movement
    ? toNonNegativeWholeQuantity(Math.abs(movement.quantity))
    : 0

  if (!movement || quantity <= 0) return null

  const product = products.find(
    (currentProduct) => currentProduct.id === movement.productId,
  )
  const productVariantId = toRemoteVariantId({
    product,
    variantId: movement.variantId,
  })

  if (!productVariantId) return null

  return {
    adjustedAt: toDate(movement.createdAt),
    direction: movement.quantity > 0 ? "increase" : "decrease",
    externalId: event.id,
    note: movement.note,
    productVariantId,
    quantity,
    reason: movement.stockAdjustmentReason ?? "correction",
    sourceName: "Mobile stock adjustment",
  }
}

function findUnitConversionPayload(
  event: RetailOpsSyncEvent,
  products: RetailOpsProduct[],
  stockMovements: RetailOpsStockMovement[],
): RetailOpsUnitConversionSyncEventInput["payload"] | null {
  const conversionMovements = stockMovements.filter(
    (movement) => movement.syncGroupId === event.entityId,
  )
  const sourceMovement = conversionMovements.find(
    (movement) => movement.type === "conversion_out",
  )
  const targetMovement = conversionMovements.find(
    (movement) => movement.type === "conversion_in",
  )

  if (!sourceMovement || !targetMovement) return null

  const sourceQuantity = toNonNegativeWholeQuantity(
    Math.abs(sourceMovement.quantity),
  )
  const targetQuantity = toNonNegativeWholeQuantity(targetMovement.quantity)

  if (sourceQuantity <= 0 || targetQuantity <= 0) return null

  const product = products.find(
    (currentProduct) => currentProduct.id === sourceMovement.productId,
  )
  const sourceProductVariantId = toRemoteVariantId({
    product,
    variantId: sourceMovement.variantId,
  })
  const targetProductVariantId = toRemoteVariantId({
    product,
    variantId: targetMovement.variantId,
  })

  if (!sourceProductVariantId || !targetProductVariantId) return null

  return {
    convertedAt: toDate(sourceMovement.createdAt),
    externalId: event.id,
    note: targetMovement.note ?? sourceMovement.note,
    sourceProductVariantId,
    sourceQuantity,
    targetProductVariantId,
    targetQuantity,
  }
}

function isReplayableSyncEvent(event: RetailOpsSyncEvent) {
  if (event.status === "pending") return true

  if (event.status !== "failed") return false
  if (!event.nextRetryAt) return true

  const nextRetryTime = new Date(event.nextRetryAt).getTime()

  return Number.isNaN(nextRetryTime) || nextRetryTime <= Date.now()
}

function getRetailOpsSyncEventInput(
  event: RetailOpsSyncEvent,
  input: BuildRetailOpsSyncEventsInput,
): RetailOpsSyncEventInput | null {
  if (event.type === "closeout_created") {
    const payload = findCloseoutPayload(
      event,
      input.closeouts,
      input.products,
      input.repSessions,
    )

    return payload
      ? {
          createdAt: toDate(event.createdAt),
          eventId: event.id,
          payload,
          type: event.type,
        }
      : null
  }

  if (event.type === "customer_upsert") {
    const payload = findCustomerUpsertPayload(
      event,
      input.customers,
      input.sales,
      input.syncEvents,
    )

    return payload
      ? {
          createdAt: toDate(event.createdAt),
          eventId: event.id,
          payload,
          type: event.type,
        }
      : null
  }

  if (event.type === "product_setup") {
    const payload = findProductSetupPayload(event, input.products)

    return payload
      ? {
          createdAt: toDate(event.createdAt),
          eventId: event.id,
          payload,
          type: event.type,
        }
      : null
  }

  if (event.type === "sale_created") {
    const payload = findSalePayload(
      event,
      input.products,
      input.repSessions,
      input.sales,
    )

    return payload
      ? {
          createdAt: toDate(event.createdAt),
          eventId: event.id,
          payload,
          type: event.type,
        }
      : null
  }

  if (event.type === "rep_session_opened") {
    const payload = findRepSessionOpenPayload(
      event,
      input.products,
      input.repSessions,
    )

    return payload
      ? {
          createdAt: toDate(event.createdAt),
          eventId: event.id,
          payload,
          type: event.type,
        }
      : null
  }

  if (event.type === "staff_invited") {
    const payload = findStaffInvitePayload(event, input.staff)

    return payload
      ? {
          createdAt: toDate(event.createdAt),
          eventId: event.id,
          payload,
          type: event.type,
        }
      : null
  }

  if (event.type === "share_link_created") {
    const payload = findShareLinkCreatePayload(
      event,
      input.products,
      input.shareLinks,
    )

    return payload
      ? {
          createdAt: toDate(event.createdAt),
          eventId: event.id,
          payload,
          type: event.type,
        }
      : null
  }

  if (event.type === "share_link_deactivated") {
    const payload = findShareLinkDeactivatePayload(
      event,
      input.products,
      input.shareLinks,
    )

    return payload
      ? {
          createdAt: toDate(event.createdAt),
          eventId: event.id,
          payload,
          type: event.type,
        }
      : null
  }

  if (event.type === "stock_intake_recorded") {
    const payload = findStockIntakePayload(
      event,
      input.products,
      input.stockMovements,
    )

    return payload
      ? {
          createdAt: toDate(event.createdAt),
          eventId: event.id,
          payload,
          type: event.type,
        }
      : null
  }

  if (event.type === "stock_adjustment_recorded") {
    const payload = findStockAdjustmentPayload(
      event,
      input.products,
      input.stockMovements,
    )

    return payload
      ? {
          createdAt: toDate(event.createdAt),
          eventId: event.id,
          payload,
          type: event.type,
        }
      : null
  }

  if (event.type === "unit_conversion_recorded") {
    const payload = findUnitConversionPayload(
      event,
      input.products,
      input.stockMovements,
    )

    return payload
      ? {
          createdAt: toDate(event.createdAt),
          eventId: event.id,
          payload,
          type: event.type,
        }
      : null
  }

  return null
}

function getRetailOpsSyncBlockedReason(
  event: RetailOpsSyncEvent,
  input: BuildRetailOpsSyncEventsInput,
) {
  if (event.type === "sale_created") {
    const sale = input.sales.find(
      (currentSale) => currentSale.id === event.entityId,
    )
    const product = input.products.find(
      (currentProduct) => currentProduct.id === sale?.productId,
    )
    const hasRemoteUnit = toRemoteVariantId({
      product,
      variantId: sale?.variantId,
    })
    const hasRemoteSession =
      !sale?.repSessionId ||
      toRemoteSessionId({
        repSessionId: sale.repSessionId,
        repSessions: input.repSessions,
      })

    if (!sale) return "Waiting for the local sale record."
    if (!hasRemoteUnit) return "Waiting for the product/unit to sync first."
    if (!hasRemoteSession) return "Waiting for the rep session to sync first."
  }

  if (event.type === "closeout_created") {
    const closeout = input.closeouts.find(
      (currentCloseout) => currentCloseout.id === event.entityId,
    )
    const session = closeout
      ? findCloseoutSession(closeout, input.repSessions)
      : null

    if (!closeout) return "Waiting for the local closeout record."
    if (!session?.remoteId)
      return "Waiting for the linked rep session to sync first."
    if (
      !toRemoteInventoryLines({
        lines: closeout.inventoryLines,
        products: input.products,
        quantityKey: "declaredQuantity",
      })
    ) {
      return "Waiting for the closing product/unit mappings to sync first."
    }

    return "Waiting for the linked rep session to sync first."
  }

  if (event.type === "customer_upsert") {
    return "Waiting for the customer's sale to sync first."
  }

  if (event.type === "share_link_created") {
    return "Waiting for the product to sync before creating the link."
  }

  if (event.type === "share_link_deactivated") {
    return "Waiting for the share link to sync before deactivation."
  }

  if (
    event.type === "stock_adjustment_recorded" ||
    event.type === "stock_intake_recorded" ||
    event.type === "unit_conversion_recorded"
  ) {
    return "Waiting for the product/unit mapping to sync first."
  }

  if (event.type === "rep_session_opened") {
    const session = input.repSessions.find(
      (currentSession) => currentSession.id === event.entityId,
    )

    if (!session) return "Waiting for the local rep session record."
    if (
      !toRemoteInventoryLines({
        lines: session.openingInventoryLines,
        products: input.products,
        quantityKey: "confirmedQuantity",
      })
    ) {
      return "Waiting for the opening product/unit mappings to sync first."
    }
  }

  return "Waiting for the local record needed to build this sync payload."
}

export function buildRetailOpsSyncEventsInput(
  input: BuildRetailOpsSyncEventsInput,
): RetailOpsSyncEventsInput {
  const events = input.syncEvents
    .filter(
      (event) =>
        isReplayableSyncEvent(event) &&
        belongsToActiveBusiness(event, input.activeBusinessId),
    )
    .flatMap<RetailOpsSyncEventInput>((event) => {
      const syncEvent = getRetailOpsSyncEventInput(event, input)

      return syncEvent ? [syncEvent] : []
    })
    .slice(0, 50)

  return {
    deviceId: input.deviceId,
    events,
  }
}

export function getRetailOpsSyncBlockedEvents(
  input: BuildRetailOpsSyncEventsInput,
) {
  return input.syncEvents.flatMap<RetailOpsSyncBlockedEvent>((event) => {
    if (
      !isReplayableSyncEvent(event) ||
      !belongsToActiveBusiness(event, input.activeBusinessId) ||
      getRetailOpsSyncEventInput(event, input)
    ) {
      return []
    }

    return {
      eventId: event.id,
      label: event.label,
      reason: getRetailOpsSyncBlockedReason(event, input),
      type: event.type,
    }
  })
}

export function getRetailOpsProductSyncMappings(
  results: RetailOpsSyncEventsOutput["results"],
) {
  return results.flatMap((result) => {
    if (result.type !== "product_setup" || result.status !== "applied") {
      return []
    }

    const value = result.result as
      | {
          product?: { id?: unknown }
          units?: Array<{ id?: unknown; isDefault?: unknown; name?: unknown }>
        }
      | null
      | undefined
    const productId =
      typeof value?.product?.id === "string" ? value.product.id : null
    const units = Array.isArray(value?.units)
      ? value.units.flatMap((unit) => {
          if (
            typeof unit.id !== "string" ||
            typeof unit.name !== "string" ||
            typeof unit.isDefault !== "boolean"
          ) {
            return []
          }

          return {
            id: unit.id,
            isDefault: unit.isDefault,
            name: unit.name,
          }
        })
      : []

    return productId && units.length > 0
      ? [
          {
            eventId: result.eventId,
            productId,
            units,
          },
        ]
      : []
  })
}

export function getRetailOpsCustomerSyncMappings(
  results: RetailOpsSyncEventsOutput["results"],
) {
  return results.flatMap((result) => {
    if (result.type !== "customer_upsert" || result.status !== "applied") {
      return []
    }

    const value = result.result as
      | {
          customer?: { id?: unknown }
        }
      | null
      | undefined
    const customerId =
      typeof value?.customer?.id === "string" ? value.customer.id : null

    return customerId
      ? [
          {
            customerId,
            eventId: result.eventId,
          },
        ]
      : []
  })
}

export function getRetailOpsRepSessionSyncMappings(
  results: RetailOpsSyncEventsOutput["results"],
) {
  return results.flatMap((result) => {
    if (result.type !== "rep_session_opened" || result.status !== "applied") {
      return []
    }

    const value = result.result as
      | {
          id?: unknown
        }
      | null
      | undefined
    const cashierSessionId = typeof value?.id === "string" ? value.id : null

    return cashierSessionId
      ? [
          {
            eventId: result.eventId,
            cashierSessionId,
          },
        ]
      : []
  })
}

export function getRetailOpsSaleSyncMappings(
  results: RetailOpsSyncEventsOutput["results"],
) {
  return results.flatMap((result) => {
    if (result.type !== "sale_created" || result.status !== "applied") {
      return []
    }

    const value = result.result as
      | {
          order?: { id?: unknown }
        }
      | null
      | undefined
    const orderId = typeof value?.order?.id === "string" ? value.order.id : null

    return orderId
      ? [
          {
            eventId: result.eventId,
            orderId,
          },
        ]
      : []
  })
}

export function getRetailOpsStaffSyncMappings(
  results: RetailOpsSyncEventsOutput["results"],
) {
  return results.flatMap((result) => {
    if (result.type !== "staff_invited" || result.status !== "applied") {
      return []
    }

    const value = result.result as
      | {
          invite?: { id?: unknown }
        }
      | null
      | undefined
    const membershipId =
      typeof value?.invite?.id === "string" ? value.invite.id : null

    return membershipId
      ? [
          {
            eventId: result.eventId,
            membershipId,
          },
        ]
      : []
  })
}

export function getRetailOpsShareLinkSyncMappings(
  results: RetailOpsSyncEventsOutput["results"],
) {
  return results.flatMap((result) => {
    if (
      result.status !== "applied" ||
      (result.type !== "share_link_created" &&
        result.type !== "share_link_deactivated")
    ) {
      return []
    }

    const value = result.result as
      | {
          active?: unknown
          id?: unknown
          url?: unknown
        }
      | null
      | undefined
    const shareLinkId = typeof value?.id === "string" ? value.id : null

    return shareLinkId
      ? [
          {
            active: typeof value?.active === "boolean" ? value.active : null,
            eventId: result.eventId,
            shareLinkId,
            url: typeof value?.url === "string" ? value.url : null,
          },
        ]
      : []
  })
}
