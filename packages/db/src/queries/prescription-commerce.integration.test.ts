import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  MembershipRole,
  OrderStatus,
  PaymentStatus,
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
  handoffPrescriptionPickup,
  listPrescriptionPickupQueue,
  markPrescriptionPickupReady,
} from "./prescription-fulfillment"
import {
  attachPrescriptionHostedCheckout,
  getPublicPrescriptionPaymentStatus,
  preparePrescriptionHostedCheckout,
  processPrescriptionPaymentProviderEvent,
} from "./prescription-payments"
import { getPrescriptionOperationsReport } from "./prescription-reporting"
import {
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

const databaseUrl = process.env.DATABASE_URL
const databaseIntegrationEnabled =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"

if (databaseIntegrationEnabled) {
  if (
    process.env.EWATRADE_DATABASE_PROFILE_VERIFIED !== "1" ||
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
    await tx.prescriptionPaymentIntent.deleteMany({ where: { tenantId } })
    await tx.commerceQuote.deleteMany({ where: { tenantId } })
    await tx.prescriptionRequest.deleteMany({ where: { tenantId } })
    await tx.stockReservation.deleteMany({ where: { tenantId } })
    await tx.offeringSnapshot.deleteMany({
      where: { orderLine: { order: { tenantId } } },
    })
    await tx.commercialOrder.deleteMany({ where: { tenantId } })
    await tx.stockMovement.deleteMany({ where: { operation: { tenantId } } })
    await tx.stockOperation.deleteMany({ where: { tenantId } })
    await tx.stockBalanceSource.deleteMany({ where: { tenantId } })
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
      deliveryEnabled: false,
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
  })

  afterAll(async () => {
    if (tenantId && actorUserId) {
      await deleteAcceptanceFixture(db, { tenantId, userId: actorUserId })
    } else if (actorUserId) {
      await db.user.deleteMany({ where: { id: actorUserId } })
    }
    await db.$disconnect()
  })

  async function submit(origin: IntakeOrigin, runId: string) {
    const common = {
      clientRequestId: `${origin}-request-${runId}`,
      consentAcceptedAt: new Date(),
      consentVersion: "acceptance-v1",
      customerEmail: `${origin}-${runId}@example.invalid`,
      customerName: "Synthetic Acceptance Customer",
      customerPhone: "+2348111111111",
      fulfilmentPreference: "pickup" as const,
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

  async function completePickup(origin: IntakeOrigin) {
    const runId = randomUUID()
    const intake = await submit(origin, runId)
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
    const acceptanceInput = {
      acceptanceToken: quote.token,
      clientAcceptanceId: `${origin}-acceptance-${runId}`,
      partialAcknowledged: false,
    }
    const [accepted, acceptanceReplay] = await Promise.all([
      acceptPrescriptionPickupQuote(db, acceptanceInput),
      acceptPrescriptionPickupQuote(db, acceptanceInput),
    ])
    expect(acceptanceReplay.orderId).toBe(accepted.orderId)
    const inventoryAfterAcceptance = await getCatalogOfferingAvailability(db, {
      offeringId,
      storeId,
      tenantId,
    })
    expect(Number(inventoryAfterAcceptance.reservedQuantity)).toBe(
      Number(inventoryBeforeAcceptance.reservedQuantity) + 1,
    )

    const checkout = await preparePrescriptionHostedCheckout(db, {
      acceptanceToken: quote.token,
      clientPaymentId: `${origin}-payment-${runId}`,
      provider: "acceptance-fake",
      statusToken: `${origin}-status-${runId}`,
    })
    await attachPrescriptionHostedCheckout(db, {
      checkoutUrl: `https://payments.example.invalid/${checkout.intentId}`,
      intentId: checkout.intentId,
      providerReference: checkout.providerReference,
    })
    const paymentInput = {
      amountMinor: checkout.amountMinor,
      currencyCode: checkout.currencyCode,
      eventId: `${origin}-provider-event-${runId}`,
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
      amountPaidMinor: 2_500,
      balanceDueMinor: 0,
      status: "paid",
      totalMinor: 2_500,
    })

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
      statusToken: intake.statusToken,
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
      clientOperationId: `${origin}-handoff-${runId}`,
      collectorName: "Synthetic Acceptance Customer",
      fulfillmentId: fulfillment.id,
      pickupCode: ready.pickupCode,
      storeId,
      tenantId,
    }
    await expect(handoffPrescriptionPickup(db, handoffInput)).resolves.toEqual({
      handedOff: true,
    })
    await expect(handoffPrescriptionPickup(db, handoffInput)).resolves.toEqual({
      handedOff: true,
    })

    const [completedRequest, completedOrder, completedPickup] =
      await Promise.all([
        db.prescriptionRequest.findUniqueOrThrow({
          where: { id: request.id },
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
        statusToken: intake.statusToken,
      }),
    ).resolves.toMatchObject({ pickup: null, status: "converted" })
    const managementRequest = await getPrescriptionRequest(db, {
      actorUserId,
      reason: "acceptance_evidence",
      requestId: request.id,
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
    expect(report.channelMix[completedRequest.source.toLowerCase()]).toBe(1)
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

  const origins = [
    ["web", PrescriptionRequestSource.WEB],
    ["staff", PrescriptionRequestSource.STAFF_WALK_IN],
    ["whatsapp", PrescriptionRequestSource.WHATSAPP],
  ] as const

  for (const [origin, expectedSource] of origins) {
    test(`completes a safe-media paid pickup lifecycle from ${origin} intake`, async () => {
      expect(await completePickup(origin)).toBe(expectedSource)
    }, 180_000)
  }
})
