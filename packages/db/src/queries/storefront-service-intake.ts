import { storefrontServiceRequestSchema } from "@ewatrade/service-commerce"
import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog"
import { getStorefrontServiceForm } from "./public-storefront-service-request"
import { evaluateServiceCommercePolicyInTransaction } from "./service-commerce-policy"
import { submitPublicServiceRequest } from "./service-public"
import { assertStoreConversationTextScreened } from "./store-conversation-text-safety"
import { loadLiveStorefrontForHost } from "./storefront-factory-loader"
import { siteContentHash } from "./storefront-sites"
import type { DbClient } from "./types"

function unavailable(): never {
  throw new CatalogError(
    "PUBLIC_TOKEN_INVALID",
    "Service requests are unavailable for this storefront.",
  )
}

/** Verified Host → published Site/Store → current public items → active merchant form. */
export async function getStorefrontServiceIntake(
  db: DbClient,
  host: string,
  itemId?: string,
) {
  const current = await loadLiveStorefrontForHost(
    db,
    host,
    undefined,
    itemId ? { item: itemId } : {},
  )
  const entry = current?.storefront.serviceRequestEntry
  if (!current || !entry) return null
  const { site, storefront } = current
  if (site.release.contentHash !== siteContentHash(site.release.composition))
    return null
  const form = await getStorefrontServiceForm(db, {
    tenantId: site.release.tenantId,
    storeId: site.storeId,
  })
  if (!form || form.formId !== entry.formId) return null
  const items = [
    ...storefront.items,
    ...(storefront.highlightedItem ? [storefront.highlightedItem] : []),
  ]
  const publicIds = new Set(
    items
      .filter((item) => item.kind === "SERVICE")
      .flatMap((item) => item.options.map((option) => option.id)),
  )
  const offerings = form.offerings.filter((offering) =>
    publicIds.has(offering.id),
  )
  if (!offerings.length) return null
  return {
    form: { ...form, offerings },
    site: {
      id: site.siteId,
      releaseId: site.release.id,
      storeId: site.storeId,
      tenantId: site.release.tenantId,
    },
    businessName: storefront.name,
    whatsAppPhone: storefront.whatsAppPhone,
  }
}

/** No conversation, guest identity, chat Terms or age declaration is created. */
export async function submitStorefrontServiceRequest(
  db: PrismaClient,
  input: unknown,
  host: string,
  extras: {
    /** Customer's preferred date. A request only; never a booking. */
    requestedAt?: Date
    /** Runs inside the canonical transaction after scope rechecks (create and replay). */
    onSaved?: (
      tx: Prisma.TransactionClient,
      saved: { id: string; tenantId: string; storeId: string; siteId: string },
    ) => Promise<void>
  } = {},
) {
  const value = storefrontServiceRequestSchema.parse(input)
  const current = await getStorefrontServiceIntake(db, host, value.itemId)
  const lines = value.lines ?? [
    { offeringId: value.offeringId, quantity: value.quantity },
  ]
  if (!current || current.form.formId !== value.formId) unavailable()
  const chosen = lines.map((line) => {
    const offering = current.form.offerings.find(
      (option) =>
        option.id === line.offeringId && option.catalogItemId === value.itemId,
    )
    if (!offering) unavailable()
    try {
      parseExactDecimal(line.quantity, {
        allowZero: false,
        maxScale: offering.quantityScale,
      })
    } catch {
      throw new CatalogError(
        "INVALID_ORDER",
        "Enter a quantity supported by this service.",
      )
    }
    return { line, offering }
  })
  const offering = chosen[0]?.offering
  if (!offering) unavailable()
  await assertStoreConversationTextScreened(value.customerName)
  if (value.details) await assertStoreConversationTextScreened(value.details)
  const request = await submitPublicServiceRequest(
    db,
    {
      clientRequestId: value.clientRequestId,
      customerName: value.customerName,
      customerPhone: value.customerPhone,
      details: value.details || undefined,
      channelOrigin: "web",
      expectedScope: {
        tenantId: current.site.tenantId,
        storeId: current.site.storeId,
      },
      formId: current.form.formId,
      lines,
      ...(extras.requestedAt ? { requestedAt: extras.requestedAt } : {}),
    },
    {
      onRequest: async (tx, saved) => {
        // Recheck current authority on create, replay and concurrent-create recovery.
        const scope = current.site
        await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${scope.tenantId} FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "TenantSubscription" WHERE "tenantId" = ${scope.tenantId} FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${scope.storeId} FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "Site" WHERE "id" = ${scope.id} FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "ServiceRequestForm" WHERE "id" = ${current.form.formId} FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "CatalogItem" WHERE "id" = ${value.itemId} FOR SHARE`
        const ids = lines.map((line) => line.offeringId).sort()
        await tx.$queryRaw`SELECT "id" FROM "SellableOffering" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "SellableVariant" WHERE "id" IN (SELECT "variantId" FROM "SellableOffering" WHERE "id" IN (${Prisma.join(ids)})) ORDER BY "id" FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "ServiceRequestFormOffering" WHERE "requestFormId" = ${value.formId} AND "offeringId" IN (${Prisma.join(ids)}) ORDER BY "id" FOR SHARE`
        await tx.$queryRaw`SELECT "id" FROM "StoreOfferingAvailability" WHERE "storeId" = ${scope.storeId} AND "offeringId" IN (${Prisma.join(ids)}) ORDER BY "id" FOR SHARE`
        const fresh = await getStorefrontServiceIntake(tx, host, value.itemId)
        if (
          !fresh ||
          fresh.site.id !== scope.id ||
          fresh.site.releaseId !== scope.releaseId ||
          fresh.form.formId !== value.formId ||
          !lines.every((line) =>
            fresh.form.offerings.some(
              (option) =>
                option.id === line.offeringId &&
                option.catalogItemId === value.itemId,
            ),
          )
        )
          unavailable()
        const ownRequest = await tx.serviceRequest.findFirst({
          where: {
            id: saved.id,
            requestFormId: value.formId,
            storeId: scope.storeId,
            tenantId: scope.tenantId,
          },
          select: { id: true },
        })
        if (!ownRequest) unavailable()
        await extras.onSaved?.(tx, {
          id: saved.id,
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          siteId: scope.id,
        })
      },
    },
  )
  const receiptLines = chosen.map(({ line, offering }) => {
    const total =
      offering.pricingPolicy === "fixed" && offering.fixedPriceMinor !== null
        ? multiplyExactDecimals(String(offering.fixedPriceMinor), line.quantity)
        : null
    return {
      offeringId: offering.id,
      serviceName: offering.catalogItemName,
      optionName: offering.variantName,
      quantity: line.quantity,
      estimatedTotalMinor:
        total !== null &&
        /^\d+$/.test(total) &&
        Number.isSafeInteger(Number(total))
          ? Number(total)
          : null,
      currencyCode: current.form.store.currencyCode,
    }
  })
  const knownTotal = receiptLines.every(
    (line) => line.estimatedTotalMinor !== null,
  )
    ? receiptLines.reduce(
        (sum, line) => sum + BigInt(line.estimatedTotalMinor ?? 0),
        BigInt(0),
      )
    : null
  return {
    requestId: request.id,
    businessName: current.businessName,
    customerName: value.customerName,
    customerPhone: value.customerPhone,
    details: value.details,
    serviceName: offering.catalogItemName,
    optionName: offering.variantName,
    quantity: value.quantity,
    lines: receiptLines,
    estimatedTotalMinor:
      knownTotal !== null && knownTotal <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(knownTotal)
        : null,
    currencyCode: current.form.store.currencyCode,
    whatsAppPhone: current.whatsAppPhone,
  }
}

export async function isStorefrontServiceIntakeAllowed(
  db: DbClient,
  scope: { tenantId: string; storeId: string },
) {
  const result = await evaluateServiceCommercePolicyInTransaction(db, {
    ...scope,
    actorUserId: "public_storefront_service",
    channel: "web",
    purpose: "storefront_service_form_projection",
    subject: "intake",
    vertical: "service",
  })
  return result.outcome === "allowed"
}
