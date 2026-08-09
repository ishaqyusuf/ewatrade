import { randomUUID } from "node:crypto"

import { expect } from "bun:test"

import { PrescriptionMediaStatus } from "../../../../generated/prisma/enums"
import { getCatalogOfferingAvailability } from "../../catalog-inventory"
import {
  attachPrescriptionHostedCheckout,
  getPublicPrescriptionPaymentStatus,
  preparePrescriptionHostedCheckout,
  processPrescriptionPaymentProviderEvent,
} from "../../prescription-payments"
import {
  completePrescriptionTranscription,
  getPublicPrescriptionQuote,
  issuePrescriptionQuote,
  markPrescriptionMediaReadyForTranscription,
  recordPrescriptionMediaSafety,
  recordPrescriptionPharmacistReview,
  submitPrescriptionForPharmacistReview,
  submitPublicPrescriptionRequest,
  submitStaffPrescriptionRequest,
  submitWhatsAppPrescriptionRequest,
  verifyPrescriptionTranscriptionLine,
} from "../../prescription-requests"
import type { ServiceCommerceAcceptanceFixture } from "./fixture"

export type IntakeOrigin = "staff" | "web" | "whatsapp"

async function submitPrescription(
  fixture: ServiceCommerceAcceptanceFixture,
  origin: IntakeOrigin,
  runId: string,
  fulfillmentPreference: "delivery" | "pickup",
) {
  const common = {
    clientRequestId: `${origin}-request-${runId}`,
    consentAcceptedAt: new Date(),
    consentVersion: "acceptance-v1",
    customerEmail: `${origin}-${runId}@example.invalid`,
    customerName: "Synthetic Acceptance Customer",
    customerPhone: "+2348111111111",
    fulfilmentPreference: fulfillmentPreference,
    media: [
      {
        clientMediaId: `${origin}-media-${runId}`,
        mediaType: "image/jpeg",
        objectKey: `private/${fixture.tenantId}/${fixture.storeId}/${runId}/page-1.jpg`,
        originalFileName: "safe-test-prescription.jpg",
        pageNumber: 1,
        sha256: "a".repeat(64),
        sizeBytes: 1_024,
      },
    ],
  }
  if (origin === "web") {
    return submitPublicPrescriptionRequest(fixture.db, {
      ...common,
      publicToken: fixture.publicToken,
    })
  }
  if (origin === "whatsapp") {
    return submitWhatsAppPrescriptionRequest(fixture.db, {
      ...common,
      providerEventId: `meta-${runId}`,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    })
  }
  return submitStaffPrescriptionRequest(fixture.db, {
    ...common,
    actorUserId: fixture.actorUserId,
    source: "staff_walk_in",
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
  })
}

export async function prepareReleasedPrescriptionQuote(
  fixture: ServiceCommerceAcceptanceFixture,
  origin: IntakeOrigin,
  fulfillmentPreference: "delivery" | "pickup",
) {
  const runId = randomUUID()
  const intake = await submitPrescription(
    fixture,
    origin,
    runId,
    fulfillmentPreference,
  )
  expect(intake.created).toBe(true)
  if (!intake.statusToken) {
    throw new Error("Prescription status token was not issued.")
  }

  const media = await fixture.db.prescriptionMedia.findFirstOrThrow({
    where: {
      requestId: intake.requestId,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    },
  })
  await recordPrescriptionMediaSafety(fixture.db, {
    mediaId: media.id,
    outcome: "safe",
    providerEventId: `${origin}-safety-${runId}`,
    safetyMetadata: { adapter: "deterministic-acceptance" },
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
  })
  const transcription = await markPrescriptionMediaReadyForTranscription(
    fixture.db,
    {
      actorUserId: fixture.actorUserId,
      requestId: intake.requestId,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    },
  )
  await completePrescriptionTranscription(fixture.db, {
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
  const safeMedia = await fixture.db.prescriptionMedia.findUniqueOrThrow({
    where: { id: media.id },
  })
  expect(safeMedia.status).toBe(PrescriptionMediaStatus.SAFE)

  const request = await fixture.db.prescriptionRequest.findFirstOrThrow({
    include: {
      transcriptions: {
        include: { lines: true },
        where: { revision: 1 },
      },
    },
    where: {
      id: intake.requestId,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    },
  })
  const line = request.transcriptions[0]?.lines[0]
  if (!line) throw new Error("OCR transcription line was not created.")
  await expect(
    submitPrescriptionForPharmacistReview(fixture.db, {
      actorUserId: fixture.actorUserId,
      requestId: request.id,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    }),
  ).rejects.toMatchObject({ code: "TRANSCRIPT_NOT_READY" })
  await verifyPrescriptionTranscriptionLine(fixture.db, {
    actorUserId: fixture.actorUserId,
    lineId: line.id,
    status: "verified",
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
    verifiedText: "Acceptance Medicine, one tablet",
  })
  await submitPrescriptionForPharmacistReview(fixture.db, {
    actorUserId: fixture.actorUserId,
    requestId: request.id,
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
  })
  await recordPrescriptionPharmacistReview(fixture.db, {
    actorUserId: fixture.actorUserId,
    decision: "released",
    expectedMediaRevision: request.currentMediaRevision,
    expectedTranscriptRevision: 1,
    lines: [
      {
        availability: "available",
        offeringId: fixture.offeringId,
        quantity: "1",
        transcriptionLineId: line.id,
      },
    ],
    requestId: request.id,
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
  })
  const inventoryBeforeAcceptance = await getCatalogOfferingAvailability(
    fixture.db,
    {
      offeringId: fixture.offeringId,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    },
  )
  const quote = await issuePrescriptionQuote(fixture.db, {
    actorUserId: fixture.actorUserId,
    availabilityOutcome: "full",
    clientQuoteId: `${origin}-quote-${runId}`,
    clientVersionId: `${origin}-quote-version-${runId}`,
    lines: [{ transcriptionLineId: line.id, unitPriceMinor: 2_500 }],
    requestId: request.id,
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
  })
  if (!quote.token) throw new Error("Quote acceptance token was not issued.")
  const publicQuote = await getPublicPrescriptionQuote(fixture.db, {
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

export async function acceptAndPayPrescriptionQuote<
  TAccepted extends { orderId: string },
>(
  fixture: ServiceCommerceAcceptanceFixture,
  input: {
    accept: () => Promise<TAccepted>
    afterAcceptance?: (accepted: TAccepted) => Promise<void>
    origin: IntakeOrigin
    quoteToken: string
    runId: string
    totalMinor: number
  },
) {
  const [accepted, acceptanceReplay] = await Promise.all([
    input.accept(),
    input.accept(),
  ])
  expect(acceptanceReplay.orderId).toBe(accepted.orderId)
  await input.afterAcceptance?.(accepted)
  const inventoryAfterAcceptance = await getCatalogOfferingAvailability(
    fixture.db,
    {
      offeringId: fixture.offeringId,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    },
  )

  const checkout = await preparePrescriptionHostedCheckout(fixture.db, {
    acceptanceToken: input.quoteToken,
    clientPaymentId: `${input.origin}-payment-${input.runId}`,
    provider: "acceptance-fake",
    statusToken: `${input.origin}-status-${input.runId}`,
  })
  await attachPrescriptionHostedCheckout(fixture.db, {
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
    processPrescriptionPaymentProviderEvent(fixture.db, paymentInput),
  ).resolves.toMatchObject({ replay: false })
  await expect(
    processPrescriptionPaymentProviderEvent(fixture.db, paymentInput),
  ).resolves.toEqual({ replay: true })
  await expect(
    getPublicPrescriptionPaymentStatus(fixture.db, {
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
