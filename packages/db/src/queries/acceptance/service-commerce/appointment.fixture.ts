import { randomUUID } from "node:crypto"

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

export type AppointmentAcceptanceFixture = {
  actorUserId: string
  approverMembershipId: string
  approverUserId: string
  cleanupUserIds: string[]
  connectionId: string
  db: PrismaClient
  fixtureStartedAt: Date
  serviceOfferingId: string
  storeId: string
  tenantId: string
}

export async function createAppointmentAcceptanceFixture(): Promise<AppointmentAcceptanceFixture> {
  const db = (await import("../../../client")).prisma
  const fixtureId = randomUUID()
  const fixtureStartedAt = new Date(Date.now() - 60_000)
  const actor = await db.user.create({
    data: {
      email: `appointment-acceptance-${fixtureId}@example.invalid`,
      emailVerified: true,
      name: "Appointment Acceptance Operator",
    },
  })
  const cleanupUserIds = [actor.id]
  try {
    const tenant = await db.tenant.create({
      data: {
        dataClassification: QaDataClassification.QA,
        enabledModes: [TenantMode.MERCHANT],
        name: "Appointment Acceptance",
        slug: `appointment-acceptance-${fixtureId}`,
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
    const store = await db.store.create({
      data: {
        countryCode: "NG",
        name: "Appointment Acceptance Studio",
        slug: `appointment-acceptance-${fixtureId}`,
        status: StoreStatus.ACTIVE,
        supportEmail: "appointments@example.invalid",
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
      reason: "Appointment acceptance attendant",
      storeId: store.id,
      tenantId: tenant.id,
    })
    const approver = await db.user.create({
      data: {
        email: `appointment-approver-${fixtureId}@example.invalid`,
        emailVerified: true,
        name: "Appointment Quote Approver",
      },
    })
    cleanupUserIds.push(approver.id)
    const approverMembership = await db.membership.create({
      data: {
        acceptedAt: fixtureStartedAt,
        role: MembershipRole.MEMBER,
        status: MembershipStatus.ACTIVE,
        tenantId: tenant.id,
        userId: approver.id,
      },
    })
    await db.serviceCommercePolicyDecision.createMany({
      data: Object.values(ServiceCommercePolicyVertical)
        .filter(
          (vertical) => vertical === ServiceCommercePolicyVertical.SERVICE,
        )
        .flatMap((vertical) =>
          Object.values(ServiceCommercePolicyChannel).flatMap((channel) =>
            Object.values(ServiceCommercePolicySubject).map((subject) => ({
              approvalReference: `appointment-policy-${fixtureId}`,
              channel,
              effectiveAt: fixtureStartedAt,
              evidenceReference: `appointment-evidence-${fixtureId}`,
              expiresAt: new Date("2030-01-01T00:00:00.000Z"),
              jurisdictionCode: "NG",
              outcome: ServiceCommercePolicyOutcome.ALLOWED,
              reason: "Run-owned appointment acceptance policy",
              reviewedByUserId: actor.id,
              storeId: store.id,
              subject,
              tenantId: tenant.id,
              vertical,
            })),
          ),
        ),
    })
    const item = await createSimpleCatalogItem(db, {
      actorUserId: actor.id,
      authorizationPolicy: "on_order_confirmation",
      clientOperationId: `appointment-service-${fixtureId}`,
      kind: "service",
      name: "Appointment Consultation",
      priceMinor: 7_500,
      quantityScale: 0,
      storeId: store.id,
      tenantId: tenant.id,
      workPolicy: "charge_only",
    })
    const serviceOfferingId = item.variants[0]?.offerings[0]?.id
    if (!serviceOfferingId)
      throw new Error("Appointment Service Offering missing.")
    const connection = await db.whatsAppConnection.create({
      data: {
        billingOwner: "BUSINESS",
        businessDisplayName: "Appointment Acceptance Studio",
        businessVerified: true,
        createdByUserId: actor.id,
        credentialReference: `appointment-private-${fixtureId}`,
        displayNumber: "+2348111111111",
        numberVerified: true,
        outboundVerified: true,
        phoneNumberId: `appointment-phone-${fixtureId}`,
        status: "ACTIVE",
        templatesReady: true,
        tenantId: tenant.id,
        wabaId: `appointment-waba-${fixtureId}`,
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
    return {
      actorUserId: actor.id,
      approverMembershipId: approverMembership.id,
      approverUserId: approver.id,
      cleanupUserIds,
      connectionId: connection.id,
      db,
      fixtureStartedAt,
      serviceOfferingId,
      storeId: store.id,
      tenantId: tenant.id,
    }
  } catch (error) {
    const tenant = await db.tenant.findFirst({
      select: { id: true },
      where: { slug: `appointment-acceptance-${fixtureId}` },
    })
    if (tenant) {
      await disposeAppointmentAcceptanceFixture({
        actorUserId: actor.id,
        approverMembershipId: "not-created",
        approverUserId: cleanupUserIds[1] ?? actor.id,
        cleanupUserIds,
        connectionId: "not-created",
        db,
        fixtureStartedAt,
        serviceOfferingId: "not-created",
        storeId: "not-created",
        tenantId: tenant.id,
      })
    } else {
      await db.user.deleteMany({ where: { id: { in: cleanupUserIds } } })
    }
    throw error
  }
}

export async function disposeAppointmentAcceptanceFixture(
  fixture: AppointmentAcceptanceFixture,
) {
  await fixture.db.$transaction(async (tx) => {
    await tx.serviceCommerceCustomerNotificationReceipt.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceCustomerNotificationAttempt.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceCustomerActionExecution.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceCustomerActionCapability.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceCustomerNotificationIntent.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceBookingNotificationIntent.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceBookingEvent.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceBookingHold.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceBookingAccessCapability.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceBooking.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceBookingConfigurationEvent.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceBookingAvailabilityException.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceBookingAvailabilityRule.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceBookingOfferingResource.deleteMany({
      where: { offeringConfig: { tenantId: fixture.tenantId } },
    })
    await tx.serviceBookingOfferingConfig.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceBookingResource.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceBookingStoreSettings.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceJob.deleteMany({ where: { tenantId: fixture.tenantId } })
    await tx.serviceCommerceQuoteApprovalAuditEvent.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceQuoteApproval.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceQuoteReleaseCommandReceipt.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceQuoteReleasePolicyAuditEvent.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceQuoteReleasePolicy.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommercePolicyAuditEvent.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommercePolicyDecision.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceStoreTeamAuditEvent.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceStoreTeamAssignment.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceStoreAuditEvent.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceCommerceStoreProfile.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.customerEntryPointAuditEvent.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.customerEntryPoint.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.whatsAppInboundEvent.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.whatsAppStoreBinding.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.whatsAppConnection.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.catalogPricePromotion.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.commerceQuote.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.catalogAvailabilityAttestation.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.catalogVerifiedAlias.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.catalogSourceLineLink.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceRequest.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.serviceRequestForm.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.offeringSnapshot.deleteMany({
      where: { orderLine: { order: { tenantId: fixture.tenantId } } },
    })
    await tx.commercialOrder.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.catalogPriceChange.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.catalogCommandReceipt.deleteMany({
      where: { tenantId: fixture.tenantId },
    })
    await tx.catalogItem.deleteMany({ where: { tenantId: fixture.tenantId } })
    await tx.tenant.delete({ where: { id: fixture.tenantId } })
    await tx.user.deleteMany({
      where: { id: { in: fixture.cleanupUserIds }, memberships: { none: {} } },
    })
  })
}
