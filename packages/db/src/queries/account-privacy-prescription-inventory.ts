import type { PrismaClient } from "../../generated/prisma/client"

type PrescriptionInventoryClient = Pick<
  PrismaClient,
  | "prescriptionRequest"
  | "prescriptionStoreRole"
  | "prescriptionStoreAuditEvent"
  | "prescriptionPharmacistReview"
  | "prescriptionRequestAuditEvent"
  | "prescriptionPrivacyRequest"
  | "prescriptionStoreSettings"
  | "prescriptionChannel"
  | "prescriptionMedia"
  | "prescriptionMediaAccessEvent"
  | "prescriptionTranscription"
  | "prescriptionTranscriptionLine"
  | "prescriptionLineMapping"
  | "prescriptionPaymentRefund"
  | "prescriptionPickupFulfillment"
  | "prescriptionPickupEvent"
  | "prescriptionDeliveryZone"
  | "prescriptionDeliveryAddress"
  | "prescriptionDeliveryAssignment"
  | "prescriptionDeliveryEvent"
  | "prescriptionRetentionPolicy"
  | "prescriptionIncidentControl"
  | "prescriptionSensitiveAccessEvent"
>

/** Counts possible subject records without selecting clinical content. */
export async function getAccountPrivacyPrescriptionInventory(
  db: PrescriptionInventoryClient,
  verifiedSubjectUserId: string,
  verifiedEmail?: string | null,
) {
  // Sequential queries also work inside the final serializable transaction.
  const pharmacyRoles = await db.prescriptionStoreRole.count({
    where: {
      OR: [
        { userId: verifiedSubjectUserId },
        { credentialVerifiedByUserId: verifiedSubjectUserId },
        { assignedByUserId: verifiedSubjectUserId },
        { revokedByUserId: verifiedSubjectUserId },
      ],
    },
  })
  const pharmacyRoleAuditEvents = await db.prescriptionStoreAuditEvent.count({
    where: {
      OR: [
        { actorUserId: verifiedSubjectUserId },
        { subjectUserId: verifiedSubjectUserId },
      ],
    },
  })
  const staffAssistedRequests = await db.prescriptionRequest.count({
    where: { staffAssistedByUserId: verifiedSubjectUserId },
  })
  const pharmacistReviews = await db.prescriptionPharmacistReview.count({
    where: { pharmacistUserId: verifiedSubjectUserId },
  })
  const requestAuditEvents = await db.prescriptionRequestAuditEvent.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  const privacyRequests = await db.prescriptionPrivacyRequest.count({
    where: {
      OR: [
        { requestedByUserId: verifiedSubjectUserId },
        { identityVerifiedByUserId: verifiedSubjectUserId },
        { completedByUserId: verifiedSubjectUserId },
      ],
    },
  })
  const storeSettings = await db.prescriptionStoreSettings.count({
    where: {
      OR: [
        { activatedByUserId: verifiedSubjectUserId },
        { deactivatedByUserId: verifiedSubjectUserId },
      ],
    },
  })
  const channels = await db.prescriptionChannel.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const reviewedMedia = await db.prescriptionMedia.count({
    where: { reviewedByUserId: verifiedSubjectUserId },
  })
  const mediaAccessEvents = await db.prescriptionMediaAccessEvent.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  const transcriptions = await db.prescriptionTranscription.count({
    where: { requestedByUserId: verifiedSubjectUserId },
  })
  const verifiedLines = await db.prescriptionTranscriptionLine.count({
    where: { verifiedByUserId: verifiedSubjectUserId },
  })
  const lineMappings = await db.prescriptionLineMapping.count({
    where: { mappedByUserId: verifiedSubjectUserId },
  })
  const paymentRefunds = await db.prescriptionPaymentRefund.count({
    where: { requestedByUserId: verifiedSubjectUserId },
  })
  const pickupFulfillments = await db.prescriptionPickupFulfillment.count({
    where: {
      OR: [
        { packedByUserId: verifiedSubjectUserId },
        { handedOffByUserId: verifiedSubjectUserId },
      ],
    },
  })
  const pickupEvents = await db.prescriptionPickupEvent.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  const deliveryZones = await db.prescriptionDeliveryZone.count({
    where: {
      OR: [
        { createdByUserId: verifiedSubjectUserId },
        { updatedByUserId: verifiedSubjectUserId },
      ],
    },
  })
  const deliveryAddresses = await db.prescriptionDeliveryAddress.count({
    where: {
      OR: [
        { evaluatedByUserId: verifiedSubjectUserId },
        { packedByUserId: verifiedSubjectUserId },
      ],
    },
  })
  const deliveryAssignments = await db.prescriptionDeliveryAssignment.count({
    where: { assignedByUserId: verifiedSubjectUserId },
  })
  const deliveryEvents = await db.prescriptionDeliveryEvent.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  const retentionPolicies = await db.prescriptionRetentionPolicy.count({
    where: { updatedByUserId: verifiedSubjectUserId },
  })
  const incidentControls = await db.prescriptionIncidentControl.count({
    where: {
      OR: [
        { activatedByUserId: verifiedSubjectUserId },
        { resolvedByUserId: verifiedSubjectUserId },
      ],
    },
  })
  const sensitiveAccessEvents = await db.prescriptionSensitiveAccessEvent.count(
    {
      where: { actorUserId: verifiedSubjectUserId },
    },
  )
  const email = verifiedEmail?.trim().toLowerCase()
  const customerEmailMatches = email
    ? await db.prescriptionRequest.count({
        where: { customerEmail: { equals: email, mode: "insensitive" } },
      })
    : 0

  return {
    pharmacyRoles,
    pharmacyRoleAuditEvents,
    staffAssistedRequests,
    pharmacistReviews,
    requestAuditEvents,
    privacyRequests,
    storeSettings,
    channels,
    reviewedMedia,
    mediaAccessEvents,
    transcriptions,
    verifiedLines,
    lineMappings,
    paymentRefunds,
    pickupFulfillments,
    pickupEvents,
    deliveryZones,
    deliveryAddresses,
    deliveryAssignments,
    deliveryEvents,
    retentionPolicies,
    incidentControls,
    sensitiveAccessEvents,
    customerEmailMatches,
  }
}
