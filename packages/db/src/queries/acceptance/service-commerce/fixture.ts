import { randomUUID } from "node:crypto"

import { describe } from "bun:test"

import type { PrismaClient } from "../../../../generated/prisma/client"
import {
  MembershipRole,
  MembershipStatus,
  QaDataClassification,
  ServiceCommercePolicyChannel,
  ServiceCommercePolicyOutcome,
  ServiceCommercePolicySubject,
  ServiceCommercePolicyVertical,
  StoreStatus,
  TenantMode,
  TenantType,
} from "../../../../generated/prisma/enums"
import { createSimpleCatalogItem } from "../../catalog"
import { assignCustomerChannelAttendant } from "../../customer-channels"
import { upsertPrescriptionDeliveryZone } from "../../prescription-fulfillment"
import { ensurePrescriptionChannel } from "../../prescription-requests"
import {
  assignPrescriptionStoreRole,
  setPrescriptionStoreActivation,
  updatePrescriptionStoreSettings,
} from "../../prescription-settings"

const databaseUrl = process.env.DATABASE_URL
const databaseIntegrationEnabled =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"

if (databaseIntegrationEnabled) {
  if (
    process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
    process.env.DEV_PROFILE !== "local"
  ) {
    throw new Error(
      "Service Commerce integration tests require the verified local database profile.",
    )
  }
  const hostname = databaseUrl
    ? new URL(databaseUrl).hostname.toLowerCase().replace(/\.$/, "")
    : ""
  if (!hostname.endsWith(".neon.tech")) {
    throw new Error(
      "Service Commerce integration tests require the .env.local Neon development database.",
    )
  }
}

export const describeWithServiceCommerceDatabase =
  databaseUrl && databaseIntegrationEnabled ? describe : describe.skip

export type ServiceCommerceAcceptanceFixture = {
  actorUserId: string
  db: PrismaClient
  fixtureStartedAt: Date
  offeringId: string
  publicToken: string
  serviceOfferingId: string
  storeId: string
  tenantId: string
}

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
    await tx.prescriptionCommunicationIntent.deleteMany({ where: { tenantId } })
    // Policy audit entries reference policy decisions and Stores with restrictive
    // foreign keys, so remove them before the decisions and tenant-owned Store.
    await tx.serviceCommercePolicyAuditEvent.deleteMany({ where: { tenantId } })
    await tx.serviceCommercePolicyDecision.deleteMany({ where: { tenantId } })
    await tx.serviceCommerceMediaAuditEvent.deleteMany({ where: { tenantId } })
    await tx.serviceCommerceVerifiedObservation.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceSourceAttachment.deleteMany({ where: { tenantId } })
    await tx.serviceCommerceMediaAsset.deleteMany({ where: { tenantId } })
    await tx.customerEntryPointAuditEvent.deleteMany({ where: { tenantId } })
    await tx.customerEntryPoint.deleteMany({ where: { tenantId } })
    await tx.serviceCommerceStoreTeamAuditEvent.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceStoreTeamAssignment.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceStoreAuditEvent.deleteMany({ where: { tenantId } })
    await tx.serviceCommerceStoreProfile.deleteMany({ where: { tenantId } })
    await tx.commerceInquiryAuditEvent.deleteMany({ where: { tenantId } })
    await tx.prescriptionPickupFulfillment.deleteMany({ where: { tenantId } })
    await tx.prescriptionDeliveryAssignment.deleteMany({ where: { tenantId } })
    await tx.prescriptionDeliveryAddress.deleteMany({ where: { tenantId } })
    await tx.prescriptionPaymentIntent.deleteMany({ where: { tenantId } })
    await tx.catalogPricePromotion.deleteMany({ where: { tenantId } })
    await tx.commerceQuote.deleteMany({ where: { tenantId } })
    await tx.catalogAvailabilityAttestation.deleteMany({ where: { tenantId } })
    await tx.catalogVerifiedAlias.deleteMany({ where: { tenantId } })
    await tx.catalogSourceLineLink.deleteMany({ where: { tenantId } })
    await tx.commerceInquiry.deleteMany({ where: { tenantId } })
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

export async function createServiceCommerceAcceptanceFixture(): Promise<ServiceCommerceAcceptanceFixture> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database integration tests.")
  }
  const db = (await import("../../../client")).prisma
  const fixtureStartedAt = new Date(Date.now() - 60_000)
  const fixtureId = randomUUID()
  let actorUserId: string | undefined
  let tenantId: string | undefined

  try {
    const actor = await db.user.create({
      data: {
        email: `service-commerce-acceptance-${fixtureId}@example.invalid`,
        emailVerified: true,
        name: "Service Commerce Acceptance Operator",
      },
    })
    actorUserId = actor.id
    const tenant = await db.tenant.create({
      data: {
        dataClassification: QaDataClassification.QA,
        enabledModes: [TenantMode.MERCHANT],
        name: "Service Commerce Acceptance",
        slug: `service-commerce-acceptance-${fixtureId}`,
        type: TenantType.MERCHANT,
        users: {
          create: {
            acceptedAt: fixtureStartedAt,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
            userId: actor.id,
          },
        },
      },
    })
    tenantId = tenant.id
    const membership = await db.membership.findFirstOrThrow({
      where: { tenantId: tenant.id, userId: actor.id },
    })
    const store = await db.store.create({
      data: {
        countryCode: "NG",
        name: "Acceptance Pharmacy",
        slug: "acceptance-pharmacy",
        status: StoreStatus.ACTIVE,
        supportEmail: "pharmacy@example.invalid",
        supportPhone: "+2348000000000",
        tenantId: tenant.id,
      },
    })
    await assignCustomerChannelAttendant(db, {
      actorUserId: actor.id,
      membershipId: membership.id,
      reason: "Acceptance fixture Store attendant",
      storeId: store.id,
      tenantId: tenant.id,
    })

    // Neon acceptance runs must state policy facts explicitly. These fixture-only
    // approvals include a written reference for Nigerian pharmacy WhatsApp,
    // keeping all exercised Service Commerce and catalog-adoption paths eligible.
    await db.serviceCommercePolicyDecision.createMany({
      data: Object.values(ServiceCommercePolicyVertical).flatMap((vertical) =>
        Object.values(ServiceCommercePolicyChannel).flatMap((channel) =>
          Object.values(ServiceCommercePolicySubject).map((subject) => ({
            approvalReference: `acceptance-policy-approval-${fixtureId}`,
            channel,
            effectiveAt: fixtureStartedAt,
            evidenceReference: `acceptance-policy-evidence-${fixtureId}`,
            expiresAt: new Date("2030-01-01T00:00:00.000Z"),
            jurisdictionCode: "NG",
            outcome: ServiceCommercePolicyOutcome.ALLOWED,
            reason: "Explicit QA acceptance policy approval",
            reviewedByUserId: actor.id,
            storeId: store.id,
            subject,
            tenantId: tenant.id,
            vertical,
          })),
        ),
      ),
    })

    await updatePrescriptionStoreSettings(db, {
      actorUserId: actor.id,
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
      storeId: store.id,
      tenantId: tenant.id,
    })
    await upsertPrescriptionDeliveryZone(db, {
      actorUserId: actor.id,
      currencyCode: "NGN",
      feePolicy: "fixed",
      fixedFeeMinor: 500,
      matchType: "locality",
      matchValues: ["Acceptance District"],
      name: "Acceptance District",
      promiseText: "Delivery within four hours",
      storeId: store.id,
      tenantId: tenant.id,
    })
    await upsertPrescriptionDeliveryZone(db, {
      actorUserId: actor.id,
      currencyCode: "NGN",
      feePolicy: "manual",
      matchType: "locality",
      matchValues: ["Manual Review District"],
      name: "Manual Review District",
      promiseText: "Delivery after staff confirmation",
      storeId: store.id,
      tenantId: tenant.id,
    })
    await assignPrescriptionStoreRole(db, {
      actorUserId: actor.id,
      credentialVerified: false,
      role: "attendant",
      storeId: store.id,
      tenantId: tenant.id,
      userId: actor.id,
    })
    await assignPrescriptionStoreRole(db, {
      actorUserId: actor.id,
      credentialReference: `test-license-${fixtureId}`,
      credentialVerified: true,
      role: "pharmacist",
      storeId: store.id,
      tenantId: tenant.id,
      userId: actor.id,
    })
    await setPrescriptionStoreActivation(db, {
      active: true,
      actorUserId: actor.id,
      storeId: store.id,
      tenantId: tenant.id,
    })
    const channel = await ensurePrescriptionChannel(db, {
      actorUserId: actor.id,
      storeId: store.id,
      tenantId: tenant.id,
    })
    await db.prescriptionChannel.update({
      data: { whatsappEnabled: true },
      where: { id: channel.id },
    })

    const item = await createSimpleCatalogItem(db, {
      actorUserId: actor.id,
      canonicalUnitName: "tablet",
      clientOperationId: `service-commerce-catalog-${fixtureId}`,
      kind: "product",
      name: "Acceptance Medicine",
      openingStockQuantity: "20",
      priceMinor: 2_500,
      storeId: store.id,
      tenantId: tenant.id,
    })
    const offering = item.variants[0]?.offerings[0]
    if (!offering) {
      throw new Error("Acceptance Product Offering was not created.")
    }

    const serviceItem = await createSimpleCatalogItem(db, {
      actorUserId: actor.id,
      authorizationPolicy: "on_order_confirmation",
      clientOperationId: `service-commerce-service-${fixtureId}`,
      kind: "service",
      name: "Acceptance Consultation",
      priceMinor: 7_500,
      quantityScale: 0,
      storeId: store.id,
      tenantId: tenant.id,
      workPolicy: "charge_only",
    })
    const serviceOffering = serviceItem.variants[0]?.offerings[0]
    if (!serviceOffering) {
      throw new Error("Acceptance Service Offering was not created.")
    }

    return {
      actorUserId: actor.id,
      db,
      fixtureStartedAt,
      offeringId: offering.id,
      publicToken: channel.publicToken,
      serviceOfferingId: serviceOffering.id,
      storeId: store.id,
      tenantId: tenant.id,
    }
  } catch (error) {
    if (tenantId && actorUserId) {
      await deleteAcceptanceFixture(db, { tenantId, userId: actorUserId })
    } else if (actorUserId) {
      await db.user.deleteMany({ where: { id: actorUserId } })
    }
    throw error
  }
}

export async function disposeServiceCommerceAcceptanceFixture(
  fixture: ServiceCommerceAcceptanceFixture,
) {
  await deleteAcceptanceFixture(fixture.db, {
    tenantId: fixture.tenantId,
    userId: fixture.actorUserId,
  })
}
