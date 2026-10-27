import { createHash, createHmac, randomInt } from "node:crypto"
import { normalizeWhatsAppPhone } from "@ewatrade/customer-messages"
import {
  ORDERING_TEMPLATE_KEYS,
  type StorefrontOrderLineIssue,
  orderingFulfilmentMethods,
  storefrontOrderRequestSchema,
  storefrontRequestReplySchema,
  storefrontWithdrawSchema,
} from "@ewatrade/storefront-contracts/orders"
import {
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { getConfiguredCatalogOfferingAvailability } from "./catalog-inventory"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import { publicCatalogItemWhere } from "./public-storefront"
import { publicStockState } from "./public-storefront-display"
import { findRetailOpsPlan } from "./retail-ops-subscription-plans"
import { resolveRetailOpsPlanId } from "./retail-ops-subscriptions"
import { assertStoreConversationTextScreened } from "./store-conversation-text-safety"
import { loadLiveStorefrontForHost } from "./storefront-factory-loader"
import { siteContentHash } from "./storefront-sites"
import type { DbClient } from "./types"

/**
 * Storefront product order requests.
 *
 * A customer submission is a pending request awaiting business review. It never
 * calls the confirmed-order writer, reserves stock, posts money or invents a staff
 * actor. A staff confirmation converts it exactly once through the canonical
 * Commercial Order writer, which re-reads price/configuration and reserves stock.
 */

export type StorefrontOrderErrorCode =
  | "UNAVAILABLE"
  | "INVALID"
  | "LINES_CHANGED"
  | "REPLAY_MISMATCH"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "STALE"
  | "INVALID_STATE"
  | "PRICE_CHANGED"
  | "STOCK_CONFLICT"

export class StorefrontOrderError extends Error {
  readonly code: StorefrontOrderErrorCode
  readonly issues: StorefrontOrderLineIssue[]
  readonly field?: string
  constructor(
    code: StorefrontOrderErrorCode,
    message: string,
    options: { issues?: StorefrontOrderLineIssue[]; field?: string } = {},
  ) {
    super(message)
    this.name = "StorefrontOrderError"
    this.code = code
    this.issues = options.issues ?? []
    this.field = options.field
  }
}

const TX = () => ({ maxWait: 10_000, timeout: 30_000 })
const SUBMISSIONS_PER_PHONE_PER_HOUR = 6

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex")

/** Deterministic, so a timed-out submission can recover its own receipt link. */
export function storefrontReceiptToken(
  kind: "order" | "service",
  requestId: string,
  secret: string,
) {
  if (!secret || secret.length < 32)
    throw new Error(
      "Configure a receipt signing key of at least 32 characters.",
    )
  return createHmac("sha256", secret)
    .update(`ewatrade:storefront-receipt:${kind}:v1:${requestId}`)
    .digest("base64url")
}
export const storefrontReceiptDigest = (token: string) => sha256(token)

const referenceAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
export function newStorefrontReference(prefix: "R" | "S") {
  let value = ""
  for (let index = 0; index < 6; index++)
    value += referenceAlphabet[randomInt(referenceAlphabet.length)]
  return `${prefix}-${value}`
}

function payloadHash(value: unknown) {
  return sha256(JSON.stringify(value))
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
}

type LiveScope = {
  tenantId: string
  storeId: string
  siteId: string
  releaseId: string
  businessName: string
  currencyCode: string
  countryCode: string | null
  storefrontItems: number | null
  fulfilment: ("pickup" | "delivery")[]
}

/** Verified Host → published Site → active release → Store, plus ordering policy. */
export async function resolveStorefrontOrderingScope(
  db: DbClient,
  host: string,
): Promise<LiveScope | null> {
  const current = await loadLiveStorefrontForHost(db, host, undefined, {})
  if (!current) return null
  const { site, storefront } = current
  const release = site.release
  const pinned = release.composition as {
    template?: { key?: unknown; version?: unknown }
  } | null
  if (
    release.contentHash !== siteContentHash(release.composition) ||
    pinned?.template?.key !== release.templateKey ||
    !ORDERING_TEMPLATE_KEYS.includes(release.templateKey) ||
    !(storefront as { customerRequestsAllowed?: boolean })
      .customerRequestsAllowed
  )
    return null
  const store = await db.store.findFirst({
    where: { id: site.storeId, tenantId: release.tenantId, status: "ACTIVE" },
    select: { countryCode: true },
  })
  if (!store) return null
  return {
    tenantId: release.tenantId,
    storeId: site.storeId,
    siteId: site.siteId,
    releaseId: release.id,
    businessName: storefront.name,
    currencyCode: storefront.currencyCode,
    countryCode: store.countryCode,
    storefrontItems: storefront.storefrontItems ?? null,
    fulfilment: orderingFulfilmentMethods(release.composition),
  }
}

/** Items that are public right now, including the plan cap (oldest eligible first). */
async function publicItemIds(
  tx: Prisma.TransactionClient,
  scope: Pick<LiveScope, "tenantId" | "storeId" | "storefrontItems">,
  itemIds: string[],
) {
  const where = publicCatalogItemWhere(scope.tenantId, scope.storeId)
  if (scope.storefrontItems === null) {
    const rows = await tx.catalogItem.findMany({
      where: { AND: [where, { id: { in: itemIds } }] },
      select: { id: true },
    })
    return new Set(rows.map((row) => row.id))
  }
  const rows = await tx.catalogItem.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: scope.storefrontItems,
    select: { id: true },
  })
  return new Set(rows.map((row) => row.id).filter((id) => itemIds.includes(id)))
}

type CurrentLine = {
  offeringId: string
  itemId: string
  itemName: string
  optionName: string
  unitLabel: string | null
  quantityScale: number
  priceMinor: number | null
  currencyCode: string
  configurationVersionId: string | null
  stock: "in_stock" | "low_stock" | "out_of_stock" | "unknown"
  availableQuantity: string | null
  public: boolean
}

/** Current public purchase facts for product offerings, read in the caller's snapshot. */
export async function readStorefrontPurchaseFacts(
  tx: Prisma.TransactionClient,
  scope: Pick<LiveScope, "tenantId" | "storeId" | "storefrontItems">,
  lines: { itemId: string; offeringId: string }[],
): Promise<Map<string, CurrentLine>> {
  const itemIds = [...new Set(lines.map((line) => line.itemId))]
  const visible = await publicItemIds(tx, scope, itemIds)
  const offerings = await tx.sellableOffering.findMany({
    where: {
      id: { in: lines.map((line) => line.offeringId) },
      tenantId: scope.tenantId,
      status: "ACTIVE",
      archivedAt: null,
      kind: "PRODUCT_UNIT",
      variant: { status: "ACTIVE", archivedAt: null },
      storeAvailability: {
        some: { storeId: scope.storeId, isAvailable: true },
      },
    },
    select: {
      id: true,
      name: true,
      catalogItemId: true,
      pricingPolicy: true,
      fixedPriceMinor: true,
      currencyCode: true,
      catalogItem: {
        select: { name: true, product: { select: { lowStockLevel: true } } },
      },
      productUnitOffering: {
        select: {
          inventoryUnit: { select: { name: true, transactionScale: true } },
        },
      },
      variant: {
        select: {
          name: true,
          isDefault: true,
          stockBalanceSources: {
            where: {
              tenantId: scope.tenantId,
              storeId: scope.storeId,
              custodyType: "STORE",
            },
            select: {
              inventoryUnitId: true,
              onHandQuantity: true,
              reservedQuantity: true,
            },
          },
        },
      },
    },
  })
  const facts = new Map<string, CurrentLine>()
  for (const offering of offerings) {
    let availableQuantity: string | null = null
    let configurationVersionId: string | null = null
    try {
      const availability = await getConfiguredCatalogOfferingAvailability(tx, {
        offeringId: offering.id,
        storeId: scope.storeId,
        tenantId: scope.tenantId,
      })
      availableQuantity = availability.availableOfferingQuantity
      configurationVersionId = availability.configurationVersionId
    } catch {
      // No configured balance yet: stock is unknown, never assumed available.
    }
    const balances = offering.variant.stockBalanceSources
    const stock =
      availableQuantity === null
        ? ("unknown" as const)
        : compareExactDecimals(availableQuantity, "0") <= 0
          ? ("out_of_stock" as const)
          : publicStockState(
              balances,
              offering.catalogItem.product?.lowStockLevel,
            )
    facts.set(offering.id, {
      offeringId: offering.id,
      itemId: offering.catalogItemId,
      itemName: offering.catalogItem.name,
      optionName:
        offering.variant.isDefault ||
        offering.variant.name.trim().toLowerCase() ===
          offering.name.trim().toLowerCase()
          ? offering.name
          : `${offering.variant.name} · ${offering.name}`,
      unitLabel: offering.productUnitOffering?.inventoryUnit.name ?? null,
      quantityScale: Math.min(
        6,
        offering.productUnitOffering?.inventoryUnit.transactionScale ?? 0,
      ),
      priceMinor:
        offering.pricingPolicy === "FIXED" ? offering.fixedPriceMinor : null,
      currencyCode: offering.currencyCode,
      configurationVersionId,
      stock,
      availableQuantity,
      public: visible.has(offering.catalogItemId),
    })
  }
  return facts
}

function lineIssues(
  lines: {
    itemId: string
    offeringId: string
    quantity: string
    observedUnitPriceMinor: number
  }[],
  facts: Map<string, CurrentLine>,
): StorefrontOrderLineIssue[] {
  const issues: StorefrontOrderLineIssue[] = []
  for (const line of lines) {
    const fact = facts.get(line.offeringId)
    if (!fact || !fact.public || fact.itemId !== line.itemId) {
      issues.push({ offeringId: line.offeringId, reason: "unavailable" })
      continue
    }
    if (fact.priceMinor === null) {
      issues.push({ offeringId: line.offeringId, reason: "price_on_request" })
      continue
    }
    try {
      parseExactDecimal(line.quantity, {
        allowZero: false,
        maxScale: fact.quantityScale,
      })
    } catch {
      issues.push({ offeringId: line.offeringId, reason: "invalid_quantity" })
      continue
    }
    if (fact.priceMinor !== line.observedUnitPriceMinor) {
      issues.push({
        offeringId: line.offeringId,
        reason: "price_changed",
        currentUnitPriceMinor: fact.priceMinor,
      })
      continue
    }
    if (fact.stock === "out_of_stock") {
      issues.push({ offeringId: line.offeringId, reason: "out_of_stock" })
      continue
    }
    if (
      fact.availableQuantity !== null &&
      compareExactDecimals(fact.availableQuantity, line.quantity) < 0
    )
      issues.push({ offeringId: line.offeringId, reason: "insufficient_stock" })
  }
  return issues
}

function lineTotalMinor(unitPriceMinor: number, quantity: string) {
  const total = multiplyExactDecimals(String(unitPriceMinor), quantity)
  const whole = /^(\d+)(?:\.0+)?$/.exec(total)
  if (!whole?.[1] || !Number.isSafeInteger(Number(whole[1])))
    throw new StorefrontOrderError(
      "INVALID",
      "That quantity doesn't produce a whole price. Choose another quantity.",
    )
  return Number(whole[1])
}

export type SubmitStorefrontOrderResult = {
  requestId: string
  reference: string
  receiptToken: string
  replayed: boolean
}

/** Customer submission. Host-derived scope; idempotent on clientRequestId + payload. */
export async function submitStorefrontOrderRequest(
  db: PrismaClient,
  input: unknown,
  context: { host: string; receiptSecret: string; customerId?: string | null },
): Promise<SubmitStorefrontOrderResult> {
  const value = storefrontOrderRequestSchema.parse(input)
  const scope = await resolveStorefrontOrderingScope(db, context.host)
  if (!scope)
    throw new StorefrontOrderError(
      "UNAVAILABLE",
      "This shop isn't taking order requests right now.",
    )
  if (!scope.fulfilment.includes(value.fulfilment))
    throw new StorefrontOrderError(
      "INVALID",
      value.fulfilment === "delivery"
        ? "This shop doesn't deliver. Choose pickup."
        : "This shop doesn't offer pickup. Choose delivery.",
      { field: "fulfilment" },
    )
  const phone = normalizeWhatsAppPhone(
    value.customerPhone,
    scope.countryCode ?? "NG",
  )
  if (!phone)
    throw new StorefrontOrderError(
      "INVALID",
      "Enter a WhatsApp number we can reach, for example 0803 123 4567.",
      { field: "customerPhone" },
    )
  await assertStoreConversationTextScreened(value.customerName)
  if (value.notes) await assertStoreConversationTextScreened(value.notes)
  if (value.deliveryAddress)
    await assertStoreConversationTextScreened(value.deliveryAddress)
  const normalized = {
    lines: value.lines,
    customerName: value.customerName.trim(),
    customerPhone: phone.phoneE164,
    customerEmail: value.customerEmail?.trim() || null,
    fulfilment: value.fulfilment,
    deliveryAddress:
      value.fulfilment === "delivery"
        ? value.deliveryAddress?.trim() || null
        : null,
    notes: value.notes?.trim() || null,
    customerId: context.customerId ?? null,
  }
  const hash = payloadHash(normalized)
  const replay = async () => {
    const previous = await db.storefrontOrderRequest.findUnique({
      where: {
        tenantId_clientRequestId: {
          tenantId: scope.tenantId,
          clientRequestId: value.clientRequestId,
        },
      },
      select: { id: true, reference: true, payloadHash: true },
    })
    if (!previous) return null
    if (previous.payloadHash !== hash)
      throw new StorefrontOrderError(
        "REPLAY_MISMATCH",
        "This request was already sent with different details. Refresh and try again.",
      )
    return {
      requestId: previous.id,
      reference: previous.reference,
      receiptToken: storefrontReceiptToken(
        "order",
        previous.id,
        context.receiptSecret,
      ),
      replayed: true,
    }
  }
  const existing = await replay()
  if (existing) return existing

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${scope.tenantId} FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "TenantSubscription" WHERE "tenantId" = ${scope.tenantId} FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${scope.storeId} FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "Site" WHERE "id" = ${scope.siteId} FOR SHARE`
        const ids = value.lines.map((line) => line.offeringId).sort()
        await tx.$queryRaw`SELECT "id" FROM "SellableOffering" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "StoreOfferingAvailability" WHERE "storeId" = ${scope.storeId} AND "offeringId" IN (${Prisma.join(ids)}) ORDER BY "id" FOR SHARE`
        // Publication, plan and template are rechecked inside the locked snapshot.
        const fresh = await resolveStorefrontOrderingScope(tx, context.host)
        if (
          !fresh ||
          fresh.siteId !== scope.siteId ||
          fresh.releaseId !== scope.releaseId ||
          fresh.tenantId !== scope.tenantId
        )
          throw new StorefrontOrderError(
            "UNAVAILABLE",
            "This shop isn't taking order requests right now.",
          )
        const recent = await tx.storefrontOrderRequest.count({
          where: {
            tenantId: scope.tenantId,
            customerPhone: phone.phoneE164,
            createdAt: { gt: new Date(Date.now() - 60 * 60_000) },
          },
        })
        if (recent >= SUBMISSIONS_PER_PHONE_PER_HOUR)
          throw new StorefrontOrderError(
            "RATE_LIMITED",
            "You've sent several requests recently. Please wait a little or message the shop.",
          )
        const facts = await readStorefrontPurchaseFacts(tx, fresh, value.lines)
        const issues = lineIssues(value.lines, facts)
        if (issues.length)
          throw new StorefrontOrderError(
            "LINES_CHANGED",
            "Some items in your bag changed. Review them and send again.",
            { issues },
          )
        const priced = value.lines.map((line, index) => {
          const fact = facts.get(line.offeringId) as CurrentLine
          return {
            position: index + 1,
            offeringId: line.offeringId,
            catalogItemId: line.itemId,
            itemName: fact.itemName,
            optionName: fact.optionName,
            unitLabel: fact.unitLabel,
            quantity: line.quantity,
            observedUnitPriceMinor: line.observedUnitPriceMinor,
            currencyCode: fact.currencyCode,
            observedAvailability:
              fact.stock === "low_stock"
                ? ("LOW_STOCK" as const)
                : fact.stock === "in_stock"
                  ? ("IN_STOCK" as const)
                  : ("UNKNOWN" as const),
            total: lineTotalMinor(line.observedUnitPriceMinor, line.quantity),
          }
        })
        const subtotal = priced.reduce((sum, line) => sum + line.total, 0)
        if (!Number.isSafeInteger(subtotal))
          throw new StorefrontOrderError(
            "INVALID",
            "This bag total is too large.",
          )
        const request = await tx.storefrontOrderRequest.create({
          data: {
            tenantId: scope.tenantId,
            storeId: scope.storeId,
            siteId: scope.siteId,
            releaseId: scope.releaseId,
            reference: newStorefrontReference("R"),
            clientRequestId: value.clientRequestId,
            payloadHash: hash,
            customerName: normalized.customerName,
            customerPhone: normalized.customerPhone,
            customerEmail: normalized.customerEmail,
            customerId: normalized.customerId,
            fulfilment: value.fulfilment === "delivery" ? "DELIVERY" : "PICKUP",
            deliveryAddress: normalized.deliveryAddress,
            notes: normalized.notes,
            currencyCode: scope.currencyCode,
            observedSubtotalMinor: subtotal,
            receiptTokenDigest: `pending:${value.clientRequestId}`,
            lines: {
              create: priced.map(({ total: _total, ...line }) => line),
            },
          },
          select: { id: true, reference: true },
        })
        const receiptToken = storefrontReceiptToken(
          "order",
          request.id,
          context.receiptSecret,
        )
        await tx.storefrontOrderRequest.update({
          where: { id: request.id },
          data: { receiptTokenDigest: storefrontReceiptDigest(receiptToken) },
        })
        // Durable alert in the same commit; delivery happens after commit.
        await tx.storefrontMerchantAlert.create({
          data: {
            tenantId: scope.tenantId,
            storeId: scope.storeId,
            kind: "ORDER",
            orderRequestId: request.id,
            dedupeKey: `order-request:${request.id}:new`,
          },
        })
        return {
          requestId: request.id,
          reference: request.reference,
          receiptToken,
          replayed: false,
        }
      }, TX())
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      // Concurrent duplicate submit, or a rare reference collision.
      const previous = await replay()
      if (previous) return previous
    }
  }
  throw new StorefrontOrderError(
    "UNAVAILABLE",
    "We couldn't save your request. Please try again.",
  )
}

/** Customer stage derived from the request and its canonical Order. */
export function storefrontOrderStage(input: {
  status: string
  order: { status: string } | null
}) {
  if (input.status === "CONFIRMED" && input.order) {
    if (input.order.status === "COMPLETED") return "completed" as const
    if (input.order.status === "CANCELLED" || input.order.status === "REFUNDED")
      return "cancelled" as const
    if (
      input.order.status === "READY_FOR_PICKUP" ||
      input.order.status === "OUT_FOR_DELIVERY"
    )
      return "ready" as const
    return "confirmed" as const
  }
  switch (input.status) {
    case "NEEDS_INFORMATION":
      return "needs_information" as const
    case "DECLINED":
      return "declined" as const
    case "WITHDRAWN":
      return "withdrawn" as const
    default:
      return "received" as const
  }
}

function maskPhone(phone: string) {
  return phone.length > 6
    ? `${phone.slice(0, 4)} ••• ${phone.slice(-3)}`
    : "•••"
}

const receiptSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  reference: true,
  status: true,
  revision: true,
  customerName: true,
  customerPhone: true,
  customerId: true,
  fulfilment: true,
  deliveryAddress: true,
  notes: true,
  currencyCode: true,
  observedSubtotalMinor: true,
  staffResponse: true,
  deliveryFeeMinor: true,
  createdAt: true,
  decidedAt: true,
  confirmedAt: true,
  lines: {
    orderBy: { position: "asc" as const },
    select: {
      offeringId: true,
      catalogItemId: true,
      itemName: true,
      optionName: true,
      unitLabel: true,
      quantity: true,
      observedUnitPriceMinor: true,
      currencyCode: true,
      observedAvailability: true,
    },
  },
  messages: {
    orderBy: { createdAt: "asc" as const },
    take: 50,
    select: { id: true, author: true, body: true, createdAt: true },
  },
  confirmedOrder: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      subtotalMinor: true,
      serviceChargeMinor: true,
      discountMinor: true,
      taxMinor: true,
      totalMinor: true,
      amountPaidMinor: true,
      currencyCode: true,
      lines: {
        select: {
          offeringId: true,
          quantity: true,
          unitPriceMinor: true,
          totalMinor: true,
        },
      },
      manualPaymentLinks: {
        where: { closedAt: null },
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: {
          id: true,
          expiresAt: true,
          amountMinor: true,
          reports: {
            where: { status: { not: "DRAFT" as const } },
            orderBy: { createdAt: "desc" as const },
            take: 1,
            select: {
              status: true,
              claimedAmountMinor: true,
              receivedAmountMinor: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StorefrontOrderRequestSelect

type ReceiptRow = Prisma.StorefrontOrderRequestGetPayload<{
  select: typeof receiptSelect
}>

function projectReceipt(row: ReceiptRow, businessName: string) {
  const order = row.confirmedOrder
  const link = order?.manualPaymentLinks[0]
  const report = link?.reports[0]
  return {
    kind: "order" as const,
    reference: row.reference,
    businessName,
    stage: storefrontOrderStage({ status: row.status, order }),
    status: row.status,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    customerName: row.customerName,
    customerPhoneMasked: maskPhone(row.customerPhone),
    fulfilment: row.fulfilment === "DELIVERY" ? "delivery" : "pickup",
    deliveryAddress: row.deliveryAddress,
    notes: row.notes,
    currencyCode: row.currencyCode,
    observedSubtotalMinor: row.observedSubtotalMinor,
    staffResponse: row.staffResponse,
    lines: row.lines.map((line) => ({
      offeringId: line.offeringId,
      itemId: line.catalogItemId,
      itemName: line.itemName,
      optionName: line.optionName,
      unitLabel: line.unitLabel,
      quantity: line.quantity.toString(),
      observedUnitPriceMinor: line.observedUnitPriceMinor,
      availability: line.observedAvailability.toLowerCase() as
        | "in_stock"
        | "low_stock"
        | "unknown",
    })),
    messages: row.messages.map((message) => ({
      id: message.id,
      author: message.author === "STAFF" ? "business" : "you",
      body: message.body,
      at: message.createdAt.toISOString(),
    })),
    order: order
      ? {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          subtotalMinor: order.subtotalMinor,
          deliveryFeeMinor: order.serviceChargeMinor,
          discountMinor: order.discountMinor,
          taxMinor: order.taxMinor,
          totalMinor: order.totalMinor,
          paidMinor: order.amountPaidMinor,
          balanceMinor: Math.max(0, order.totalMinor - order.amountPaidMinor),
          currencyCode: order.currencyCode,
          paymentLink:
            link && link.expiresAt.getTime() > Date.now()
              ? {
                  id: link.id,
                  expiresAt: link.expiresAt,
                  amountMinor: link.amountMinor,
                }
              : null,
          paymentReport: report
            ? {
                status: report.status,
                claimedAmountMinor: report.claimedAmountMinor,
                receivedAmountMinor: report.receivedAmountMinor,
              }
            : null,
        }
      : null,
  }
}
export type StorefrontOrderReceipt = ReturnType<typeof projectReceipt>

async function hostTenant(db: DbClient, host: string) {
  const current = await loadLiveStorefrontForHost(db, host, undefined, {})
  return current
    ? {
        tenantId: current.site.release.tenantId,
        storeId: current.site.storeId,
        businessName: current.storefront.name,
      }
    : null
}

/**
 * Guest receipt: the capability token must belong to a request of the business
 * behind this Host. A token from another business is simply not found.
 */
export async function getStorefrontOrderReceipt(
  db: DbClient,
  input: { host: string; token: string },
) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(input.token)) return null
  const business = await hostTenant(db, input.host)
  if (!business) return null
  const row = await db.storefrontOrderRequest.findFirst({
    where: {
      receiptTokenDigest: storefrontReceiptDigest(input.token),
      tenantId: business.tenantId,
      storeId: business.storeId,
    },
    select: receiptSelect,
  })
  return row ? projectReceipt(row, business.businessName) : null
}

/** Verified customer history for this business only. */
export async function listStorefrontCustomerOrders(
  db: DbClient,
  input: { tenantId: string; customerId: string; take?: number },
) {
  const rows = await db.storefrontOrderRequest.findMany({
    where: { tenantId: input.tenantId, customerId: input.customerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(input.take ?? 20, 50),
    select: {
      id: true,
      reference: true,
      status: true,
      createdAt: true,
      currencyCode: true,
      observedSubtotalMinor: true,
      lines: { select: { itemName: true }, take: 3 },
      confirmedOrder: { select: { status: true, totalMinor: true } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    stage: storefrontOrderStage({
      status: row.status,
      order: row.confirmedOrder,
    }),
    createdAt: row.createdAt.toISOString(),
    currencyCode: row.currencyCode,
    totalMinor: row.confirmedOrder?.totalMinor ?? row.observedSubtotalMinor,
    summary: row.lines.map((line) => line.itemName).join(", "),
  }))
}

/** Customer reply to a further-information request. Returns the request to review. */
export async function replyToStorefrontOrderRequest(
  db: PrismaClient,
  input: { host: string; token: string; reply: unknown },
) {
  const value = storefrontRequestReplySchema.parse(input.reply)
  await assertStoreConversationTextScreened(value.body)
  const business = await hostTenant(db, input.host)
  if (!business)
    throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
  return db.$transaction(async (tx) => {
    const row = await tx.storefrontOrderRequest.findFirst({
      where: {
        receiptTokenDigest: storefrontReceiptDigest(input.token),
        tenantId: business.tenantId,
      },
      select: { id: true, status: true, revision: true, storeId: true },
    })
    if (!row) throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
    const previous = await tx.storefrontRequestMessage.findUnique({
      where: {
        tenantId_clientMessageId: {
          tenantId: business.tenantId,
          clientMessageId: value.clientMessageId,
        },
      },
      select: { id: true, orderRequestId: true },
    })
    if (previous?.orderRequestId === row.id)
      return { status: row.status, revision: row.revision, replayed: true }
    if (row.status !== "NEEDS_INFORMATION")
      throw new StorefrontOrderError(
        "INVALID_STATE",
        "This request isn't waiting for a reply.",
      )
    const updated = await tx.storefrontOrderRequest.updateMany({
      where: {
        id: row.id,
        revision: value.expectedRevision,
        status: "NEEDS_INFORMATION",
      },
      data: { status: "SUBMITTED", revision: { increment: 1 } },
    })
    if (updated.count !== 1)
      throw new StorefrontOrderError(
        "STALE",
        "This request changed. Refresh to see the latest.",
      )
    const message = await tx.storefrontRequestMessage.create({
      data: {
        tenantId: business.tenantId,
        kind: "ORDER",
        orderRequestId: row.id,
        author: "CUSTOMER",
        body: value.body,
        clientMessageId: value.clientMessageId,
      },
      select: { id: true },
    })
    await tx.storefrontMerchantAlert.create({
      data: {
        tenantId: business.tenantId,
        storeId: row.storeId,
        kind: "ORDER",
        orderRequestId: row.id,
        dedupeKey: `order-request:${row.id}:reply:${message.id}`,
      },
    })
    return {
      status: "SUBMITTED" as const,
      revision: value.expectedRevision + 1,
      replayed: false,
    }
  }, TX())
}

export async function withdrawStorefrontOrderRequest(
  db: PrismaClient,
  input: { host: string; token: string; request: unknown },
) {
  const value = storefrontWithdrawSchema.parse(input.request)
  const business = await hostTenant(db, input.host)
  if (!business)
    throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
  const updated = await db.storefrontOrderRequest.updateMany({
    where: {
      receiptTokenDigest: storefrontReceiptDigest(input.token),
      tenantId: business.tenantId,
      revision: value.expectedRevision,
      status: { in: ["SUBMITTED", "NEEDS_INFORMATION"] },
    },
    data: {
      status: "WITHDRAWN",
      revision: { increment: 1 },
      decidedAt: new Date(),
    },
  })
  if (updated.count !== 1)
    throw new StorefrontOrderError(
      "STALE",
      "This request can no longer be withdrawn. Refresh to see the latest.",
    )
  return { status: "WITHDRAWN" as const }
}

/** Explicit link of a guest request to a verified customer of the same business. */
export async function linkStorefrontOrderToCustomer(
  db: DbClient,
  input: { host: string; token: string; tenantId: string; customerId: string },
) {
  const business = await hostTenant(db, input.host)
  if (!business || business.tenantId !== input.tenantId)
    throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
  const customer = await db.storefrontCustomer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId },
    select: { id: true },
  })
  if (!customer)
    throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
  const updated = await db.storefrontOrderRequest.updateMany({
    where: {
      receiptTokenDigest: storefrontReceiptDigest(input.token),
      tenantId: input.tenantId,
      OR: [{ customerId: null }, { customerId: input.customerId }],
    },
    data: { customerId: input.customerId },
  })
  if (updated.count !== 1)
    throw new StorefrontOrderError(
      "INVALID_STATE",
      "This request already belongs to another account.",
    )
  return { linked: true }
}

// ---------------------------------------------------------------- Staff side

export type StorefrontStaffScope = {
  tenantId: string
  /** Stores this staff member may act for (fresh from tenant context). */
  storeIds: readonly string[]
  actorUserId: string
}

const staffStatus = {
  open: ["SUBMITTED", "NEEDS_INFORMATION"],
  confirmed: ["CONFIRMED"],
  closed: ["DECLINED", "WITHDRAWN"],
} as const

export async function listStorefrontOrderRequests(
  db: DbClient,
  input: {
    tenantId: string
    storeIds: readonly string[]
    filter?: "open" | "confirmed" | "closed" | "all"
    cursor?: string
    take?: number
  },
) {
  const take = Math.min(Math.max(input.take ?? 25, 1), 50)
  const filter = input.filter ?? "open"
  const rows = await db.storefrontOrderRequest.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: { in: [...input.storeIds] },
      ...(filter === "all" ? {} : { status: { in: [...staffStatus[filter]] } }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      reference: true,
      status: true,
      revision: true,
      customerName: true,
      fulfilment: true,
      currencyCode: true,
      observedSubtotalMinor: true,
      createdAt: true,
      storeId: true,
      _count: { select: { lines: true } },
      confirmedOrder: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          totalMinor: true,
        },
      },
      alerts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, lastError: true },
      },
    },
  })
  const counts = await db.storefrontOrderRequest.groupBy({
    by: ["status"],
    where: { tenantId: input.tenantId, storeId: { in: [...input.storeIds] } },
    _count: { _all: true },
  })
  return {
    items: rows.slice(0, take).map((row) => ({
      ...row,
      stage: storefrontOrderStage({
        status: row.status,
        order: row.confirmedOrder,
      }),
      lineCount: row._count.lines,
      alert: row.alerts[0] ?? null,
    })),
    nextCursor: rows.length > take ? (rows[take - 1]?.id ?? null) : null,
    counts: Object.fromEntries(
      counts.map((entry) => [entry.status, entry._count._all]),
    ) as Partial<Record<string, number>>,
  }
}

/** Staff review: saved request plus the current price/stock facts it would confirm at. */
export async function getStorefrontOrderRequestForStaff(
  db: PrismaClient,
  input: { tenantId: string; storeIds: readonly string[]; requestId: string },
) {
  const row = await db.storefrontOrderRequest.findFirst({
    where: {
      id: input.requestId,
      tenantId: input.tenantId,
      storeId: { in: [...input.storeIds] },
    },
    select: {
      ...receiptSelect,
      customerEmail: true,
      siteId: true,
      alerts: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          attemptCount: true,
          lastError: true,
          sentAt: true,
          createdAt: true,
        },
      },
      store: { select: { name: true, currencyCode: true } },
    },
  })
  if (!row) return null
  const tenant = await db.tenant.findFirst({
    where: { id: input.tenantId },
    select: {
      name: true,
      metadata: true,
      subscription: {
        select: {
          plan: { select: { key: true } },
          provider: true,
          status: true,
          billingSubscriptionId: true,
          currentPeriodEndsAt: true,
        },
      },
    },
  })
  const plan = findRetailOpsPlan(
    resolveRetailOpsPlanId({
      metadata: tenant?.metadata,
      subscription: tenant?.subscription,
    }),
  )
  const facts = await db.$transaction(
    (tx) =>
      readStorefrontPurchaseFacts(
        tx,
        {
          tenantId: input.tenantId,
          storeId: row.storeId,
          storefrontItems: plan?.limits.storefrontItems ?? null,
        },
        row.lines.map((line) => ({
          itemId: line.catalogItemId,
          offeringId: line.offeringId,
        })),
      ),
    TX(),
  )
  return {
    ...projectReceipt(row, tenant?.name ?? row.store.name),
    id: row.id,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    storeName: row.store.name,
    alerts: row.alerts,
    orderId: row.confirmedOrder?.id ?? null,
    current: row.lines.map((line) => {
      const fact = facts.get(line.offeringId)
      return {
        offeringId: line.offeringId,
        available: Boolean(fact),
        priceMinor: fact?.priceMinor ?? null,
        priceChanged: !!fact && fact.priceMinor !== line.observedUnitPriceMinor,
        stock: fact?.stock ?? ("unknown" as const),
        enoughStock:
          !fact ||
          fact.availableQuantity === null ||
          compareExactDecimals(
            fact.availableQuantity,
            line.quantity.toString(),
          ) >= 0,
      }
    }),
  }
}

async function lockStaffRequest(
  tx: Prisma.TransactionClient,
  scope: StorefrontStaffScope,
  requestId: string,
) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "StorefrontOrderRequest"
    WHERE "id" = ${requestId} AND "tenantId" = ${scope.tenantId}
    FOR UPDATE`
  if (!locked.length)
    throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
  const row = await tx.storefrontOrderRequest.findFirst({
    where: { id: requestId, tenantId: scope.tenantId },
    include: { lines: { orderBy: { position: "asc" } } },
  })
  if (!row || !scope.storeIds.includes(row.storeId))
    throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
  return row
}

/**
 * Exactly-once conversion. The row lock serializes staff members; the Order's
 * clientOrderId makes a retried confirmation return the same Order.
 */
export async function confirmStorefrontOrderRequest(
  db: PrismaClient,
  scope: StorefrontStaffScope,
  input: {
    requestId: string
    expectedRevision: number
    deliveryFeeMinor?: number
    /** Staff reviewed and accepts current prices that differ from what the customer saw. */
    acceptCurrentPrices?: boolean
  },
) {
  if (
    input.deliveryFeeMinor !== undefined &&
    (!Number.isSafeInteger(input.deliveryFeeMinor) ||
      input.deliveryFeeMinor < 0)
  )
    throw new StorefrontOrderError("INVALID", "Enter a valid delivery fee.")
  return db.$transaction(async (tx) => {
    const row = await lockStaffRequest(tx, scope, input.requestId)
    if (row.status === "CONFIRMED" && row.confirmedOrderId)
      return { orderId: row.confirmedOrderId, replayed: true }
    if (row.status !== "SUBMITTED" && row.status !== "NEEDS_INFORMATION")
      throw new StorefrontOrderError(
        "INVALID_STATE",
        "This request is no longer waiting for review.",
      )
    if (row.revision !== input.expectedRevision)
      throw new StorefrontOrderError(
        "STALE",
        "This request changed while you were reviewing it. Refresh and check again.",
      )
    if (row.fulfilment === "DELIVERY" && input.deliveryFeeMinor === undefined)
      throw new StorefrontOrderError(
        "INVALID",
        "Enter the delivery fee (use 0 for free delivery).",
      )
    const tenant = await tx.tenant.findFirst({
      where: { id: scope.tenantId },
      select: {
        metadata: true,
        subscription: {
          select: {
            plan: { select: { key: true } },
            provider: true,
            status: true,
            billingSubscriptionId: true,
            currentPeriodEndsAt: true,
          },
        },
      },
    })
    const plan = findRetailOpsPlan(
      resolveRetailOpsPlanId({
        metadata: tenant?.metadata,
        subscription: tenant?.subscription,
      }),
    )
    const facts = await readStorefrontPurchaseFacts(
      tx,
      {
        tenantId: scope.tenantId,
        storeId: row.storeId,
        storefrontItems: plan?.limits.storefrontItems ?? null,
      },
      row.lines.map((line) => ({
        itemId: line.catalogItemId,
        offeringId: line.offeringId,
      })),
    )
    const issues: StorefrontOrderLineIssue[] = []
    for (const line of row.lines) {
      const fact = facts.get(line.offeringId)
      if (!fact) {
        issues.push({ offeringId: line.offeringId, reason: "unavailable" })
        continue
      }
      if (fact.priceMinor === null) {
        issues.push({ offeringId: line.offeringId, reason: "price_on_request" })
        continue
      }
      if (
        fact.priceMinor !== line.observedUnitPriceMinor &&
        !input.acceptCurrentPrices
      )
        issues.push({
          offeringId: line.offeringId,
          reason: "price_changed",
          currentUnitPriceMinor: fact.priceMinor,
        })
    }
    if (issues.some((issue) => issue.reason === "price_changed"))
      throw new StorefrontOrderError(
        "PRICE_CHANGED",
        "Prices changed since the customer sent this request. Review the current prices before confirming.",
        { issues },
      )
    if (issues.length)
      throw new StorefrontOrderError(
        "LINES_CHANGED",
        "Some items are no longer available to sell. Ask the customer or decline.",
        { issues },
      )
    const address = row.deliveryAddress
      ? ` Deliver to: ${row.deliveryAddress}.`
      : ""
    const notes = `Storefront request ${row.reference}.${address}${row.notes ? ` Customer note: ${row.notes}` : ""}`
    let order: Awaited<ReturnType<typeof createCommercialOrderInTransaction>>
    try {
      order = await createCommercialOrderInTransaction(tx, {
        actorUserId: scope.actorUserId,
        clientOrderId: `storefront-request:${row.id}`,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        ...(row.customerEmail ? { customerEmail: row.customerEmail } : {}),
        lines: row.lines.map((line) => {
          const fact = facts.get(line.offeringId) as CurrentLine
          return {
            offeringId: line.offeringId,
            quantity: line.quantity.toString(),
            expectedFixedPriceMinor: fact.priceMinor ?? undefined,
            ...(fact.configurationVersionId
              ? { expectedConfigurationVersionId: fact.configurationVersionId }
              : {}),
          }
        }),
        notes: notes.slice(0, 2000),
        schemaVersion: 1,
        serviceChargeMinor: input.deliveryFeeMinor ?? 0,
        storeId: row.storeId,
        tenantId: scope.tenantId,
      })
    } catch (error) {
      const code = (error as { code?: string }).code
      if (
        code === "INSUFFICIENT_STOCK" ||
        code === "REVISION_CONFLICT" ||
        code === "STALE_CONFIGURATION" ||
        code === "INVALID_UNIT_CONFIGURATION"
      )
        throw new StorefrontOrderError(
          "STOCK_CONFLICT",
          code === "STALE_CONFIGURATION"
            ? "Stock isn't recorded for one of these items yet. Record its stock, then confirm."
            : "There isn't enough recorded stock to confirm this now. Update stock or ask the customer.",
        )
      throw error
    }
    await tx.storefrontOrderRequest.update({
      where: { id: row.id },
      data: {
        status: "CONFIRMED",
        revision: { increment: 1 },
        confirmedOrderId: order.id,
        confirmedAt: new Date(),
        confirmedByUserId: scope.actorUserId,
        decidedAt: new Date(),
        decidedByUserId: scope.actorUserId,
        deliveryFeeMinor: input.deliveryFeeMinor ?? null,
      },
    })
    return { orderId: order.id, replayed: false }
  }, TX())
}

/** Decline (with a customer-facing reason) or ask for more information. */
export async function updateStorefrontOrderRequestDisposition(
  db: PrismaClient,
  scope: StorefrontStaffScope,
  input: {
    requestId: string
    expectedRevision: number
    action: "decline" | "request_information"
    message: string
    clientMessageId: string
  },
) {
  const message = input.message.trim()
  if (message.length < 3 || message.length > 800)
    throw new StorefrontOrderError(
      "INVALID",
      input.action === "decline"
        ? "Tell the customer why (3–800 characters)."
        : "Write your question (3–800 characters).",
    )
  return db.$transaction(async (tx) => {
    const row = await lockStaffRequest(tx, scope, input.requestId)
    const previous = await tx.storefrontRequestMessage.findUnique({
      where: {
        tenantId_clientMessageId: {
          tenantId: scope.tenantId,
          clientMessageId: input.clientMessageId,
        },
      },
      select: { orderRequestId: true },
    })
    if (previous?.orderRequestId === row.id)
      return { status: row.status, revision: row.revision, replayed: true }
    if (row.status !== "SUBMITTED" && row.status !== "NEEDS_INFORMATION")
      throw new StorefrontOrderError(
        "INVALID_STATE",
        "This request is no longer waiting for review.",
      )
    if (row.revision !== input.expectedRevision)
      throw new StorefrontOrderError(
        "STALE",
        "This request changed while you were reviewing it. Refresh and check again.",
      )
    const status =
      input.action === "decline" ? "DECLINED" : ("NEEDS_INFORMATION" as const)
    await tx.storefrontOrderRequest.update({
      where: { id: row.id },
      data: {
        status,
        staffResponse: message,
        revision: { increment: 1 },
        ...(status === "DECLINED"
          ? { decidedAt: new Date(), decidedByUserId: scope.actorUserId }
          : {}),
      },
    })
    await tx.storefrontRequestMessage.create({
      data: {
        tenantId: scope.tenantId,
        kind: "ORDER",
        orderRequestId: row.id,
        author: "STAFF",
        authorUserId: scope.actorUserId,
        body: message,
        clientMessageId: input.clientMessageId,
      },
    })
    return { status, revision: row.revision + 1, replayed: false }
  }, TX())
}

/** Pending storefront requests for the in-app notification surface. */
export async function countPendingStorefrontRequests(
  db: DbClient,
  input: { tenantId: string; storeIds: readonly string[] },
) {
  const [orders, services] = await Promise.all([
    db.storefrontOrderRequest.count({
      where: {
        tenantId: input.tenantId,
        storeId: { in: [...input.storeIds] },
        status: "SUBMITTED",
      },
    }),
    db.storefrontServiceRequestContext.count({
      where: {
        tenantId: input.tenantId,
        serviceRequest: {
          storeId: { in: [...input.storeIds] },
          status: "SUBMITTED",
        },
      },
    }),
  ])
  return { orders, services, total: orders + services }
}
