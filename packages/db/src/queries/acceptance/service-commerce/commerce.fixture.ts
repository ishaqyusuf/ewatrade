import { randomUUID } from "node:crypto"

import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

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
import { assignCustomerChannelAttendant } from "../../customer-channels"
import { updateServiceCommerceStoreProfile } from "../../service-commerce-access"

/**
 * Shared non-regulated Commerce fixture for acceptance seams such as the bag
 * seller journey. It deliberately owns generic Channel, policy and Commerce
 * configuration only; vertical-specific fixtures remain separate.
 */
export type CommerceAcceptanceFixture = {
  actorUserId: string
  cleanupUserIds: string[]
  connectionId: string
  db: PrismaClient
  fixtureStartedAt: Date
  storeId: string
  tenantId: string
}

const commerceSettings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: true,
    booking: false,
    delivery: true,
    intake: true,
    payment: true,
    pickup: true,
    progressive_catalog: true,
    quote: true,
    service_completion: false,
    staff: true,
    web: true,
    whatsapp: true,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: true,
}

async function deleteCommerceAcceptanceFixture(
  db: PrismaClient,
  input: { tenantId: string; userIds: string[] },
) {
  await db.$transaction(async (tx) => {
    const { tenantId, userIds } = input

    // Delete dependants in relation order. The fixture is also safe for a
    // future generic bag journey that adds Quote, Order, media or action rows.
    await tx.serviceCommerceUsageEvent.deleteMany({ where: { tenantId } })
    await tx.serviceCommerceCustomerNotificationReceipt.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceCustomerNotificationAttempt.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceCustomerActionExecution.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceCustomerActionCapability.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceCustomerNotificationIntent.deleteMany({
      where: { tenantId },
    })
    await tx.serviceBookingNotificationIntent.deleteMany({
      where: { tenantId },
    })
    await tx.serviceBookingEvent.deleteMany({ where: { tenantId } })
    await tx.serviceBookingHold.deleteMany({ where: { tenantId } })
    await tx.serviceBookingAccessCapability.deleteMany({ where: { tenantId } })
    await tx.serviceBooking.deleteMany({ where: { tenantId } })
    await tx.serviceBookingConfigurationEvent.deleteMany({
      where: { tenantId },
    })
    await tx.serviceBookingAvailabilityException.deleteMany({
      where: { tenantId },
    })
    await tx.serviceBookingAvailabilityRule.deleteMany({ where: { tenantId } })
    await tx.serviceBookingOfferingResource.deleteMany({
      where: { offeringConfig: { tenantId } },
    })
    await tx.serviceBookingOfferingConfig.deleteMany({ where: { tenantId } })
    await tx.serviceBookingResource.deleteMany({ where: { tenantId } })
    await tx.serviceBookingStoreSettings.deleteMany({ where: { tenantId } })
    await tx.serviceJob.deleteMany({ where: { tenantId } })
    await tx.serviceCommerceQuoteApprovalAuditEvent.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceQuoteApproval.deleteMany({ where: { tenantId } })
    await tx.serviceCommerceQuoteReleaseCommandReceipt.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceQuoteReleasePolicyAuditEvent.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceQuoteReleasePolicy.deleteMany({
      where: { tenantId },
    })
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
    await tx.commerceInquiryAuditEvent.deleteMany({ where: { tenantId } })
    await tx.whatsAppInboundEvent.deleteMany({ where: { tenantId } })
    await tx.whatsAppConnectionAuditEvent.deleteMany({ where: { tenantId } })
    await tx.whatsAppStoreBinding.deleteMany({ where: { tenantId } })
    await tx.whatsAppConnection.deleteMany({ where: { tenantId } })
    await tx.serviceCommerceStoreTeamAuditEvent.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceStoreTeamAssignment.deleteMany({
      where: { tenantId },
    })
    await tx.serviceCommerceStoreAuditEvent.deleteMany({ where: { tenantId } })
    await tx.serviceCommerceStoreProfile.deleteMany({ where: { tenantId } })
    await tx.catalogPricePromotion.deleteMany({ where: { tenantId } })
    // Accepted Quote Versions retain a restrictive pointer to the commercial
    // Order. Clear only this run-owned association before deleting the Quote
    // graph, then remove the Order and its payments below.
    await tx.commerceQuoteVersion.updateMany({
      data: { acceptedOrderId: null },
      where: { quote: { tenantId } },
    })
    await tx.commerceQuote.deleteMany({ where: { tenantId } })
    await tx.catalogAvailabilityAttestation.deleteMany({ where: { tenantId } })
    await tx.catalogVerifiedAlias.deleteMany({ where: { tenantId } })
    await tx.catalogSourceLineLink.deleteMany({ where: { tenantId } })
    await tx.commerceInquiry.deleteMany({ where: { tenantId } })
    await tx.serviceRequest.deleteMany({ where: { tenantId } })
    await tx.serviceRequestForm.deleteMany({ where: { tenantId } })
    await tx.stockReservation.deleteMany({ where: { tenantId } })
    await tx.offeringSnapshot.deleteMany({
      where: { orderLine: { order: { tenantId } } },
    })
    await tx.commercialOrderReminderDelivery.deleteMany({ where: { tenantId } })
    await tx.commercialOrderFulfillmentCommand.deleteMany({
      where: { tenantId },
    })
    await tx.commercialOrderPayment.deleteMany({ where: { tenantId } })
    await tx.commercialOrder.deleteMany({ where: { tenantId } })
    await tx.stockMovement.deleteMany({ where: { operation: { tenantId } } })
    await tx.stockOperation.deleteMany({ where: { tenantId } })
    await tx.stockBalanceSource.deleteMany({ where: { tenantId } })
    await tx.catalogPriceChange.deleteMany({ where: { tenantId } })
    await tx.catalogCommandReceipt.deleteMany({ where: { tenantId } })
    await tx.catalogItem.deleteMany({ where: { tenantId } })
    await tx.tenant.delete({ where: { id: tenantId } })
    await tx.user.deleteMany({
      where: { id: { in: userIds }, memberships: { none: {} } },
    })
  })
}

export async function createCommerceAcceptanceFixture(): Promise<CommerceAcceptanceFixture> {
  const db = (await import("../../../client")).prisma
  const fixtureId = randomUUID()
  const fixtureStartedAt = new Date(Date.now() - 60_000)
  let actorUserId: string | undefined
  let tenantId: string | undefined

  try {
    const actor = await db.user.create({
      data: {
        email: `commerce-acceptance-${fixtureId}@example.invalid`,
        emailVerified: true,
        name: "Commerce Acceptance Attendant",
      },
    })
    actorUserId = actor.id
    const tenant = await db.tenant.create({
      data: {
        dataClassification: QaDataClassification.QA,
        enabledModes: [TenantMode.MERCHANT],
        name: "Commerce Acceptance",
        slug: `commerce-acceptance-${fixtureId}`,
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
    const store = await db.store.create({
      data: {
        countryCode: "NG",
        name: "Commerce Acceptance Store",
        slug: `commerce-acceptance-${fixtureId}`,
        status: StoreStatus.ACTIVE,
        supportEmail: "commerce@example.invalid",
        supportPhone: "+2348111111111",
        tenantId: tenant.id,
      },
    })
    const membership = await db.membership.findFirstOrThrow({
      where: { tenantId: tenant.id, userId: actor.id },
    })
    await assignCustomerChannelAttendant(db, {
      actorUserId: actor.id,
      membershipId: membership.id,
      reason: "Generic Commerce acceptance attendant",
      storeId: store.id,
      tenantId: tenant.id,
    })
    await db.serviceCommercePolicyDecision.createMany({
      data: Object.values(ServiceCommercePolicyChannel).flatMap((channel) =>
        Object.values(ServiceCommercePolicySubject).map((subject) => ({
          approvalReference: `commerce-policy-${fixtureId}`,
          channel,
          effectiveAt: fixtureStartedAt,
          evidenceReference: `commerce-evidence-${fixtureId}`,
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
          jurisdictionCode: "NG",
          outcome: ServiceCommercePolicyOutcome.ALLOWED,
          reason: "Run-owned generic Commerce acceptance policy",
          reviewedByUserId: actor.id,
          storeId: store.id,
          subject,
          tenantId: tenant.id,
          vertical: ServiceCommercePolicyVertical.SERVICE,
        })),
      ),
    })
    const connection = await db.whatsAppConnection.create({
      data: {
        billingOwner: "BUSINESS",
        businessDisplayName: "Commerce Acceptance Store",
        businessVerified: true,
        createdByUserId: actor.id,
        credentialReference: `commerce-private-${fixtureId}`,
        displayNumber: "+2348111111111",
        numberVerified: true,
        outboundVerified: true,
        phoneNumberId: `commerce-phone-${fixtureId}`,
        status: "ACTIVE",
        templatesReady: true,
        tenantId: tenant.id,
        wabaId: `commerce-waba-${fixtureId}`,
        webhookSubscribed: true,
      },
    })
    await db.whatsAppStoreBinding.create({
      data: {
        activatedAt: fixtureStartedAt,
        boundByUserId: actor.id,
        connectionId: connection.id,
        status: "ACTIVE",
        storeId: store.id,
        tenantId: tenant.id,
      },
    })
    const profile = await updateServiceCommerceStoreProfile(db, {
      actorUserId: actor.id,
      expectedRevision: 0,
      reason: "Prepare generic Commerce acceptance profile",
      settings: commerceSettings,
      storeId: store.id,
      tenantId: tenant.id,
    })
    await db.serviceCommerceStoreProfile.updateMany({
      data: { attachmentsProviderReady: true },
      where: {
        revision: profile.revision,
        storeId: store.id,
        tenantId: tenant.id,
      },
    })

    return {
      actorUserId: actor.id,
      cleanupUserIds: [actor.id],
      connectionId: connection.id,
      db,
      fixtureStartedAt,
      storeId: store.id,
      tenantId: tenant.id,
    }
  } catch (error) {
    if (tenantId && actorUserId) {
      await deleteCommerceAcceptanceFixture(db, {
        tenantId,
        userIds: [actorUserId],
      })
    } else if (actorUserId) {
      await db.user.deleteMany({ where: { id: actorUserId } })
    }
    throw error
  }
}

export async function disposeCommerceAcceptanceFixture(
  fixture: CommerceAcceptanceFixture,
) {
  await deleteCommerceAcceptanceFixture(fixture.db, {
    tenantId: fixture.tenantId,
    userIds: fixture.cleanupUserIds,
  })
}
