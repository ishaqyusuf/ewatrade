import { createHash, randomBytes } from "node:crypto"

import {
  assertDeliveryTransition,
  assertPickupTransition,
  encryptPrescriptionData,
  evaluateDeliveryZone,
  prescriptionDataFingerprint,
} from "@ewatrade/prescriptions"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CommerceQuoteFulfilmentType,
  CommerceQuoteSourceType,
  CommerceQuoteVersionStatus,
  DeliveryEligibilityStatus,
  OrderStatus,
  PaymentStatus,
  PrescriptionDeliveryEventType,
  PrescriptionDeliveryFeePolicy,
  PrescriptionDeliveryStatus,
  PrescriptionDeliveryZoneMatchType,
  PrescriptionPickupEventType,
  PrescriptionPickupStatus,
} from "../../generated/prisma/enums"
import { resolveCommerceQuoteAccess } from "./commerce-quotes"
import { assertAnyPrescriptionStoreRole } from "./prescription-settings"

export class PrescriptionFulfillmentError extends Error {
  constructor(
    readonly code:
      | "ADDRESS_INELIGIBLE"
      | "FULFILLMENT_CONFLICT"
      | "FULFILLMENT_NOT_FOUND"
      | "PICKUP_CODE_INVALID",
    message: string,
  ) {
    super(message)
  }
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function token() {
  return randomBytes(32).toString("base64url")
}

function pickupStatus(value: PrescriptionPickupStatus) {
  return value.toLowerCase() as Parameters<typeof assertPickupTransition>[0]
}

function deliveryStatus(value: PrescriptionDeliveryStatus) {
  return value.toLowerCase() as Parameters<typeof assertDeliveryTransition>[0]
}

export async function upsertPrescriptionDeliveryZone(
  db: PrismaClient,
  input: {
    actorUserId: string
    currencyCode: string
    feePolicy: "fixed" | "manual"
    fixedFeeMinor?: number
    matchType: "locality" | "postal_prefix"
    matchValues: string[]
    name: string
    priority?: number
    promiseText: string
    storeId: string
    tenantId: string
    zoneId?: string
  },
) {
  const values = [...new Set(input.matchValues.map((value) => value.trim()))]
    .filter(Boolean)
    .slice(0, 100)
  if (!values.length || !input.promiseText.trim()) {
    throw new PrescriptionFulfillmentError(
      "FULFILLMENT_CONFLICT",
      "A delivery match rule and promise are required.",
    )
  }
  const fixedFeeMinor = input.fixedFeeMinor
  if (
    input.feePolicy === "fixed" &&
    (!Number.isSafeInteger(fixedFeeMinor) ||
      fixedFeeMinor === null ||
      fixedFeeMinor === undefined ||
      fixedFeeMinor < 0)
  ) {
    throw new PrescriptionFulfillmentError(
      "FULFILLMENT_CONFLICT",
      "A valid fixed delivery fee is required.",
    )
  }
  const data = {
    currencyCode: input.currencyCode.toUpperCase(),
    feePolicy:
      input.feePolicy === "fixed"
        ? PrescriptionDeliveryFeePolicy.FIXED
        : PrescriptionDeliveryFeePolicy.MANUAL,
    fixedFeeMinor: input.feePolicy === "fixed" ? input.fixedFeeMinor : null,
    matchType:
      input.matchType === "locality"
        ? PrescriptionDeliveryZoneMatchType.LOCALITY
        : PrescriptionDeliveryZoneMatchType.POSTAL_PREFIX,
    matchValues: values,
    name: input.name.trim(),
    priority: input.priority ?? 0,
    promiseText: input.promiseText.trim(),
    updatedByUserId: input.actorUserId,
  }
  if (input.zoneId) {
    return db.prescriptionDeliveryZone.update({
      data,
      where: {
        id: input.zoneId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
  }
  return db.prescriptionDeliveryZone.create({
    data: {
      ...data,
      createdByUserId: input.actorUserId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
}

export async function listPrescriptionDeliveryZones(
  db: PrismaClient,
  input: { storeId: string; tenantId: string },
) {
  return db.prescriptionDeliveryZone.findMany({
    orderBy: [{ priority: "desc" }, { name: "asc" }],
    where: input,
  })
}

export async function revisePrescriptionQuoteForDelivery(
  db: PrismaClient,
  input: {
    acceptanceToken: string
    address: {
      addressLine1: string
      addressLine2?: string
      locality: string
      postalCode?: string
      recipientName: string
      recipientPhone: string
      region?: string
    }
  },
) {
  const access = await resolveCommerceQuoteAccess(db, input)
  const current = await db.commerceQuoteVersion.findFirst({
    include: {
      lines: true,
      quote: {
        include: {
          store: { include: { prescriptionSettings: true } },
        },
      },
    },
    where: {
      id: access.versionId,
      ...(access.storeId && access.tenantId
        ? {
            quote: {
              is: { storeId: access.storeId, tenantId: access.tenantId },
            },
          }
        : {}),
    },
  })
  if (
    !current ||
    current.quote.currentVersionId !== current.id ||
    current.status !== CommerceQuoteVersionStatus.ISSUED ||
    current.quote.sourceType !== CommerceQuoteSourceType.PRESCRIPTION_REQUEST ||
    !current.quote.store.prescriptionSettings?.deliveryEnabled
  ) {
    throw new PrescriptionFulfillmentError(
      "FULFILLMENT_CONFLICT",
      "Delivery is unavailable for this Quote.",
    )
  }
  const zones = await db.prescriptionDeliveryZone.findMany({
    where: { status: "ACTIVE", storeId: current.quote.storeId },
  })
  const result = evaluateDeliveryZone(
    zones.map((zone) => ({
      feePolicy: zone.feePolicy.toLowerCase() as "fixed" | "manual",
      fixedFeeMinor: zone.fixedFeeMinor,
      id: zone.id,
      matchType: zone.matchType.toLowerCase() as "locality" | "postal_prefix",
      matchValues: Array.isArray(zone.matchValues)
        ? zone.matchValues.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      priority: zone.priority,
      promiseText: zone.promiseText,
    })),
    input.address,
  )
  if (result.outcome === "manual_review") {
    const address = await db.prescriptionDeliveryAddress.upsert({
      create: {
        eligibilityStatus: DeliveryEligibilityStatus.MANUAL_REVIEW,
        encryptedPayload: encryptPrescriptionData(input.address),
        localityFingerprint: prescriptionDataFingerprint(
          `${input.address.locality}:${input.address.postalCode ?? ""}`,
        ),
        promiseText: result.zone.promiseText,
        quoteVersionId: current.id,
        storeId: current.quote.storeId,
        tenantId: current.quote.tenantId,
        zoneId: result.zone.id,
      },
      update: {
        eligibilityStatus: DeliveryEligibilityStatus.MANUAL_REVIEW,
        encryptedPayload: encryptPrescriptionData(input.address),
        evaluatedByUserId: null,
        evaluationReason: null,
        feeMinor: null,
        localityFingerprint: prescriptionDataFingerprint(
          `${input.address.locality}:${input.address.postalCode ?? ""}`,
        ),
        promiseText: result.zone.promiseText,
        zoneId: result.zone.id,
      },
      where: { quoteVersionId: current.id },
    })
    return {
      acceptanceToken: null,
      manualReviewId: address.id,
      outcome: "manual_review" as const,
    }
  }
  if (result.outcome !== "eligible") {
    throw new PrescriptionFulfillmentError(
      "ADDRESS_INELIGIBLE",
      "Delivery is unavailable for this address.",
    )
  }
  const rawToken = token()
  return db.$transaction(async (tx) => {
    const version = await tx.commerceQuoteVersion.create({
      data: {
        acceptanceTokenDigest: digest(rawToken),
        availabilityOutcome: current.availabilityOutcome,
        clientVersionId: `delivery-${randomBytes(12).toString("hex")}`,
        createdByUserId: "public_delivery_selection",
        currencyCode: current.currencyCode,
        customerNote: current.customerNote,
        discountMinor: current.discountMinor,
        expiresAt: current.expiresAt,
        fulfilmentFeeMinor: result.feeMinor,
        fulfilmentPromise: result.zone.promiseText,
        fulfilmentType: CommerceQuoteFulfilmentType.DELIVERY,
        issuedAt: new Date(),
        payloadHash: digest(
          `${current.payloadHash}:${result.zone.id}:${result.feeMinor}`,
        ),
        quoteId: current.quoteId,
        status: CommerceQuoteVersionStatus.ISSUED,
        subtotalMinor: current.subtotalMinor,
        taxMinor: current.taxMinor,
        totalMinor:
          current.subtotalMinor -
          current.discountMinor +
          current.taxMinor +
          result.feeMinor,
        version: current.version + 1,
      },
    })
    await tx.commerceQuoteLine.createMany({
      data: current.lines.map((line) => ({
        balanceRevision: line.balanceRevision,
        catalogItemName: line.catalogItemName,
        configurationVersionId: line.configurationVersionId,
        customerNote: line.customerNote,
        offeringId: line.offeringId,
        offeringName: line.offeringName,
        optionSelections: line.optionSelections as Prisma.InputJsonValue,
        outcome: line.outcome,
        quantity: line.quantity,
        quoteVersionId: version.id,
        sourceLineId: line.sourceLineId,
        totalMinor: line.totalMinor,
        unitPriceMinor: line.unitPriceMinor,
        variantName: line.variantName,
      })),
    })
    await tx.prescriptionDeliveryAddress.create({
      data: {
        eligibilityStatus: DeliveryEligibilityStatus.ELIGIBLE,
        encryptedPayload: encryptPrescriptionData(input.address),
        feeMinor: result.feeMinor,
        localityFingerprint: prescriptionDataFingerprint(
          `${input.address.locality}:${input.address.postalCode ?? ""}`,
        ),
        promiseText: result.zone.promiseText,
        quoteVersionId: version.id,
        storeId: current.quote.storeId,
        tenantId: current.quote.tenantId,
        zoneId: result.zone.id,
      },
    })
    await tx.commerceQuoteVersion.update({
      data: {
        acceptanceTokenDigest: null,
        status: CommerceQuoteVersionStatus.SUPERSEDED,
        supersededAt: new Date(),
      },
      where: { id: current.id, status: CommerceQuoteVersionStatus.ISSUED },
    })
    await tx.commerceQuote.update({
      data: { currentVersionId: version.id },
      where: { id: current.quoteId },
    })
    return {
      acceptanceToken: rawToken,
      outcome: "eligible" as const,
      versionId: version.id,
    }
  })
}

export async function listPrescriptionManualDeliveryReviews(
  db: PrismaClient,
  input: { storeId: string; tenantId: string },
) {
  return db.prescriptionDeliveryAddress.findMany({
    orderBy: { evaluatedAt: "asc" },
    select: {
      id: true,
      promiseText: true,
      quoteVersion: {
        select: {
          currencyCode: true,
          quote: { select: { sourceId: true } },
          totalMinor: true,
        },
      },
    },
    where: {
      eligibilityStatus: DeliveryEligibilityStatus.MANUAL_REVIEW,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
}

export async function approvePrescriptionManualDeliveryFee(
  db: PrismaClient,
  input: {
    actorUserId: string
    addressId: string
    clientDecisionId: string
    feeMinor: number
    reason: string
    storeId: string
    tenantId: string
  },
) {
  await assertAnyPrescriptionStoreRole(db, {
    storeId: input.storeId,
    tenantId: input.tenantId,
    userId: input.actorUserId,
  })
  if (!Number.isSafeInteger(input.feeMinor) || input.feeMinor < 0) {
    throw new PrescriptionFulfillmentError(
      "FULFILLMENT_CONFLICT",
      "A valid manual delivery fee is required.",
    )
  }
  if (!input.reason.trim()) {
    throw new PrescriptionFulfillmentError(
      "FULFILLMENT_CONFLICT",
      "A structured manual fee reason is required.",
    )
  }
  const rawToken = token()
  return db.$transaction(async (tx) => {
    const address = await tx.prescriptionDeliveryAddress.findFirst({
      include: {
        quoteVersion: {
          include: { lines: true, quote: true },
        },
      },
      where: {
        id: input.addressId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const current = address?.quoteVersion
    if (
      address &&
      current?.clientVersionId === input.clientDecisionId &&
      address.eligibilityStatus === DeliveryEligibilityStatus.ELIGIBLE
    ) {
      if (
        address.feeMinor !== input.feeMinor ||
        address.evaluationReason !== input.reason.trim()
      ) {
        throw new PrescriptionFulfillmentError(
          "FULFILLMENT_CONFLICT",
          "This manual delivery decision id was already used.",
        )
      }
      return {
        acceptanceToken: null,
        customerPhone: null,
        requestId: null,
        versionId: current.id,
      }
    }
    if (
      !address ||
      !current ||
      address.eligibilityStatus !== DeliveryEligibilityStatus.MANUAL_REVIEW ||
      current.quote.currentVersionId !== current.id
    ) {
      throw new PrescriptionFulfillmentError(
        "FULFILLMENT_CONFLICT",
        "This manual delivery review is no longer current.",
      )
    }
    const version = await tx.commerceQuoteVersion.create({
      data: {
        acceptanceTokenDigest: digest(rawToken),
        availabilityOutcome: current.availabilityOutcome,
        clientVersionId: input.clientDecisionId,
        createdByUserId: input.actorUserId,
        currencyCode: current.currencyCode,
        customerNote: current.customerNote,
        discountMinor: current.discountMinor,
        expiresAt: current.expiresAt,
        fulfilmentFeeMinor: input.feeMinor,
        fulfilmentPromise: address.promiseText,
        fulfilmentType: CommerceQuoteFulfilmentType.DELIVERY,
        issuedAt: new Date(),
        payloadHash: digest(
          `${current.payloadHash}:${address.zoneId}:${input.feeMinor}:${input.reason.trim()}`,
        ),
        quoteId: current.quoteId,
        status: CommerceQuoteVersionStatus.ISSUED,
        subtotalMinor: current.subtotalMinor,
        taxMinor: current.taxMinor,
        totalMinor:
          current.subtotalMinor -
          current.discountMinor +
          current.taxMinor +
          input.feeMinor,
        version: current.version + 1,
      },
    })
    await tx.commerceQuoteLine.createMany({
      data: current.lines.map((line) => ({
        balanceRevision: line.balanceRevision,
        catalogItemName: line.catalogItemName,
        configurationVersionId: line.configurationVersionId,
        customerNote: line.customerNote,
        offeringId: line.offeringId,
        offeringName: line.offeringName,
        optionSelections: line.optionSelections as Prisma.InputJsonValue,
        outcome: line.outcome,
        quantity: line.quantity,
        quoteVersionId: version.id,
        sourceLineId: line.sourceLineId,
        totalMinor: line.totalMinor,
        unitPriceMinor: line.unitPriceMinor,
        variantName: line.variantName,
      })),
    })
    await tx.prescriptionDeliveryAddress.update({
      data: {
        eligibilityStatus: DeliveryEligibilityStatus.ELIGIBLE,
        evaluatedAt: new Date(),
        evaluatedByUserId: input.actorUserId,
        evaluationReason: input.reason.trim(),
        feeMinor: input.feeMinor,
        quoteVersionId: version.id,
      },
      where: { id: address.id },
    })
    await tx.commerceQuoteVersion.update({
      data: {
        acceptanceTokenDigest: null,
        status: CommerceQuoteVersionStatus.SUPERSEDED,
        supersededAt: new Date(),
      },
      where: { id: current.id, status: CommerceQuoteVersionStatus.ISSUED },
    })
    await tx.commerceQuote.update({
      data: { currentVersionId: version.id },
      where: { id: current.quoteId },
    })
    const request = await tx.prescriptionRequest.findFirst({
      select: { customerPhone: true, id: true },
      where: {
        id: current.quote.sourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return {
      acceptanceToken: rawToken,
      customerPhone: request?.customerPhone ?? null,
      requestId: request?.id ?? null,
      versionId: version.id,
    }
  })
}

export async function listPrescriptionPickupQueue(
  db: PrismaClient,
  input: { storeId: string; tenantId: string },
) {
  return db.prescriptionPickupFulfillment.findMany({
    include: {
      order: {
        select: {
          amountPaidMinor: true,
          customerName: true,
          orderNumber: true,
          totalMinor: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    where: {
      order: { paymentStatus: PaymentStatus.PAID },
      status: {
        in: [
          PrescriptionPickupStatus.PREPARING,
          PrescriptionPickupStatus.READY,
          PrescriptionPickupStatus.EXCEPTION,
        ],
      },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
}

export async function listPrescriptionDeliveryQueue(
  db: PrismaClient,
  input: { storeId: string; tenantId: string },
) {
  return db.commercialOrder.findMany({
    select: {
      customerName: true,
      id: true,
      orderNumber: true,
      status: true,
      totalMinor: true,
      prescriptionDeliveryAddress: {
        select: {
          feeMinor: true,
          id: true,
          packedAt: true,
          promiseText: true,
        },
      },
      prescriptionDeliveryAssignment: {
        select: {
          courierDisplayName: true,
          courierReference: true,
          id: true,
          revision: true,
          status: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    where: {
      paymentStatus: PaymentStatus.PAID,
      prescriptionDeliveryAddress: { isNot: null },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
}

export async function markPrescriptionPickupReady(
  db: PrismaClient,
  input: {
    actorUserId: string
    checks: Record<string, boolean>
    fulfillmentId: string
    storeId: string
    tenantId: string
  },
) {
  await assertAnyPrescriptionStoreRole(db, {
    storeId: input.storeId,
    tenantId: input.tenantId,
    userId: input.actorUserId,
  })
  if (
    !Object.keys(input.checks).length ||
    Object.values(input.checks).some((complete) => !complete)
  ) {
    throw new PrescriptionFulfillmentError(
      "FULFILLMENT_CONFLICT",
      "Every required packing check must pass.",
    )
  }
  const rawCode = randomBytes(6).toString("base64url").slice(0, 8).toUpperCase()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000)
  return db.$transaction(async (tx) => {
    const fulfillment = await tx.prescriptionPickupFulfillment.findFirst({
      include: { order: true },
      where: {
        id: input.fulfillmentId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (
      !fulfillment ||
      fulfillment.order.paymentStatus !== PaymentStatus.PAID
    ) {
      throw new PrescriptionFulfillmentError(
        "FULFILLMENT_NOT_FOUND",
        "A paid pickup order was not found.",
      )
    }
    assertPickupTransition(pickupStatus(fulfillment.status), "ready")
    await tx.prescriptionPickupFulfillment.update({
      data: {
        packedAt: new Date(),
        packedByUserId: input.actorUserId,
        packingChecks: input.checks,
        pickupCodeCiphertext: encryptPrescriptionData({ code: rawCode }),
        pickupCodeDigest: digest(rawCode),
        pickupCodeExpiresAt: expiresAt,
        revision: { increment: 1 },
        status: PrescriptionPickupStatus.READY,
      },
      where: { id: fulfillment.id },
    })
    await tx.commercialOrder.update({
      data: { status: OrderStatus.READY_FOR_PICKUP },
      where: { id: fulfillment.orderId },
    })
    await tx.prescriptionPickupEvent.createMany({
      data: [
        {
          actorUserId: input.actorUserId,
          fulfillmentId: fulfillment.id,
          type: PrescriptionPickupEventType.PACKED,
        },
        {
          actorUserId: input.actorUserId,
          fulfillmentId: fulfillment.id,
          type: PrescriptionPickupEventType.READY,
        },
      ],
    })
    const communication = fulfillment.order.customerPhone
      ? await tx.prescriptionCommunicationIntent.upsert({
          create: {
            deduplicationKey: `pickup-ready:${fulfillment.id}:${fulfillment.revision + 1}`,
            orderId: fulfillment.orderId,
            payload: {},
            recipientReference: fulfillment.order.customerPhone,
            storeId: input.storeId,
            tenantId: input.tenantId,
            type: "PICKUP_READY",
          },
          update: {},
          where: {
            tenantId_deduplicationKey: {
              deduplicationKey: `pickup-ready:${fulfillment.id}:${fulfillment.revision + 1}`,
              tenantId: input.tenantId,
            },
          },
        })
      : null
    return {
      communicationIntentId: communication?.id ?? null,
      expiresAt,
      pickupCode: rawCode,
    }
  })
}

export async function handoffPrescriptionPickup(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    collectorName: string
    collectorRelationship?: string
    fulfillmentId: string
    pickupCode: string
    storeId: string
    tenantId: string
  },
) {
  await assertAnyPrescriptionStoreRole(db, {
    storeId: input.storeId,
    tenantId: input.tenantId,
    userId: input.actorUserId,
  })
  return db.$transaction(async (tx) => {
    const fulfillment = await tx.prescriptionPickupFulfillment.findFirst({
      where: {
        id: input.fulfillmentId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!fulfillment) {
      throw new PrescriptionFulfillmentError(
        "FULFILLMENT_NOT_FOUND",
        "Pickup was not found.",
      )
    }
    const replay = await tx.prescriptionPickupEvent.findFirst({
      where: {
        fulfillmentId: fulfillment.id,
        idempotencyKey: input.clientOperationId,
      },
    })
    if (replay) return { handedOff: fulfillment.status === "HANDED_OFF" }
    if (
      fulfillment.lockedUntil &&
      fulfillment.lockedUntil.getTime() > Date.now()
    ) {
      throw new PrescriptionFulfillmentError(
        "PICKUP_CODE_INVALID",
        "Pickup code verification is temporarily locked.",
      )
    }
    if (
      fulfillment.status !== PrescriptionPickupStatus.READY ||
      !fulfillment.pickupCodeDigest ||
      !fulfillment.pickupCodeExpiresAt ||
      fulfillment.pickupCodeExpiresAt <= new Date() ||
      fulfillment.pickupCodeDigest !== digest(input.pickupCode.toUpperCase())
    ) {
      const attempts = fulfillment.failedCodeAttempts + 1
      await tx.prescriptionPickupFulfillment.update({
        data: {
          failedCodeAttempts: attempts,
          lockedUntil:
            attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : undefined,
        },
        where: { id: fulfillment.id },
      })
      await tx.prescriptionPickupEvent.create({
        data: {
          actorUserId: input.actorUserId,
          fulfillmentId: fulfillment.id,
          type: PrescriptionPickupEventType.CODE_FAILED,
        },
      })
      throw new PrescriptionFulfillmentError(
        "PICKUP_CODE_INVALID",
        "Pickup code is invalid or expired.",
      )
    }
    assertPickupTransition(pickupStatus(fulfillment.status), "handed_off")
    await tx.prescriptionPickupFulfillment.update({
      data: {
        collectorName: input.collectorName.trim(),
        collectorRelationship: input.collectorRelationship?.trim() || null,
        handedOffAt: new Date(),
        handedOffByUserId: input.actorUserId,
        pickupCodeCiphertext: null,
        pickupCodeDigest: null,
        revision: { increment: 1 },
        status: PrescriptionPickupStatus.HANDED_OFF,
      },
      where: { id: fulfillment.id },
    })
    await tx.prescriptionPickupEvent.create({
      data: {
        actorUserId: input.actorUserId,
        fulfillmentId: fulfillment.id,
        idempotencyKey: input.clientOperationId,
        type: PrescriptionPickupEventType.HANDED_OFF,
      },
    })
    await tx.commercialOrder.update({
      data: { status: OrderStatus.COMPLETED },
      where: { id: fulfillment.orderId },
    })
    await tx.prescriptionUsageEvent.upsert({
      create: {
        deduplicationKey: `pickup-completed:${fulfillment.id}`,
        eventType: "PICKUP_COMPLETED",
        occurredAt: new Date(),
        sourceId: fulfillment.orderId,
        sourceType: "order",
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {},
      where: {
        tenantId_deduplicationKey: {
          deduplicationKey: `pickup-completed:${fulfillment.id}`,
          tenantId: input.tenantId,
        },
      },
    })
    return { handedOff: true }
  })
}

export async function markPrescriptionDeliveryReady(
  db: PrismaClient,
  input: {
    actorUserId: string
    checks: Record<string, boolean>
    orderId: string
    storeId: string
    tenantId: string
  },
) {
  await assertAnyPrescriptionStoreRole(db, {
    storeId: input.storeId,
    tenantId: input.tenantId,
    userId: input.actorUserId,
  })
  if (
    !Object.keys(input.checks).length ||
    Object.values(input.checks).some((complete) => !complete)
  ) {
    throw new PrescriptionFulfillmentError(
      "FULFILLMENT_CONFLICT",
      "Every required packing check must pass.",
    )
  }
  return db.$transaction(async (tx) => {
    const order = await tx.commercialOrder.findFirst({
      include: {
        prescriptionDeliveryAddress: true,
        prescriptionDeliveryAssignment: true,
      },
      where: {
        id: input.orderId,
        paymentStatus: PaymentStatus.PAID,
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.FULFILLING] },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (
      !order?.prescriptionDeliveryAddress ||
      order.prescriptionDeliveryAddress.eligibilityStatus !==
        DeliveryEligibilityStatus.ELIGIBLE
    ) {
      throw new PrescriptionFulfillmentError(
        "FULFILLMENT_CONFLICT",
        "A paid, delivery-eligible order is required.",
      )
    }
    if (order.prescriptionDeliveryAssignment) {
      throw new PrescriptionFulfillmentError(
        "FULFILLMENT_CONFLICT",
        "This delivery is already prepared.",
      )
    }
    await tx.prescriptionDeliveryAddress.update({
      data: {
        packedAt: new Date(),
        packedByUserId: input.actorUserId,
        packingChecks: input.checks,
      },
      where: { id: order.prescriptionDeliveryAddress.id },
    })
    const assignment = await tx.prescriptionDeliveryAssignment.create({
      data: {
        addressId: order.prescriptionDeliveryAddress.id,
        events: { create: { actorUserId: input.actorUserId, type: "CREATED" } },
        orderId: order.id,
        status: PrescriptionDeliveryStatus.READY_FOR_ASSIGNMENT,
        storeId: order.storeId,
        tenantId: order.tenantId,
      },
    })
    await tx.commercialOrder.update({
      data: { status: OrderStatus.FULFILLING },
      where: { id: order.id },
    })
    const communication = order.customerPhone
      ? await tx.prescriptionCommunicationIntent.upsert({
          create: {
            deduplicationKey: `delivery-ready:${assignment.id}`,
            orderId: order.id,
            payload: {},
            recipientReference: order.customerPhone,
            storeId: input.storeId,
            tenantId: input.tenantId,
            type: "DELIVERY_PROGRESS",
          },
          update: {},
          where: {
            tenantId_deduplicationKey: {
              deduplicationKey: `delivery-ready:${assignment.id}`,
              tenantId: input.tenantId,
            },
          },
        })
      : null
    return {
      assignment,
      communicationIntentId: communication?.id ?? null,
    }
  })
}

export async function recordPrescriptionPickupException(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    exceptionCode: string
    fulfillmentId: string
    reason: string
    status: "abandoned" | "cancelled" | "exception"
    storeId: string
    tenantId: string
  },
) {
  await assertAnyPrescriptionStoreRole(db, {
    storeId: input.storeId,
    tenantId: input.tenantId,
    userId: input.actorUserId,
  })
  return db.$transaction(async (tx) => {
    const fulfillment = await tx.prescriptionPickupFulfillment.findFirst({
      where: {
        id: input.fulfillmentId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!fulfillment) {
      throw new PrescriptionFulfillmentError(
        "FULFILLMENT_NOT_FOUND",
        "Pickup was not found.",
      )
    }
    const replay = await tx.prescriptionPickupEvent.findFirst({
      where: {
        fulfillmentId: fulfillment.id,
        idempotencyKey: input.clientOperationId,
      },
    })
    if (replay) return fulfillment
    assertPickupTransition(pickupStatus(fulfillment.status), input.status)
    const status = input.status.toUpperCase() as PrescriptionPickupStatus
    const updated = await tx.prescriptionPickupFulfillment.update({
      data: {
        exceptionCode: input.exceptionCode,
        exceptionReason: input.reason.trim(),
        pickupCodeCiphertext: status === "EXCEPTION" ? undefined : null,
        pickupCodeDigest: status === "EXCEPTION" ? undefined : null,
        revision: { increment: 1 },
        status,
      },
      where: { id: fulfillment.id },
    })
    await tx.prescriptionPickupEvent.create({
      data: {
        actorUserId: input.actorUserId,
        fulfillmentId: fulfillment.id,
        idempotencyKey: input.clientOperationId,
        reason: input.reason.trim(),
        type:
          status === PrescriptionPickupStatus.ABANDONED
            ? PrescriptionPickupEventType.ABANDONED
            : status === PrescriptionPickupStatus.CANCELLED
              ? PrescriptionPickupEventType.CANCELLED
              : PrescriptionPickupEventType.EXCEPTION_RECORDED,
      },
    })
    if (status === PrescriptionPickupStatus.CANCELLED) {
      await tx.commercialOrder.update({
        data: { status: OrderStatus.CANCELLED },
        where: { id: fulfillment.orderId },
      })
    }
    return updated
  })
}

export async function createPrescriptionDeliveryAssignment(
  db: PrismaClient,
  input: {
    actorUserId: string
    courierDisplayName: string
    courierPhoneMasked?: string
    courierReference: string
    orderId: string
    storeId: string
    tenantId: string
  },
) {
  await assertAnyPrescriptionStoreRole(db, {
    storeId: input.storeId,
    tenantId: input.tenantId,
    userId: input.actorUserId,
  })
  return db.$transaction(async (tx) => {
    const order = await tx.commercialOrder.findFirst({
      include: {
        prescriptionDeliveryAddress: true,
        prescriptionDeliveryAssignment: true,
      },
      where: {
        id: input.orderId,
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.FULFILLING,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (
      !order?.prescriptionDeliveryAddress?.packedAt ||
      !order.prescriptionDeliveryAssignment ||
      (order.prescriptionDeliveryAssignment.status !==
        PrescriptionDeliveryStatus.ASSIGNED &&
        order.prescriptionDeliveryAssignment.status !==
          PrescriptionDeliveryStatus.READY_FOR_ASSIGNMENT &&
        order.prescriptionDeliveryAssignment.status !==
          PrescriptionDeliveryStatus.RESCHEDULED)
    ) {
      throw new PrescriptionFulfillmentError(
        "FULFILLMENT_CONFLICT",
        "A paid and delivery-eligible order is required.",
      )
    }
    const reassigned =
      order.prescriptionDeliveryAssignment.status ===
      PrescriptionDeliveryStatus.ASSIGNED
    return tx.prescriptionDeliveryAssignment.update({
      data: {
        assignedAt: new Date(),
        assignedByUserId: input.actorUserId,
        courierDisplayName: input.courierDisplayName.trim(),
        courierPhoneMasked: input.courierPhoneMasked?.trim(),
        courierReference: input.courierReference.trim(),
        revision: { increment: 1 },
        status: PrescriptionDeliveryStatus.ASSIGNED,
        events: {
          create: {
            actorUserId: input.actorUserId,
            type: reassigned
              ? PrescriptionDeliveryEventType.REASSIGNED
              : PrescriptionDeliveryEventType.ASSIGNED,
          },
        },
      },
      where: { id: order.prescriptionDeliveryAssignment.id },
    })
  })
}

export async function transitionPrescriptionDelivery(
  db: PrismaClient,
  input: {
    actorUserId: string
    assignmentId: string
    clientOperationId: string
    proofReference?: string
    reason?: string
    status:
      | "cancelled"
      | "collected"
      | "delivered"
      | "failed"
      | "in_transit"
      | "rescheduled"
      | "returned_to_pharmacy"
    storeId: string
    tenantId: string
  },
) {
  await assertAnyPrescriptionStoreRole(db, {
    storeId: input.storeId,
    tenantId: input.tenantId,
    userId: input.actorUserId,
  })
  if (input.status === "delivered" && !input.proofReference?.trim()) {
    throw new PrescriptionFulfillmentError(
      "FULFILLMENT_CONFLICT",
      "Delivery proof is required before completion.",
    )
  }
  if (
    ["failed", "rescheduled", "returned_to_pharmacy"].includes(input.status) &&
    !input.reason?.trim()
  ) {
    throw new PrescriptionFulfillmentError(
      "FULFILLMENT_CONFLICT",
      "A structured reason is required for this delivery outcome.",
    )
  }
  return db.$transaction(async (tx) => {
    const assignment = await tx.prescriptionDeliveryAssignment.findFirst({
      where: {
        id: input.assignmentId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!assignment) {
      throw new PrescriptionFulfillmentError(
        "FULFILLMENT_NOT_FOUND",
        "Delivery was not found.",
      )
    }
    const replay = await tx.prescriptionDeliveryEvent.findFirst({
      where: {
        assignmentId: assignment.id,
        idempotencyKey: input.clientOperationId,
      },
    })
    if (replay) {
      return { assignment, communicationIntentId: null }
    }
    assertDeliveryTransition(deliveryStatus(assignment.status), input.status)
    const mapped = input.status.toUpperCase() as PrescriptionDeliveryStatus
    const type = mapped as unknown as PrescriptionDeliveryEventType
    const updated = await tx.prescriptionDeliveryAssignment.update({
      data: {
        collectedAt:
          mapped === PrescriptionDeliveryStatus.COLLECTED
            ? new Date()
            : undefined,
        deliveredAt:
          mapped === PrescriptionDeliveryStatus.DELIVERED
            ? new Date()
            : undefined,
        failureCode:
          mapped === PrescriptionDeliveryStatus.FAILED
            ? "delivery_failed"
            : undefined,
        failureReason: input.reason?.trim(),
        proofReference:
          mapped === PrescriptionDeliveryStatus.DELIVERED
            ? input.proofReference?.trim()
            : undefined,
        revision: { increment: 1 },
        status: mapped,
      },
      where: { id: assignment.id },
    })
    await tx.prescriptionDeliveryEvent.create({
      data: {
        actorUserId: input.actorUserId,
        assignmentId: assignment.id,
        idempotencyKey: input.clientOperationId,
        reason: input.reason?.trim(),
        type,
      },
    })
    await tx.commercialOrder.update({
      data: {
        status:
          mapped === PrescriptionDeliveryStatus.DELIVERED
            ? OrderStatus.COMPLETED
            : mapped === PrescriptionDeliveryStatus.IN_TRANSIT
              ? OrderStatus.OUT_FOR_DELIVERY
              : OrderStatus.FULFILLING,
      },
      where: { id: assignment.orderId },
    })
    if (mapped === PrescriptionDeliveryStatus.DELIVERED) {
      await tx.prescriptionUsageEvent.upsert({
        create: {
          amounts: { deliveryCostMinor: null },
          deduplicationKey: `delivery-completed:${assignment.id}`,
          eventType: "DELIVERY_COMPLETED",
          occurredAt: new Date(),
          sourceId: assignment.orderId,
          sourceType: "order",
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        update: {},
        where: {
          tenantId_deduplicationKey: {
            deduplicationKey: `delivery-completed:${assignment.id}`,
            tenantId: input.tenantId,
          },
        },
      })
    }
    const order = await tx.commercialOrder.findUnique({
      select: { customerPhone: true },
      where: { id: assignment.orderId },
    })
    const communication = order?.customerPhone
      ? await tx.prescriptionCommunicationIntent.upsert({
          create: {
            deduplicationKey: `delivery:${assignment.id}:${updated.revision}`,
            orderId: assignment.orderId,
            payload: {},
            recipientReference: order.customerPhone,
            storeId: input.storeId,
            tenantId: input.tenantId,
            type:
              mapped === PrescriptionDeliveryStatus.FAILED
                ? "DELIVERY_FAILED"
                : "DELIVERY_PROGRESS",
          },
          update: {},
          where: {
            tenantId_deduplicationKey: {
              deduplicationKey: `delivery:${assignment.id}:${updated.revision}`,
              tenantId: input.tenantId,
            },
          },
        })
      : null
    return {
      assignment: updated,
      communicationIntentId: communication?.id ?? null,
    }
  })
}
