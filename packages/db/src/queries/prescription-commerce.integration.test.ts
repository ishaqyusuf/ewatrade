import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  MembershipRole,
  OrderStatus,
  PaymentStatus,
  PrescriptionDeliveryStatus,
  PrescriptionMediaStatus,
  PrescriptionPickupStatus,
  PrescriptionRequestSource,
  PrescriptionRequestStatus,
  QaDataClassification,
  StoreStatus,
  TenantMode,
  TenantType,
} from "../../generated/prisma/enums"
import { createSimpleCatalogItem } from "./catalog"
import { getCatalogOfferingAvailability } from "./catalog-inventory"
import {
  approvePrescriptionManualDeliveryFee,
  createPrescriptionDeliveryAssignment,
  handoffPrescriptionPickup,
  listPrescriptionDeliveryQueue,
  listPrescriptionManualDeliveryReviews,
  listPrescriptionPickupQueue,
  markPrescriptionDeliveryReady,
  markPrescriptionPickupReady,
  revisePrescriptionQuoteForDelivery,
  transitionPrescriptionDelivery,
  upsertPrescriptionDeliveryZone,
} from "./prescription-fulfillment"
import {
  attachPrescriptionHostedCheckout,
  getPublicPrescriptionPaymentStatus,
  preparePrescriptionHostedCheckout,
  processPrescriptionPaymentProviderEvent,
} from "./prescription-payments"
import { getPrescriptionOperationsReport } from "./prescription-reporting"
import {
  acceptPrescriptionDeliveryQuote,
  acceptPrescriptionPickupQuote,
  completePrescriptionTranscription,
  ensurePrescriptionChannel,
  getPrescriptionRequest,
  getPublicPrescriptionQuote,
  getPublicPrescriptionRequestStatus,
  issuePrescriptionQuote,
  markPrescriptionMediaReadyForTranscription,
  recordPrescriptionMediaSafety,
  recordPrescriptionPharmacistReview,
  submitPrescriptionForPharmacistReview,
  submitPublicPrescriptionRequest,
  submitStaffPrescriptionRequest,
  submitWhatsAppPrescriptionRequest,
  verifyPrescriptionTranscriptionLine,
} from "./prescription-requests"
import {
  assignPrescriptionStoreRole,
  setPrescriptionStoreActivation,
  updatePrescriptionStoreSettings,
} from "./prescription-settings"
import {
  acceptServiceQuote,
  createServiceRequestForm,
  getPublicServiceQuote,
  issueServiceQuote,
  submitPublicServiceRequest,
} from "./service-public"

const databaseUrl = process.env.DATABASE_URL
const databaseIntegrationEnabled =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"

if (databaseIntegrationEnabled) {
  if (
    process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
    process.env.DEV_PROFILE !== "local"
  ) {
    throw new Error(
      "Prescription Commerce integration tests require the verified local database profile.",
    )
  }
  const hostname = databaseUrl
    ? new URL(databaseUrl).hostname.toLowerCase().replace(/\.$/, "")
    : ""
  if (!hostname.endsWith(".neon.tech")) {
    throw new Error(
      "Prescription Commerce integration tests require the .env.local Neon development database.",
    )
  }
}

const describeWithDatabase =
  databaseUrl && databaseIntegrationEnabled ? describe : describe.skip

function getDatabaseUrl() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database integration tests.")
  }
  return databaseUrl
}

type IntakeOrigin = "staff" | "web" | "whatsapp"

async function deleteAcceptanceFixture(
  db: PrismaClient,
  input: { tenantId: string; userId: string },
) {
  const { tenantId, userId } = input
  await db.$transaction(async (tx) => {
    const paymentIntentIds = (
      await tx.prescriptionPaymentIntent.findMany({
        select: { id: true },
        where: { tenantId },
      })
    ).map((intent) => intent.id)
    await tx.prescriptionPaymentProviderEvent.deleteMany({
      where: { paymentIntentId: { in: paymentIntentIds } },
    })
    await tx.prescriptionCommunicationIntent.deleteMany({
      where: { tenantId },
    })
    await tx.prescriptionPickupFulfillment.deleteMany({ where: { tenantId } })
    await tx.prescriptionDeliveryAssignment.deleteMany({ where: { tenantId } })
    await tx.prescriptionDeliveryAddress.deleteMany({ where: { tenantId } })
    await tx.prescriptionPaymentIntent.deleteMany({ where: { tenantId } })
    await tx.commerceQuote.deleteMany({ where: { tenantId } })
    await tx.prescriptionRequest.deleteMany({ where: { tenantId } })
    await tx.serviceRequest.deleteMany({ where: { tenantId } })
    await tx.serviceRequestForm.deleteMany({ where: { tenantId } })
    await tx.stockReservation.deleteMany({ where: { tenantId } })
    await tx.offeringSnapshot.deleteMany({
      where: { orderLine: { order: { tenantId } } },
    })
    await tx.commercialOrder.deleteMany({ where: { tenantId } })
    await tx.stockMovement.deleteMany({ where: { operation: { tenantId } } })
    await tx.stockOperation.deleteMany({ where: { tenantId } })
    await tx.stockBalanceSource.deleteMany({ where: { tenantId } })
    await tx.prescriptionDeliveryZone.deleteMany({ where: { tenantId } })
    await tx.catalogPriceChange.deleteMany({ where: { tenantId } })
    await tx.catalogCommandReceipt.deleteMany({ where: { tenantId } })
    await tx.catalogItem.deleteMany({ where: { tenantId } })
    await tx.tenant.delete({ where: { id: tenantId } })
    await tx.user.deleteMany({
      where: { id: userId, memberships: { none: {} } },
    })
  })
}

describeWithDatabase("prescription commerce database acceptance", () => {
  let actorUserId: string
  let db: PrismaClient
  let fixtureStartedAt: Date
  let offeringId: string
  let publicToken: string
  let serviceOfferingId: string
  let storeId: string
  let tenantId: string

  beforeAll(async () => {
    getDatabaseUrl()
    db = (await import("../client")).prisma
    fixtureStartedAt = new Date(Date.now() - 60_000)

    const fixtureId = randomUUID()
    const actor = await db.user.create({
      data: {
        email: `prescription-acceptance-${fixtureId}@example.invalid`,
        emailVerified: true,
        name: "Prescription Acceptance Pharmacist",
      },
    })
    actorUserId = actor.id
    const tenant = await db.tenant.create({
      data: {
        dataClassification: QaDataClassification.QA,
        enabledModes: [TenantMode.MERCHANT],
        name: "Prescription Commerce Acceptance",
        slug: `prescription-acceptance-${fixtureId}`,
        type: TenantType.MERCHANT,
        users: {
          create: { role: MembershipRole.OWNER, userId: actor.id },
        },
      },
    })
    tenantId = tenant.id
    const store = await db.store.create({
      data: {
        name: "Acceptance Pharmacy",
        slug: "acceptance-pharmacy",
        status: StoreStatus.ACTIVE,
        supportEmail: "pharmacy@example.invalid",
        supportPhone: "+2348000000000",
        tenantId: tenant.id,
      },
    })
    storeId = store.id

    await updatePrescriptionStoreSettings(db, {
      actorUserId,
      consentVersion: "acceptance-v1",
      contactPolicy: "Use neutral order notifications only.",
      deliveryEnabled: true,
      operatingHours: [
        {
          closesAt: "18:00",
          day: "monday",
          isClosed: false,
          opensAt: "08:00",
        },
      ],
      pickupEnabled: true,
      servicePolicy: "A pharmacist must release every prescription.",
      storeId,
      tenantId,
    })
    await upsertPrescriptionDeliveryZone(db, {
      actorUserId,
      currencyCode: "NGN",
      feePolicy: "fixed",
      fixedFeeMinor: 500,
      matchType: "locality",
      matchValues: ["Acceptance District"],
      name: "Acceptance District",
      promiseText: "Delivery within four hours",
      storeId,
      tenantId,
    })
    await upsertPrescriptionDeliveryZone(db, {
      actorUserId,
      currencyCode: "NGN",
      feePolicy: "manual",
      matchType: "locality",
      matchValues: ["Manual Review District"],
      name: "Manual Review District",
      promiseText: "Delivery after staff confirmation",
      storeId,
      tenantId,
    })
    await assignPrescriptionStoreRole(db, {
      actorUserId,
      credentialVerified: false,
      role: "attendant",
      storeId,
      tenantId,
      userId: actorUserId,
    })
    await assignPrescriptionStoreRole(db, {
      actorUserId,
      credentialReference: `test-license-${fixtureId}`,
      credentialVerified: true,
      role: "pharmacist",
      storeId,
      tenantId,
      userId: actorUserId,
    })
    await setPrescriptionStoreActivation(db, {
      active: true,
      actorUserId,
      storeId,
      tenantId,
    })

    const channel = await ensurePrescriptionChannel(db, {
      actorUserId,
      storeId,
      tenantId,
    })
    publicToken = channel.publicToken
    await db.prescriptionChannel.update({
      data: { whatsappEnabled: true },
      where: { id: channel.id },
    })

    const item = await createSimpleCatalogItem(db, {
      actorUserId,
      canonicalUnitName: "tablet",
      clientOperationId: `prescription-acceptance-catalog-${fixtureId}`,
      kind: "product",
      name: "Acceptance Medicine",
      openingStockQuantity: "20",
      priceMinor: 2_500,
      storeId,
      tenantId,
    })
    const offering = item.variants[0]?.offerings[0]
    if (!offering)
      throw new Error("Acceptance Product Offering was not created.")
    offeringId = offering.id

    const serviceItem = await createSimpleCatalogItem(db, {
      actorUserId,
      authorizationPolicy: "on_order_confirmation",
      clientOperationId: `prescription-acceptance-service-${fixtureId}`,
      kind: "service",
      name: "Acceptance Consultation",
      priceMinor: 7_500,
      quantityScale: 0,
      storeId,
      tenantId,
      workPolicy: "charge_only",
    })
    const serviceOffering = serviceItem.variants[0]?.offerings[0]
    if (!serviceOffering)
      throw new Error("Acceptance Service Offering was not created.")
    serviceOfferingId = serviceOffering.id
  })

  afterAll(async () => {
    if (tenantId && actorUserId) {
      await deleteAcceptanceFixture(db, { tenantId, userId: actorUserId })
    } else if (actorUserId) {
      await db.user.deleteMany({ where: { id: actorUserId } })
    }
    await db.$disconnect()
  })

  async function submit(
    origin: IntakeOrigin,
    runId: string,
    fulfilmentPreference: "delivery" | "pickup",
  ) {
    const common = {
      clientRequestId: `${origin}-request-${runId}`,
      consentAcceptedAt: new Date(),
      consentVersion: "acceptance-v1",
      customerEmail: `${origin}-${runId}@example.invalid`,
      customerName: "Synthetic Acceptance Customer",
      customerPhone: "+2348111111111",
      fulfilmentPreference,
      media: [
        {
          clientMediaId: `${origin}-media-${runId}`,
          mediaType: "image/jpeg",
          objectKey: `private/${tenantId}/${storeId}/${runId}/page-1.jpg`,
          originalFileName: "safe-test-prescription.jpg",
          pageNumber: 1,
          sha256: "a".repeat(64),
          sizeBytes: 1_024,
        },
      ],
    }
    if (origin === "web") {
      return submitPublicPrescriptionRequest(db, { ...common, publicToken })
    }
    if (origin === "whatsapp") {
      return submitWhatsAppPrescriptionRequest(db, {
        ...common,
        providerEventId: `meta-${runId}`,
        storeId,
        tenantId,
      })
    }
    return submitStaffPrescriptionRequest(db, {
      ...common,
      actorUserId,
      source: "staff_walk_in",
      storeId,
      tenantId,
    })
  }

  async function prepareReleasedQuote(
    origin: IntakeOrigin,
    fulfilmentPreference: "delivery" | "pickup",
  ) {
    const runId = randomUUID()
    const intake = await submit(origin, runId, fulfilmentPreference)
    expect(intake.created).toBe(true)
    if (!intake.statusToken) {
      throw new Error("Prescription status token was not issued.")
    }

    const media = await db.prescriptionMedia.findFirstOrThrow({
      where: { requestId: intake.requestId, storeId, tenantId },
    })
    await recordPrescriptionMediaSafety(db, {
      mediaId: media.id,
      outcome: "safe",
      providerEventId: `${origin}-safety-${runId}`,
      safetyMetadata: { adapter: "deterministic-acceptance" },
      storeId,
      tenantId,
    })
    const transcription = await markPrescriptionMediaReadyForTranscription(db, {
      actorUserId,
      requestId: intake.requestId,
      storeId,
      tenantId,
    })
    await completePrescriptionTranscription(db, {
      lines: [
        {
          confidence: 0.99,
          draftText: "Acceptance Medicine, one tablet",
          lineNumber: 1,
        },
      ],
      providerKey: "deterministic-acceptance",
      providerOperationId: `${origin}-ocr-${runId}`,
      transcriptionId: transcription.id,
    })
    const safeMedia = await db.prescriptionMedia.findUniqueOrThrow({
      where: { id: media.id },
    })
    expect(safeMedia.status).toBe(PrescriptionMediaStatus.SAFE)

    const request = await db.prescriptionRequest.findFirstOrThrow({
      include: {
        transcriptions: {
          include: { lines: true },
          where: { revision: 1 },
        },
      },
      where: { id: intake.requestId, storeId, tenantId },
    })
    const line = request.transcriptions[0]?.lines[0]
    if (!line) throw new Error("OCR transcription line was not created.")
    await expect(
      submitPrescriptionForPharmacistReview(db, {
        actorUserId,
        requestId: request.id,
        storeId,
        tenantId,
      }),
    ).rejects.toMatchObject({ code: "TRANSCRIPT_NOT_READY" })
    await verifyPrescriptionTranscriptionLine(db, {
      actorUserId,
      lineId: line.id,
      status: "verified",
      storeId,
      tenantId,
      verifiedText: "Acceptance Medicine, one tablet",
    })
    await submitPrescriptionForPharmacistReview(db, {
      actorUserId,
      requestId: request.id,
      storeId,
      tenantId,
    })
    await recordPrescriptionPharmacistReview(db, {
      actorUserId,
      decision: "released",
      expectedMediaRevision: request.currentMediaRevision,
      expectedTranscriptRevision: 1,
      lines: [
        {
          availability: "available",
          offeringId,
          quantity: "1",
          transcriptionLineId: line.id,
        },
      ],
      requestId: request.id,
      storeId,
      tenantId,
    })
    const inventoryBeforeAcceptance = await getCatalogOfferingAvailability(db, {
      offeringId,
      storeId,
      tenantId,
    })
    const quote = await issuePrescriptionQuote(db, {
      actorUserId,
      availabilityOutcome: "full",
      clientQuoteId: `${origin}-quote-${runId}`,
      clientVersionId: `${origin}-quote-version-${runId}`,
      lines: [{ transcriptionLineId: line.id, unitPriceMinor: 2_500 }],
      requestId: request.id,
      storeId,
      tenantId,
    })
    if (!quote.token) throw new Error("Quote acceptance token was not issued.")
    const publicQuote = await getPublicPrescriptionQuote(db, {
      acceptanceToken: quote.token,
    })
    expect(publicQuote).toMatchObject({
      availabilityOutcome: "full",
      fulfilmentType: "pickup",
      storeName: "Acceptance Pharmacy",
      totalMinor: 2_500,
    })
    expect(publicQuote.lines).toHaveLength(1)
    expect(JSON.stringify(publicQuote)).not.toMatch(
      /objectKey|providerOperationId|tenantId/i,
    )
    return {
      intake,
      inventoryBeforeAcceptance,
      quoteToken: quote.token,
      request,
      runId,
      statusToken: intake.statusToken,
    }
  }

  async function acceptAndPay<TAccepted extends { orderId: string }>(input: {
    accept: () => Promise<TAccepted>
    afterAcceptance?: (accepted: TAccepted) => Promise<void>
    origin: IntakeOrigin
    quoteToken: string
    runId: string
    totalMinor: number
  }) {
    const [accepted, acceptanceReplay] = await Promise.all([
      input.accept(),
      input.accept(),
    ])
    expect(acceptanceReplay.orderId).toBe(accepted.orderId)
    await input.afterAcceptance?.(accepted)
    const inventoryAfterAcceptance = await getCatalogOfferingAvailability(db, {
      offeringId,
      storeId,
      tenantId,
    })

    const checkout = await preparePrescriptionHostedCheckout(db, {
      acceptanceToken: input.quoteToken,
      clientPaymentId: `${input.origin}-payment-${input.runId}`,
      provider: "acceptance-fake",
      statusToken: `${input.origin}-status-${input.runId}`,
    })
    await attachPrescriptionHostedCheckout(db, {
      checkoutUrl: `https://payments.example.invalid/${checkout.intentId}`,
      intentId: checkout.intentId,
      providerReference: checkout.providerReference,
    })
    const paymentInput = {
      amountMinor: checkout.amountMinor,
      currencyCode: checkout.currencyCode,
      eventId: `${input.origin}-provider-event-${input.runId}`,
      provider: "acceptance-fake",
      providerReference: checkout.providerReference,
      status: "paid" as const,
    }
    await expect(
      processPrescriptionPaymentProviderEvent(db, paymentInput),
    ).resolves.toMatchObject({ replay: false })
    await expect(
      processPrescriptionPaymentProviderEvent(db, paymentInput),
    ).resolves.toEqual({ replay: true })
    await expect(
      getPublicPrescriptionPaymentStatus(db, {
        statusToken: checkout.statusToken,
      }),
    ).resolves.toMatchObject({
      amountPaidMinor: input.totalMinor,
      balanceDueMinor: 0,
      status: "paid",
      totalMinor: input.totalMinor,
    })
    return { accepted, inventoryAfterAcceptance }
  }

  async function completePickup(origin: IntakeOrigin) {
    const prepared = await prepareReleasedQuote(origin, "pickup")
    const acceptanceInput = {
      acceptanceToken: prepared.quoteToken,
      clientAcceptanceId: `${origin}-acceptance-${prepared.runId}`,
      partialAcknowledged: false,
    }
    const { accepted, inventoryAfterAcceptance } = await acceptAndPay({
      accept: () => acceptPrescriptionPickupQuote(db, acceptanceInput),
      origin,
      quoteToken: prepared.quoteToken,
      runId: prepared.runId,
      totalMinor: 2_500,
    })
    expect(Number(inventoryAfterAcceptance.reservedQuantity)).toBe(
      Number(prepared.inventoryBeforeAcceptance.reservedQuantity) + 1,
    )

    const fulfillment = await db.prescriptionPickupFulfillment.findFirstOrThrow(
      {
        where: { orderId: accepted.orderId, storeId, tenantId },
      },
    )
    const preparingQueue = await listPrescriptionPickupQueue(db, {
      storeId,
      tenantId,
    })
    expect(preparingQueue.map((item) => item.id)).toContain(fulfillment.id)
    const ready = await markPrescriptionPickupReady(db, {
      actorUserId,
      checks: { label_matches: true, pharmacist_released: true },
      fulfillmentId: fulfillment.id,
      storeId,
      tenantId,
    })
    const publicReadyStatus = await getPublicPrescriptionRequestStatus(db, {
      statusToken: prepared.statusToken,
    })
    expect(publicReadyStatus).toMatchObject({
      pickup: { code: ready.pickupCode },
      status: "converted",
      storeName: "Acceptance Pharmacy",
    })
    expect(JSON.stringify(publicReadyStatus)).not.toMatch(
      /Acceptance Medicine|example\.invalid|2348111111111|objectKey/i,
    )
    const handoffInput = {
      actorUserId,
      clientOperationId: `${origin}-handoff-${prepared.runId}`,
      collectorName: "Synthetic Acceptance Customer",
      fulfillmentId: fulfillment.id,
      pickupCode: ready.pickupCode,
      storeId,
      tenantId,
    }
    await expect(
      Promise.all([
        handoffPrescriptionPickup(db, handoffInput),
        handoffPrescriptionPickup(db, handoffInput),
      ]),
    ).resolves.toEqual([{ handedOff: true }, { handedOff: true }])

    const [completedRequest, completedOrder, completedPickup] =
      await Promise.all([
        db.prescriptionRequest.findUniqueOrThrow({
          where: { id: prepared.request.id },
        }),
        db.commercialOrder.findUniqueOrThrow({
          where: { id: accepted.orderId },
        }),
        db.prescriptionPickupFulfillment.findUniqueOrThrow({
          where: { id: fulfillment.id },
        }),
      ])
    expect(completedRequest.status).toBe(PrescriptionRequestStatus.CONVERTED)
    expect(completedOrder.paymentStatus).toBe(PaymentStatus.PAID)
    expect(completedOrder.status).toBe(OrderStatus.COMPLETED)
    expect(completedPickup.status).toBe(PrescriptionPickupStatus.HANDED_OFF)
    await expect(
      getPublicPrescriptionRequestStatus(db, {
        statusToken: prepared.statusToken,
      }),
    ).resolves.toMatchObject({ pickup: null, status: "converted" })
    const managementRequest = await getPrescriptionRequest(db, {
      actorUserId,
      reason: "acceptance_evidence",
      requestId: prepared.request.id,
      storeId,
      tenantId,
    })
    expect(managementRequest.auditEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "RECEIVED",
        "TRANSCRIPTION_REQUESTED",
        "TRANSCRIPTION_COMPLETED",
        "LINE_VERIFIED",
        "PHARMACIST_REVIEWED",
        "QUOTE_ISSUED",
        "CONVERTED",
      ]),
    )
    const report = await getPrescriptionOperationsReport(db, {
      from: fixtureStartedAt,
      storeId,
      tenantId,
      to: new Date(Date.now() + 60_000),
    })
    expect(
      report.channelMix[completedRequest.source.toLowerCase()],
    ).toBeGreaterThanOrEqual(1)
    expect(report.payment.paidCount).toBeGreaterThanOrEqual(1)
    expect(report.pickupCompleted).toBeGreaterThanOrEqual(1)
    expect(report.usage.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "REQUEST_RECEIVED",
        "QUOTE_ISSUED",
        "ORDER_CREATED",
        "PAYMENT_SUCCEEDED",
        "PICKUP_COMPLETED",
      ]),
    )
    return completedRequest.source
  }

  async function completeDelivery(origin: IntakeOrigin) {
    const prepared = await prepareReleasedQuote(origin, "delivery")
    const deliverySelection = await revisePrescriptionQuoteForDelivery(db, {
      acceptanceToken: prepared.quoteToken,
      address: {
        addressLine1: "1 Synthetic Acceptance Road",
        locality: " acceptance   district ",
        postalCode: "100001",
        recipientName: "Synthetic Acceptance Customer",
        recipientPhone: "+2348111111111",
        region: "Lagos",
      },
    })
    expect(deliverySelection.outcome).toBe("eligible")
    if (!deliverySelection.acceptanceToken) {
      throw new Error("Delivery Quote token was not issued.")
    }
    await expect(
      getPublicPrescriptionQuote(db, {
        acceptanceToken: prepared.quoteToken,
      }),
    ).rejects.toThrow("Quote is unavailable")
    const deliveryQuote = await getPublicPrescriptionQuote(db, {
      acceptanceToken: deliverySelection.acceptanceToken,
    })
    expect(deliveryQuote).toMatchObject({
      accepted: false,
      fulfilmentFeeMinor: 500,
      fulfilmentPromise: "Delivery within four hours",
      fulfilmentType: "delivery",
      storeName: "Acceptance Pharmacy",
      totalMinor: 3_000,
      version: 2,
    })
    expect(JSON.stringify(deliveryQuote)).not.toMatch(
      /Acceptance Road|2348111111111|objectKey|tenantId/i,
    )

    const acceptanceInput = {
      acceptanceToken: deliverySelection.acceptanceToken,
      clientAcceptanceId: `${origin}-delivery-acceptance-${prepared.runId}`,
      partialAcknowledged: false,
    }
    const { accepted, inventoryAfterAcceptance } = await acceptAndPay({
      accept: () => acceptPrescriptionDeliveryQuote(db, acceptanceInput),
      afterAcceptance: async (acceptedBeforePayment) => {
        await expect(
          markPrescriptionDeliveryReady(db, {
            actorUserId,
            checks: { label_matches: true, pharmacist_released: true },
            orderId: acceptedBeforePayment.orderId,
            storeId,
            tenantId,
          }),
        ).rejects.toThrow()
        await expect(
          createPrescriptionDeliveryAssignment(db, {
            actorUserId,
            courierDisplayName: "Premature Courier",
            courierReference: `premature-unpaid-${prepared.runId}`,
            orderId: acceptedBeforePayment.orderId,
            storeId,
            tenantId,
          }),
        ).rejects.toThrow()
      },
      origin,
      quoteToken: deliverySelection.acceptanceToken,
      runId: prepared.runId,
      totalMinor: 3_000,
    })
    expect(Number(inventoryAfterAcceptance.reservedQuantity)).toBe(
      Number(prepared.inventoryBeforeAcceptance.reservedQuantity) + 1,
    )
    await expect(
      createPrescriptionDeliveryAssignment(db, {
        actorUserId,
        courierDisplayName: "Premature Courier",
        courierReference: `premature-unpacked-${prepared.runId}`,
        orderId: accepted.orderId,
        storeId,
        tenantId,
      }),
    ).rejects.toThrow()

    const beforePacking = await listPrescriptionDeliveryQueue(db, {
      storeId,
      tenantId,
    })
    expect(beforePacking.map((item) => item.id)).toContain(accepted.orderId)
    await expect(
      markPrescriptionDeliveryReady(db, {
        actorUserId: `unauthorized-${prepared.runId}`,
        checks: { label_matches: true, pharmacist_released: true },
        orderId: accepted.orderId,
        storeId,
        tenantId,
      }),
    ).rejects.toThrow()
    const ready = await markPrescriptionDeliveryReady(db, {
      actorUserId,
      checks: { label_matches: true, pharmacist_released: true },
      orderId: accepted.orderId,
      storeId,
      tenantId,
    })
    expect(ready.assignment.status).toBe(
      PrescriptionDeliveryStatus.READY_FOR_ASSIGNMENT,
    )
    const assigned = await createPrescriptionDeliveryAssignment(db, {
      actorUserId,
      courierDisplayName: "Synthetic Courier",
      courierPhoneMasked: "******1111",
      courierReference: `courier-${prepared.runId}`,
      orderId: accepted.orderId,
      storeId,
      tenantId,
    })
    expect(assigned.status).toBe(PrescriptionDeliveryStatus.ASSIGNED)

    const failed = await transitionPrescriptionDelivery(db, {
      actorUserId,
      assignmentId: ready.assignment.id,
      clientOperationId: `${origin}-delivery-failed-${prepared.runId}`,
      reason: "Synthetic customer unavailable",
      status: "failed",
      storeId,
      tenantId,
    })
    expect(failed.assignment.status).toBe(PrescriptionDeliveryStatus.FAILED)
    const rescheduled = await transitionPrescriptionDelivery(db, {
      actorUserId,
      assignmentId: ready.assignment.id,
      clientOperationId: `${origin}-delivery-rescheduled-${prepared.runId}`,
      reason: "Synthetic customer confirmed a new time",
      status: "rescheduled",
      storeId,
      tenantId,
    })
    expect(rescheduled.assignment.status).toBe(
      PrescriptionDeliveryStatus.RESCHEDULED,
    )
    const reassigned = await createPrescriptionDeliveryAssignment(db, {
      actorUserId,
      courierDisplayName: "Synthetic Recovery Courier",
      courierPhoneMasked: "******2222",
      courierReference: `recovery-courier-${prepared.runId}`,
      orderId: accepted.orderId,
      storeId,
      tenantId,
    })
    expect(reassigned.status).toBe(PrescriptionDeliveryStatus.ASSIGNED)

    const operationalQueue = await listPrescriptionDeliveryQueue(db, {
      storeId,
      tenantId,
    })
    const queueItem = operationalQueue.find(
      (item) => item.id === accepted.orderId,
    )
    expect(queueItem).toMatchObject({
      prescriptionDeliveryAddress: {
        feeMinor: 500,
        promiseText: "Delivery within four hours",
      },
      prescriptionDeliveryAssignment: {
        courierDisplayName: "Synthetic Recovery Courier",
        courierReference: `recovery-courier-${prepared.runId}`,
        status: "ASSIGNED",
      },
      totalMinor: 3_000,
    })
    expect(JSON.stringify(queueItem)).not.toMatch(
      /Acceptance Road|2348111111111|Acceptance Medicine|objectKey|transcription|credential/i,
    )
    await expect(
      listPrescriptionDeliveryQueue(db, {
        storeId,
        tenantId: "cross-tenant-acceptance",
      }),
    ).resolves.toEqual([])

    const assignmentId = ready.assignment.id
    await transitionPrescriptionDelivery(db, {
      actorUserId,
      assignmentId,
      clientOperationId: `${origin}-delivery-collected-${prepared.runId}`,
      status: "collected",
      storeId,
      tenantId,
    })
    await transitionPrescriptionDelivery(db, {
      actorUserId,
      assignmentId,
      clientOperationId: `${origin}-delivery-transit-${prepared.runId}`,
      status: "in_transit",
      storeId,
      tenantId,
    })
    const completionInput = {
      actorUserId,
      assignmentId,
      clientOperationId: `${origin}-delivery-completed-${prepared.runId}`,
      proofReference: `proof-${prepared.runId}`,
      status: "delivered" as const,
      storeId,
      tenantId,
    }
    const completions = await Promise.all([
      transitionPrescriptionDelivery(db, completionInput),
      transitionPrescriptionDelivery(db, completionInput),
    ])
    expect(completions.map((result) => result.assignment.status)).toEqual([
      PrescriptionDeliveryStatus.DELIVERED,
      PrescriptionDeliveryStatus.DELIVERED,
    ])

    const [completedOrder, completedDelivery, completionEvents] =
      await Promise.all([
        db.commercialOrder.findUniqueOrThrow({
          where: { id: accepted.orderId },
        }),
        db.prescriptionDeliveryAssignment.findUniqueOrThrow({
          include: { address: true },
          where: { id: assignmentId },
        }),
        db.prescriptionDeliveryEvent.findMany({
          orderBy: { effectiveAt: "asc" },
          where: { assignmentId },
        }),
      ])
    expect(completedOrder).toMatchObject({
      paymentStatus: PaymentStatus.PAID,
      status: OrderStatus.COMPLETED,
      totalMinor: 3_000,
    })
    expect(completedDelivery).toMatchObject({
      proofReference: `proof-${prepared.runId}`,
      status: PrescriptionDeliveryStatus.DELIVERED,
    })
    expect(completedDelivery.address.encryptedPayload).not.toMatch(
      /Acceptance Road|2348111111111/,
    )
    expect(completionEvents.map((event) => event.type)).toEqual([
      "CREATED",
      "ASSIGNED",
      "FAILED",
      "RESCHEDULED",
      "ASSIGNED",
      "COLLECTED",
      "IN_TRANSIT",
      "DELIVERED",
    ])
    expect(
      completionEvents.filter(
        (event) => event.idempotencyKey === completionInput.clientOperationId,
      ),
    ).toHaveLength(1)
    const afterCompletion = await listPrescriptionDeliveryQueue(db, {
      storeId,
      tenantId,
    })
    expect(afterCompletion.map((item) => item.id)).not.toContain(
      accepted.orderId,
    )
    const communicationIntents =
      await db.prescriptionCommunicationIntent.findMany({
        where: { orderId: accepted.orderId, storeId, tenantId },
      })
    expect(communicationIntents.map((intent) => intent.type)).toEqual(
      expect.arrayContaining(["DELIVERY_FAILED", "DELIVERY_PROGRESS"]),
    )
    expect(JSON.stringify(communicationIntents)).not.toMatch(
      /Acceptance Road|Acceptance Medicine|objectKey|transcription/i,
    )
    const report = await getPrescriptionOperationsReport(db, {
      from: fixtureStartedAt,
      storeId,
      tenantId,
      to: new Date(Date.now() + 60_000),
    })
    expect(report.deliveryCompleted).toBeGreaterThanOrEqual(1)
    expect(report.usage.map((event) => event.eventType)).toContain(
      "DELIVERY_COMPLETED",
    )
    return completedOrder.id
  }

  const origins = [
    ["web", PrescriptionRequestSource.WEB],
    ["staff", PrescriptionRequestSource.STAFF_WALK_IN],
    ["whatsapp", PrescriptionRequestSource.WHATSAPP],
  ] as const

  for (const [origin, expectedSource] of origins) {
    test(`completes a safe-media paid pickup lifecycle from ${origin} intake`, async () => {
      expect(await completePickup(origin)).toBe(expectedSource)
    }, 180_000)

    test(`completes a fixed-fee paid delivery lifecycle from ${origin} intake`, async () => {
      expect(await completeDelivery(origin)).toEqual(expect.any(String))
    }, 360_000)
  }

  test("completes an authorized manual-fee delivery quote through paid acceptance", async () => {
    const prepared = await prepareReleasedQuote("web", "delivery")
    const manualSelection = await revisePrescriptionQuoteForDelivery(db, {
      acceptanceToken: prepared.quoteToken,
      address: {
        addressLine1: "2 Synthetic Manual Review Road",
        locality: " manual review district ",
        postalCode: "100002",
        recipientName: "Synthetic Acceptance Customer",
        recipientPhone: "+2348111111111",
        region: "Lagos",
      },
    })
    expect(manualSelection).toMatchObject({
      acceptanceToken: null,
      outcome: "manual_review",
    })
    if (manualSelection.outcome !== "manual_review") {
      throw new Error("Manual delivery review was not created.")
    }
    const reviews = await listPrescriptionManualDeliveryReviews(db, {
      storeId,
      tenantId,
    })
    expect(reviews.map((review) => review.id)).toContain(
      manualSelection.manualReviewId,
    )
    const clientDecisionId = `manual-delivery-${prepared.runId}`
    const approved = await approvePrescriptionManualDeliveryFee(db, {
      actorUserId,
      addressId: manualSelection.manualReviewId,
      clientDecisionId,
      feeMinor: 750,
      reason: "Synthetic courier estimate confirmed",
      storeId,
      tenantId,
    })
    if (!approved.acceptanceToken) {
      throw new Error("Approved manual delivery token was not issued.")
    }
    await expect(
      getPublicPrescriptionQuote(db, {
        acceptanceToken: prepared.quoteToken,
      }),
    ).rejects.toThrow("Quote is unavailable")
    const manualQuote = await getPublicPrescriptionQuote(db, {
      acceptanceToken: approved.acceptanceToken,
    })
    expect(manualQuote).toMatchObject({
      fulfilmentFeeMinor: 750,
      fulfilmentPromise: "Delivery after staff confirmation",
      fulfilmentType: "delivery",
      totalMinor: 3_250,
      version: 2,
    })
    expect(JSON.stringify(manualQuote)).not.toMatch(
      /Manual Review Road|2348111111111|evaluationReason|tenantId/i,
    )
    const acceptanceInput = {
      acceptanceToken: approved.acceptanceToken,
      clientAcceptanceId: `manual-delivery-acceptance-${prepared.runId}`,
      partialAcknowledged: false,
    }
    const { accepted, inventoryAfterAcceptance } = await acceptAndPay({
      accept: () => acceptPrescriptionDeliveryQuote(db, acceptanceInput),
      afterAcceptance: async (acceptedBeforePayment) => {
        await expect(
          markPrescriptionDeliveryReady(db, {
            actorUserId,
            checks: { label_matches: true, pharmacist_released: true },
            orderId: acceptedBeforePayment.orderId,
            storeId,
            tenantId,
          }),
        ).rejects.toThrow()
      },
      origin: "web",
      quoteToken: approved.acceptanceToken,
      runId: `manual-${prepared.runId}`,
      totalMinor: 3_250,
    })
    expect(Number(inventoryAfterAcceptance.reservedQuantity)).toBe(
      Number(prepared.inventoryBeforeAcceptance.reservedQuantity) + 1,
    )
  }, 360_000)

  test("completes the Commerce Quote Service request-to-order lifecycle", async () => {
    const runId = randomUUID()
    const requestForm = await createServiceRequestForm(db, {
      actorUserId,
      label: "Acceptance Service Form",
      offeringIds: [serviceOfferingId],
      storeId,
      tenantId,
    })
    const requestInput = {
      clientRequestId: `service-request-${runId}`,
      customerEmail: `service-${runId}@example.invalid`,
      customerName: "Synthetic Service Customer",
      customerPhone: "+2348222222222",
      details: "Synthetic regression request.",
      formToken: requestForm.token,
      lines: [
        {
          offeringId: serviceOfferingId,
          quantity: "1",
        },
      ],
    }
    const request = await submitPublicServiceRequest(db, requestInput)
    await expect(
      submitPublicServiceRequest(db, requestInput),
    ).resolves.toMatchObject({ id: request.id })

    const issued = await issueServiceQuote(db, {
      actorUserId,
      clientQuoteId: `service-quote-${runId}`,
      clientVersionId: `service-quote-version-${runId}`,
      lines: [
        {
          offeringId: serviceOfferingId,
          quantity: "1",
          unitPriceMinor: 7_500,
        },
      ],
      requestId: request.id,
      storeId,
      tenantId,
    })
    if (!issued.token) throw new Error("Service Quote token was not issued.")
    await expect(
      getPublicServiceQuote(db, { acceptanceToken: issued.token }),
    ).resolves.toMatchObject({
      accepted: false,
      sourceType: "service_request",
      storeName: "Acceptance Pharmacy",
      totalMinor: 7_500,
      version: 1,
    })

    const acceptanceInput = {
      acceptanceToken: issued.token,
      actorUserId,
      clientAcceptanceId: `service-acceptance-${runId}`,
    }
    const accepted = await acceptServiceQuote(db, acceptanceInput)
    await expect(acceptServiceQuote(db, acceptanceInput)).resolves.toEqual(
      accepted,
    )

    const [convertedRequest, order, publicAccepted] = await Promise.all([
      db.serviceRequest.findUniqueOrThrow({ where: { id: request.id } }),
      db.commercialOrder.findUniqueOrThrow({
        include: { lines: true },
        where: { id: accepted.orderId },
      }),
      getPublicServiceQuote(db, { acceptanceToken: issued.token }),
    ])
    expect(convertedRequest.status).toBe("CONVERTED")
    expect(convertedRequest.convertedAt).toBeInstanceOf(Date)
    expect(order).toMatchObject({
      customerEmail: requestInput.customerEmail,
      customerName: requestInput.customerName,
      customerPhone: requestInput.customerPhone,
      storeId,
      tenantId,
      totalMinor: 7_500,
    })
    expect(order.lines).toHaveLength(1)
    expect(order.lines[0]).toMatchObject({
      kind: "SERVICE",
      offeringId: serviceOfferingId,
      totalMinor: 7_500,
      unitPriceMinor: 7_500,
    })
    expect(publicAccepted).toMatchObject({ accepted: true, totalMinor: 7_500 })
  }, 180_000)
})
