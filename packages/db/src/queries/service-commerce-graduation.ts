import { createHash } from "node:crypto"

import {
  type ServiceCommerceCatalogGraduationFormValues,
  deriveCatalogGraduationReadiness,
} from "@ewatrade/service-commerce"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CatalogAvailabilityAttestationType,
  CatalogRecordStatus,
  InventoryUnitStockBehavior,
  MembershipRole,
  MembershipStatus,
  OfferingPricingPolicy,
  ServiceBookingPolicy,
  ServiceCommerceCatalogAdoptionMode,
  ServiceCommerceProfileStatus,
  ServiceCommerceStoreAuditEventType,
  ServiceWorkPolicy,
  StockBalanceKind,
  StockOperationType,
  UnitConfigurationStatus,
  WorkAuthorizationPolicy,
} from "../../generated/prisma/enums"
import { ServiceCommerceCatalogError } from "./service-commerce-catalog-source"
import { assertServiceCommercePolicyAllowedInTransaction } from "./service-commerce-policy"
import type { DbClient } from "./types"

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const

type GraduationScope = {
  actorUserId: string
  offeringId: string
  storeId: string
  tenantId: string
}

type GraduationCommandInput = GraduationScope &
  ServiceCommerceCatalogGraduationFormValues

type PublicationCommandInput = GraduationScope & {
  clientOperationId: string
  confirmed: true
  expectedOfferingRevision: number
  reason: string
}

const graduationGraph = {
  catalogItem: { include: { product: true, service: true } },
  productUnitOffering: {
    include: {
      inventoryUnit: { include: { configurationVersion: true } },
    },
  },
  serviceOffering: true,
  storeAvailability: true,
  variant: true,
} satisfies Prisma.SellableOfferingInclude

function stableJson(value: unknown): string {
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function commandHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function translateWriteConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2025")
  ) {
    throw new ServiceCommerceCatalogError(
      "CONFLICT",
      "Catalog graduation changed before this operation completed.",
    )
  }
  throw error
}

async function assertGraduationManager(tx: DbClient, input: GraduationScope) {
  const membership = await tx.membership.findFirst({
    select: { id: true },
    where: {
      role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
      status: MembershipStatus.ACTIVE,
      tenantId: input.tenantId,
      userId: input.actorUserId,
    },
  })
  if (!membership) {
    throw new ServiceCommerceCatalogError(
      "FORBIDDEN",
      "Active sales-management authority is required for Catalog graduation.",
    )
  }
}

async function loadGraduationContext(tx: DbClient, input: GraduationScope) {
  const [offering, store, profile] = await Promise.all([
    tx.sellableOffering.findFirst({
      include: graduationGraph,
      where: { id: input.offeringId, tenantId: input.tenantId },
    }),
    tx.store.findFirst({
      select: { currencyCode: true, id: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    }),
    tx.serviceCommerceStoreProfile.findFirst({
      select: { id: true, catalogAdoptionMode: true, status: true },
      where: { storeId: input.storeId, tenantId: input.tenantId },
    }),
  ])
  if (!offering || !store || !profile) {
    throw new ServiceCommerceCatalogError(
      "NOT_FOUND",
      "The Store or Catalog Offering is unavailable.",
    )
  }
  if (
    profile.status !== ServiceCommerceProfileStatus.ACTIVE ||
    profile.catalogAdoptionMode !==
      ServiceCommerceCatalogAdoptionMode.PROGRESSIVE
  ) {
    throw new ServiceCommerceCatalogError(
      "NOT_READY",
      "Progressive Catalog must be active before an Offering can graduate.",
    )
  }
  if (
    !offering.storeAvailability.some(
      (availability) => availability.storeId === input.storeId,
    ) &&
    offering.storeAvailability.some(
      (availability) => availability.storeId !== input.storeId,
    )
  ) {
    throw new ServiceCommerceCatalogError(
      "NOT_FOUND",
      "The Catalog Offering is not linked to this Store.",
    )
  }
  return { offering, profile, store }
}

async function assertGraduationPolicy(
  tx: DbClient,
  input: GraduationScope,
  subject: "catalog_publication" | "managed_inventory_graduation",
) {
  const sourceTypes = await tx.catalogSourceLineLink.findMany({
    distinct: ["sourceType"],
    select: { sourceType: true },
    where: {
      offeringId: input.offeringId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const verticals = new Set<"pharmacy" | "service">(
    sourceTypes.map((source) =>
      source.sourceType === "PRESCRIPTION_REQUEST" ? "pharmacy" : "service",
    ),
  )
  if (verticals.size === 0) {
    throw new ServiceCommerceCatalogError(
      "NOT_READY",
      "A verified customer-request source link is required before graduation.",
    )
  }
  for (const vertical of verticals) {
    await assertServiceCommercePolicyAllowedInTransaction(tx, {
      actorUserId: input.actorUserId,
      channel: "staff",
      purpose: `service_commerce_catalog_${subject}`,
      storeId: input.storeId,
      subject,
      tenantId: input.tenantId,
      vertical,
    })
  }
}

async function assertNoUnsafeCommitment(tx: DbClient, input: GraduationScope) {
  const commitment = await tx.catalogAvailabilityAttestation.findFirst({
    select: { id: true },
    where: {
      expiresAt: { gt: new Date() },
      offeringId: input.offeringId,
      storeId: input.storeId,
      supersededAt: null,
      tenantId: input.tenantId,
      type: CatalogAvailabilityAttestationType.MANUAL_PROCURE_TO_ORDER,
    },
  })
  if (commitment) {
    throw new ServiceCommerceCatalogError(
      "NOT_READY",
      "An unexpired procure-to-order commitment must be completed or withdrawn before graduation.",
    )
  }
}

function bookingPolicy(
  value: "booking_required" | "not_bookable" | "request_required",
) {
  return value === "booking_required"
    ? ServiceBookingPolicy.BOOKING_REQUIRED
    : value === "request_required"
      ? ServiceBookingPolicy.REQUEST_REQUIRED
      : ServiceBookingPolicy.NOT_BOOKABLE
}

function workPolicy(value: "charge_only" | "tracked") {
  return value === "tracked"
    ? ServiceWorkPolicy.TRACKED
    : ServiceWorkPolicy.CHARGE_ONLY
}

function authorizationPolicy(
  value: "after_required_payment" | "manual_release" | "on_order_confirmation",
) {
  return value === "after_required_payment"
    ? WorkAuthorizationPolicy.AFTER_REQUIRED_PAYMENT
    : value === "manual_release"
      ? WorkAuthorizationPolicy.MANUAL_RELEASE
      : WorkAuthorizationPolicy.ON_ORDER_CONFIRMATION
}

function snapshot(offering: {
  catalogItem: { category: string | null; status: CatalogRecordStatus }
  currencyCode: string
  fixedPriceMinor: number | null
  id: string
  revision: number
  status: CatalogRecordStatus
  variant: { name: string; status: CatalogRecordStatus }
}) {
  return {
    catalogStatus: offering.catalogItem.status,
    category: offering.catalogItem.category,
    currencyCode: offering.currencyCode,
    fixedPriceMinor: offering.fixedPriceMinor,
    offeringId: offering.id,
    offeringStatus: offering.status,
    revision: offering.revision,
    variantName: offering.variant.name,
    variantStatus: offering.variant.status,
  }
}

async function loadBalance(
  tx: DbClient,
  input: GraduationScope,
  productId?: string,
) {
  if (!productId) return null
  return tx.stockBalanceSource.findFirst({
    select: { id: true, onHandQuantity: true, revision: true },
    where: {
      productId,
      storeId: input.storeId,
      tenantId: input.tenantId,
      variantId: {
        in: await tx.sellableOffering
          .findMany({
            select: { variantId: true },
            where: { id: input.offeringId, tenantId: input.tenantId },
          })
          .then((items) => items.map((item) => item.variantId)),
      },
    },
  })
}

export async function getServiceCommerceCatalogGraduationReadiness(
  db: DbClient,
  input: GraduationScope,
) {
  await assertGraduationManager(db, input)
  const { offering, store } = await loadGraduationContext(db, input)
  await assertGraduationPolicy(db, input, "managed_inventory_graduation")
  const balance = await loadBalance(db, input, offering.catalogItem.product?.id)
  const draftKind = offering.catalogItem.product ? "product" : "service"
  const readiness = deriveCatalogGraduationReadiness({
    category: offering.catalogItem.category,
    currencyMatchesStore: offering.currencyCode === store.currencyCode,
    draftKind,
    fixedPriceMinor: offering.fixedPriceMinor,
    hasProductIdentifier: Boolean(
      offering.productUnitOffering?.sku ||
        offering.productUnitOffering?.barcode,
    ),
    hasProductUnit: Boolean(offering.productUnitOffering),
    hasVerifiedOpeningCount: Boolean(balance),
    serviceBookingPolicy: offering.serviceOffering
      ? offering.serviceOffering.bookingPolicy ===
        ServiceBookingPolicy.BOOKING_REQUIRED
        ? "booking_required"
        : offering.serviceOffering.bookingPolicy ===
            ServiceBookingPolicy.REQUEST_REQUIRED
          ? "request_required"
          : "not_bookable"
      : null,
    serviceDurationMinutes: offering.serviceOffering?.durationMinutes ?? null,
    serviceWorkPolicy: offering.serviceOffering
      ? offering.serviceOffering.workPolicy === ServiceWorkPolicy.TRACKED
        ? "tracked"
        : "charge_only"
      : null,
    variantName: offering.variant.name,
  })
  return {
    ...readiness,
    catalogItemId: offering.catalogItemId,
    currencyCode: offering.currencyCode,
    draftKind,
    fields: {
      barcode: offering.productUnitOffering?.barcode ?? null,
      bookingPolicy:
        readiness.canGraduate && offering.serviceOffering
          ? readiness.missingFacts.includes("service_booking_policy")
            ? null
            : offering.serviceOffering.bookingPolicy
          : (offering.serviceOffering?.bookingPolicy ?? null),
      category: offering.catalogItem.category,
      durationMinutes: offering.serviceOffering?.durationMinutes ?? null,
      fixedPriceMinor: offering.fixedPriceMinor,
      openingStockQuantity: balance?.onHandQuantity.toString() ?? null,
      sku: offering.productUnitOffering?.sku ?? null,
      variantName: offering.variant.name,
    },
    isGraduated: readiness.canGraduate,
    isPublished: offering.status === CatalogRecordStatus.ACTIVE,
    offeringId: offering.id,
    revision: offering.revision,
  }
}

export async function graduateServiceCommerceCatalogOffering(
  db: PrismaClient,
  input: GraduationCommandInput,
) {
  const hash = commandHash({ ...input, actorUserId: undefined })
  try {
    return await db.$transaction(async (tx) => {
      await assertGraduationManager(tx, input)
      const prior = await tx.catalogCommandReceipt.findUnique({
        where: {
          tenantId_clientOperationId: {
            clientOperationId: input.clientOperationId,
            tenantId: input.tenantId,
          },
        },
      })
      if (prior) {
        if (
          prior.payloadHash !== hash ||
          prior.commandType !== "GRADUATE_CATALOG_OFFERING"
        ) {
          throw new ServiceCommerceCatalogError(
            "IDEMPOTENCY_MISMATCH",
            "This graduation command identity was used with different input.",
          )
        }
        return getServiceCommerceCatalogGraduationReadiness(tx, input)
      }
      const { offering, profile, store } = await loadGraduationContext(
        tx,
        input,
      )
      if (offering.revision !== input.expectedOfferingRevision) {
        throw new ServiceCommerceCatalogError(
          "CONFLICT",
          "The Catalog Offering changed. Refresh before graduating it.",
        )
      }
      if (offering.status !== CatalogRecordStatus.DRAFT) {
        throw new ServiceCommerceCatalogError(
          "CONFLICT",
          "Only a private draft Offering can be graduated.",
        )
      }
      if (
        store.currencyCode !== input.currencyCode ||
        offering.currencyCode !== input.currencyCode
      ) {
        throw new ServiceCommerceCatalogError(
          "CONFLICT",
          "The reusable price currency must match the Store currency.",
        )
      }
      await assertGraduationPolicy(tx, input, "managed_inventory_graduation")
      await assertNoUnsafeCommitment(tx, input)
      const before = snapshot(offering)
      const priceChanged = offering.fixedPriceMinor !== input.fixedPriceMinor

      await tx.catalogItem.updateMany({
        data: { category: input.category.trim() },
        where: { id: offering.catalogItemId, tenantId: input.tenantId },
      })
      await tx.sellableVariant.updateMany({
        data: { name: input.variantName.trim() },
        where: {
          catalogItemId: offering.catalogItemId,
          id: offering.variantId,
        },
      })

      if (input.draftKind === "product") {
        const productId = offering.catalogItem.product?.id
        if (!productId || offering.serviceOffering) {
          throw new ServiceCommerceCatalogError(
            "INVALID_INPUT",
            "The graduation kind does not match the Catalog Offering.",
          )
        }
        const existingBalance = await loadBalance(tx, input, productId)
        if (existingBalance) {
          throw new ServiceCommerceCatalogError(
            "CONFLICT",
            "This Product already has an opening balance and cannot be graduated again.",
          )
        }
        let productUnit = offering.productUnitOffering
        let configurationVersionId =
          productUnit?.inventoryUnit.configurationVersionId
        let inventoryUnitId = productUnit?.inventoryUnitId
        let movementTransactionScale =
          productUnit?.inventoryUnit.transactionScale ?? input.transactionScale
        const quantity = parseExactDecimal(input.openingStockQuantity, {
          maxScale: movementTransactionScale,
        })
        if (!productUnit) {
          const configuration = await tx.unitConfigurationVersion.create({
            data: {
              canonicalBalanceScale: input.transactionScale,
              productId,
              status: UnitConfigurationStatus.CURRENT,
              version: 1,
            },
          })
          const inventoryUnit = await tx.inventoryUnit.create({
            data: {
              configurationVersionId: configuration.id,
              factor: "1",
              key: "canonical",
              name: input.canonicalUnitName.trim(),
              stockBehavior: InventoryUnitStockBehavior.CANONICAL_SHARED,
              symbol: input.canonicalUnitSymbol?.trim() || null,
              transactionScale: input.transactionScale,
            },
          })
          await tx.catalogProduct.updateMany({
            data: { currentUnitConfigurationVersionId: configuration.id },
            where: { catalogItemId: offering.catalogItemId, id: productId },
          })
          productUnit = await tx.productUnitOffering.create({
            data: {
              barcode: input.barcode?.trim() || null,
              inventoryUnitId: inventoryUnit.id,
              offeringId: offering.id,
              sku: input.sku?.trim() || null,
              tenantId: input.tenantId,
            },
            include: {
              inventoryUnit: { include: { configurationVersion: true } },
            },
          })
          configurationVersionId = configuration.id
          inventoryUnitId = inventoryUnit.id
          movementTransactionScale = input.transactionScale
        } else {
          const changed = await tx.productUnitOffering.updateMany({
            data: {
              barcode: input.barcode?.trim() || null,
              sku: input.sku?.trim() || null,
            },
            where: {
              id: productUnit.id,
              offeringId: offering.id,
              tenantId: input.tenantId,
            },
          })
          if (changed.count !== 1)
            throw new ServiceCommerceCatalogError(
              "CONFLICT",
              "The Product unit changed before graduation.",
            )
        }
        if (!configurationVersionId || !inventoryUnitId) {
          throw new ServiceCommerceCatalogError(
            "NOT_READY",
            "A current Product unit configuration is required.",
          )
        }
        const balance = await tx.stockBalanceSource.create({
          data: {
            inventoryUnitId,
            kind: StockBalanceKind.SHARED_POOL,
            onHandQuantity: quantity,
            productId,
            storeId: input.storeId,
            tenantId: input.tenantId,
            variantId: offering.variantId,
          },
        })
        const operation = await tx.stockOperation.create({
          data: {
            actorUserId: input.actorUserId,
            clientOperationId: `${input.clientOperationId}:opening-stock`,
            payloadHash: hash,
            reason: input.reason.trim(),
            source: "service_commerce_catalog_graduation",
            storeId: input.storeId,
            tenantId: input.tenantId,
            type: StockOperationType.OPENING_STOCK,
          },
        })
        await tx.stockMovement.create({
          data: {
            balanceSourceId: balance.id,
            configurationVersionId,
            enteredInventoryUnitId: inventoryUnitId,
            enteredQuantity: quantity,
            operationId: operation.id,
            previousOnHandQuantity: "0",
            resultingOnHandQuantity: quantity,
            signedCanonicalEffect: quantity,
            transactionScaleSnapshot: movementTransactionScale,
            unitFactorSnapshot: "1",
          },
        })
      } else {
        if (!offering.serviceOffering || offering.catalogItem.product) {
          throw new ServiceCommerceCatalogError(
            "INVALID_INPUT",
            "The graduation kind does not match the Catalog Offering.",
          )
        }
        await tx.serviceOffering.updateMany({
          data: {
            authorizationPolicy: authorizationPolicy(input.authorizationPolicy),
            bookingPolicy: bookingPolicy(input.bookingPolicy),
            durationMinutes: input.durationMinutes,
            guidance: input.guidance?.trim() || null,
            workPolicy: workPolicy(input.workPolicy),
          },
          where: { id: offering.serviceOffering.id, offeringId: offering.id },
        })
      }

      const changedOffering = await tx.sellableOffering.updateMany({
        data: {
          fixedPriceMinor: input.fixedPriceMinor,
          pricingPolicy: OfferingPricingPolicy.FIXED,
          revision: { increment: 1 },
        },
        where: {
          id: offering.id,
          revision: input.expectedOfferingRevision,
          status: CatalogRecordStatus.DRAFT,
          tenantId: input.tenantId,
        },
      })
      if (changedOffering.count !== 1)
        throw new ServiceCommerceCatalogError(
          "CONFLICT",
          "The Catalog Offering changed during graduation.",
        )
      await tx.storeOfferingAvailability.upsert({
        create: {
          isAvailable: false,
          offeringId: offering.id,
          storeId: input.storeId,
        },
        update: { isAvailable: false },
        where: {
          storeId_offeringId: {
            offeringId: offering.id,
            storeId: input.storeId,
          },
        },
      })
      if (priceChanged) {
        await tx.catalogPriceChange.create({
          data: {
            changedByUserId: input.actorUserId,
            currencyCode: input.currencyCode,
            offeringId: offering.id,
            previousPriceMinor: offering.fixedPriceMinor,
            priceMinor: input.fixedPriceMinor,
            reason: input.reason.trim(),
            tenantId: input.tenantId,
          },
        })
      }
      await tx.catalogAvailabilityAttestation.updateMany({
        data: { supersededAt: new Date() },
        where: {
          offeringId: offering.id,
          storeId: input.storeId,
          supersededAt: null,
          tenantId: input.tenantId,
        },
      })
      const after = {
        ...before,
        category: input.category.trim(),
        fixedPriceMinor: input.fixedPriceMinor,
        revision: offering.revision + 1,
        variantName: input.variantName.trim(),
      }
      await tx.serviceCommerceStoreAuditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          currentSnapshot: after,
          previousSnapshot: before,
          profileId: profile.id,
          reason: input.reason.trim(),
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: ServiceCommerceStoreAuditEventType.CATALOG_GRADUATED,
        },
      })
      await tx.catalogCommandReceipt.create({
        data: {
          catalogItemId: offering.catalogItemId,
          clientOperationId: input.clientOperationId,
          commandType: "GRADUATE_CATALOG_OFFERING",
          payloadHash: hash,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      return getServiceCommerceCatalogGraduationReadiness(tx, input)
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    if (error instanceof ServiceCommerceCatalogError) throw error
    translateWriteConflict(error)
  }
}

export async function publishServiceCommerceCatalogOffering(
  db: PrismaClient,
  input: PublicationCommandInput,
) {
  const hash = commandHash({ ...input, actorUserId: undefined })
  try {
    return await db.$transaction(async (tx) => {
      await assertGraduationManager(tx, input)
      const prior = await tx.catalogCommandReceipt.findUnique({
        where: {
          tenantId_clientOperationId: {
            clientOperationId: input.clientOperationId,
            tenantId: input.tenantId,
          },
        },
      })
      if (prior) {
        if (
          prior.payloadHash !== hash ||
          prior.commandType !== "PUBLISH_CATALOG_OFFERING"
        ) {
          throw new ServiceCommerceCatalogError(
            "IDEMPOTENCY_MISMATCH",
            "This publication command identity was used with different input.",
          )
        }
        return getServiceCommerceCatalogGraduationReadiness(tx, input)
      }
      const { offering, profile } = await loadGraduationContext(tx, input)
      if (offering.revision !== input.expectedOfferingRevision) {
        throw new ServiceCommerceCatalogError(
          "CONFLICT",
          "The Catalog Offering changed. Refresh before publishing it.",
        )
      }
      await assertGraduationPolicy(tx, input, "catalog_publication")
      await assertNoUnsafeCommitment(tx, input)
      const readiness = await getServiceCommerceCatalogGraduationReadiness(
        tx,
        input,
      )
      if (!readiness.canGraduate) {
        throw new ServiceCommerceCatalogError(
          "NOT_READY",
          "Complete every managed-operation fact before publication.",
        )
      }
      const before = snapshot(offering)
      const changed = await tx.sellableOffering.updateMany({
        data: {
          revision: { increment: 1 },
          status: CatalogRecordStatus.ACTIVE,
        },
        where: {
          id: offering.id,
          revision: input.expectedOfferingRevision,
          status: CatalogRecordStatus.DRAFT,
          tenantId: input.tenantId,
        },
      })
      if (changed.count !== 1)
        throw new ServiceCommerceCatalogError(
          "CONFLICT",
          "The Catalog Offering changed during publication.",
        )
      await tx.catalogItem.updateMany({
        data: { status: CatalogRecordStatus.ACTIVE },
        where: { id: offering.catalogItemId, tenantId: input.tenantId },
      })
      await tx.sellableVariant.updateMany({
        data: { status: CatalogRecordStatus.ACTIVE },
        where: {
          catalogItemId: offering.catalogItemId,
          id: offering.variantId,
        },
      })
      await tx.storeOfferingAvailability.upsert({
        create: {
          isAvailable: true,
          offeringId: offering.id,
          storeId: input.storeId,
        },
        update: { isAvailable: true },
        where: {
          storeId_offeringId: {
            offeringId: offering.id,
            storeId: input.storeId,
          },
        },
      })
      const after = {
        ...before,
        catalogStatus: CatalogRecordStatus.ACTIVE,
        offeringStatus: CatalogRecordStatus.ACTIVE,
        revision: offering.revision + 1,
        variantStatus: CatalogRecordStatus.ACTIVE,
      }
      await tx.serviceCommerceStoreAuditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          currentSnapshot: after,
          previousSnapshot: before,
          profileId: profile.id,
          reason: input.reason.trim(),
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: ServiceCommerceStoreAuditEventType.CATALOG_PUBLISHED,
        },
      })
      await tx.catalogCommandReceipt.create({
        data: {
          catalogItemId: offering.catalogItemId,
          clientOperationId: input.clientOperationId,
          commandType: "PUBLISH_CATALOG_OFFERING",
          payloadHash: hash,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      return getServiceCommerceCatalogGraduationReadiness(tx, input)
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    if (error instanceof ServiceCommerceCatalogError) throw error
    translateWriteConflict(error)
  }
}
