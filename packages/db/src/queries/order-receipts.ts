import {
  type OrderReceipt,
  type ReceiptSettings,
  defaultReceiptSettings,
  isReceiptOrderEligible,
  readReceiptSettings,
  receiptPaymentLabel,
  receiptSettingsSchema,
} from "@ewatrade/order-receipts"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog"

export async function getOrderReceiptSettings(
  db: PrismaClient,
  input: { tenantId: string; storeId: string },
) {
  const store = await db.store.findFirst({
    where: { id: input.storeId, tenantId: input.tenantId },
    select: {
      id: true,
      name: true,
      metadata: true,
      currencyCode: true,
      tenant: { select: { name: true, metadata: true } },
    },
  })
  if (!store)
    throw new CatalogError(
      "STORE_NOT_FOUND",
      "Store not found for this business.",
    )
  const business = readReceiptSettings(store.tenant.metadata) ?? {
    ...defaultReceiptSettings,
  }
  const override = readReceiptSettings(store.metadata)
  return {
    business,
    override,
    effective: override ?? business,
    source: override ? ("store" as const) : ("business" as const),
    storeId: store.id,
    storeName: store.name,
    currencyCode: store.currencyCode,
    businessName: store.tenant.name,
  }
}

export async function saveOrderReceiptSettings(
  db: PrismaClient,
  input: {
    tenantId: string
    storeId: string
    scope: "business" | "store"
    settings: ReceiptSettings | null
  },
) {
  if (input.scope === "business" && input.settings === null)
    throw new CatalogError(
      "INVALID_ORDER",
      "Business defaults cannot be removed.",
    )
  const settings =
    input.settings === null ? null : receiptSettingsSchema.parse(input.settings)
  // Update only this JSONB key at the database boundary; unrelated metadata is preserved.
  const value = settings === null ? null : JSON.stringify(settings)
  const changed =
    input.scope === "business"
      ? await db.$executeRaw(
          Prisma.sql`UPDATE "Tenant" SET "metadata" = jsonb_set(CASE WHEN jsonb_typeof("metadata") = 'object' THEN "metadata" ELSE '{}'::jsonb END, '{orderReceiptSettings}', ${value}::jsonb), "updatedAt" = NOW() WHERE "id" = ${input.tenantId} AND EXISTS (SELECT 1 FROM "Store" WHERE "id" = ${input.storeId} AND "tenantId" = ${input.tenantId})`,
        )
      : settings === null
        ? await db.$executeRaw(
            Prisma.sql`UPDATE "Store" SET "metadata" = (CASE WHEN jsonb_typeof("metadata") = 'object' THEN "metadata" ELSE '{}'::jsonb END) - 'orderReceiptSettings', "updatedAt" = NOW() WHERE "id" = ${input.storeId} AND "tenantId" = ${input.tenantId}`,
          )
        : await db.$executeRaw(
            Prisma.sql`UPDATE "Store" SET "metadata" = jsonb_set(CASE WHEN jsonb_typeof("metadata") = 'object' THEN "metadata" ELSE '{}'::jsonb END, '{orderReceiptSettings}', ${value}::jsonb), "updatedAt" = NOW() WHERE "id" = ${input.storeId} AND "tenantId" = ${input.tenantId}`,
          )
  if (changed !== 1)
    throw new CatalogError(
      "STORE_NOT_FOUND",
      "Store not found for this business.",
    )
  return getOrderReceiptSettings(db, input)
}

export async function getOrderReceipts(
  db: PrismaClient,
  input: { tenantId: string; storeId: string; orderIds: string[] },
) {
  if (
    input.orderIds.length < 1 ||
    input.orderIds.length > 20 ||
    new Set(input.orderIds).size !== input.orderIds.length
  ) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Select between 1 and 20 distinct Orders.",
    )
  }
  return db.$transaction(
    async (tx) => {
      const records = await tx.commercialOrder.findMany({
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          id: { in: input.orderIds },
        },
        include: {
          lines: {
            take: 201,
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: { snapshot: true },
          },
          payments: {
            take: 201,
            orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
          },
          store: {
            select: {
              name: true,
              metadata: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              region: true,
              supportPhone: true,
            },
          },
          tenant: { select: { name: true, metadata: true, timezone: true } },
        },
      })
      if (records.length !== input.orderIds.length)
        throw new CatalogError(
          "ORDER_NOT_FOUND",
          "One or more Orders are unavailable in this Store.",
        )
      if (records.some((order) => !isReceiptOrderEligible(order.status)))
        throw new CatalogError(
          "INVALID_ORDER",
          "Canceled or unconfirmed Orders cannot generate receipts.",
        )
      if (
        records.some(
          (order) => order.lines.length > 200 || order.payments.length > 200,
        ) ||
        records.reduce(
          (sum, order) => sum + order.lines.length + order.payments.length,
          0,
        ) > 1000
      ) {
        throw new CatalogError(
          "INVALID_ORDER",
          "This export is too large. Select fewer Orders or contact support for a large Order.",
        )
      }
      const generatedAt = new Date().toISOString()
      const byId = new Map(records.map((order) => [order.id, order]))
      return input.orderIds.map((id) => {
        const order = byId.get(id)
        if (!order)
          throw new CatalogError("ORDER_NOT_FOUND", "Order unavailable.")
        const override = readReceiptSettings(order.store.metadata)
        const settings = override ??
          readReceiptSettings(order.tenant.metadata) ?? {
            ...defaultReceiptSettings,
          }
        const refundedMinor = order.payments
          .filter((payment) => payment.type === "REFUND")
          .reduce((sum, payment) => sum + payment.amountMinor, 0)
        const receivedMinor = Math.max(0, order.amountPaidMinor)
        const receipt: OrderReceipt = {
          id: order.id,
          orderNumber: order.orderNumber,
          businessName: order.tenant.name,
          storeName: order.store.name,
          address: [
            order.store.addressLine1,
            order.store.addressLine2,
            order.store.city,
            order.store.region,
          ]
            .filter(Boolean)
            .join(", "),
          supportPhone: order.store.supportPhone,
          createdAt: order.createdAt.toISOString(),
          generatedAt,
          timezone: order.tenant.timezone,
          currencyCode: order.currencyCode,
          customerName: settings.showCustomerName
            ? order.customerName || "Walk-in customer"
            : null,
          subtotalMinor: order.subtotalMinor,
          discountMinor: order.discountMinor,
          taxMinor: order.taxMinor,
          serviceChargeMinor: order.serviceChargeMinor,
          totalMinor: order.totalMinor,
          receivedMinor,
          refundedMinor,
          balanceMinor: Math.max(0, order.totalMinor - receivedMinor),
          paymentLabel: receiptPaymentLabel({
            totalMinor: order.totalMinor,
            receivedMinor,
            refundedMinor,
            paymentCount: order.payments.length,
            sourcePaymentStatus: order.paymentStatus,
          }),
          settings,
          settingsSource: override ? "store" : "business",
          lines: order.lines.map((line) => ({
            id: line.id,
            name: [
              line.snapshot?.catalogItemName ??
                line.snapshot?.offeringName ??
                "Item",
              line.snapshot?.variantName &&
              line.snapshot.variantName.toLowerCase() !== "default"
                ? line.snapshot.variantName
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
            unitName: line.snapshot?.inventoryUnitName ?? null,
            quantity: line.quantity.toString(),
            unitPriceMinor: line.unitPriceMinor,
            note: line.snapshot?.note ?? null,
            totalMinor: line.totalMinor,
          })),
          payments: settings.showPaymentBreakdown
            ? order.payments.map((payment) => ({
                id: payment.id,
                method: payment.method.replaceAll("_", " ").toLowerCase(),
                type: payment.type,
                amountMinor: payment.amountMinor,
                recordedAt: payment.recordedAt.toISOString(),
              }))
            : [],
        }
        return receipt
      })
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
