import type { PrismaClient } from "../../generated/prisma/client"

type CommercialInventoryClient = Pick<
  PrismaClient,
  | "commercialOrder"
  | "commercialOrderPayment"
  | "commercialOrderFulfillmentCommand"
  | "productReturn"
  | "serviceJob"
  | "serviceIntake"
  | "serviceQuote"
  | "serviceQuoteVersion"
  | "commerceQuote"
  | "commerceQuoteVersion"
  | "serviceWorkEvent"
  | "serviceWorkAssignment"
  | "serviceDueCommitment"
  | "serviceInternalNote"
  | "serviceException"
  | "serviceEvidence"
  | "serviceEvidenceAuditEvent"
  | "serviceRequestForm"
  | "customerTrackingAccess"
  | "serviceNotificationIntent"
  | "serviceManualShare"
  | "commerceInquiryAuditEvent"
  | "customer"
  | "serviceRequest"
  | "commerceInquiry"
>

/** Counts subject-attributed facts and verified-email matches; never reads content. */
export async function getAccountPrivacyCommercialInventory(
  db: CommercialInventoryClient,
  verifiedSubjectUserId: string,
  verifiedEmail?: string | null,
) {
  // Sequential reads also work inside the final serializable transaction.
  const createdOrders = await db.commercialOrder.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const recordedPayments = await db.commercialOrderPayment.count({
    where: { recordedByUserId: verifiedSubjectUserId },
  })
  const fulfillmentCommands = await db.commercialOrderFulfillmentCommand.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  const returns = await db.productReturn.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  const createdOrHandedOffServiceJobs = await db.serviceJob.count({
    where: {
      OR: [
        { createdByUserId: verifiedSubjectUserId },
        { handedOffByUserId: verifiedSubjectUserId },
        { currentAssigneeUserId: verifiedSubjectUserId },
      ],
    },
  })
  const createdServiceIntakes = await db.serviceIntake.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const createdServiceRequests = await db.serviceRequest.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const createdLegacyServiceQuotes = await db.serviceQuote.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const createdLegacyServiceQuoteVersions = await db.serviceQuoteVersion.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const createdCommerceQuotes = await db.commerceQuote.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const createdCommerceQuoteVersions = await db.commerceQuoteVersion.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const serviceWorkEvents = await db.serviceWorkEvent.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  const serviceWorkAssignments = await db.serviceWorkAssignment.count({
    where: {
      OR: [
        { assignedUserId: verifiedSubjectUserId },
        { previousUserId: verifiedSubjectUserId },
        { assignedByUserId: verifiedSubjectUserId },
      ],
    },
  })
  const serviceDueCommitments = await db.serviceDueCommitment.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const serviceInternalNotes = await db.serviceInternalNote.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  const serviceExceptions = await db.serviceException.count({
    where: {
      OR: [
        { actorUserId: verifiedSubjectUserId },
        { resolvedByUserId: verifiedSubjectUserId },
      ],
    },
  })
  const serviceEvidence = await db.serviceEvidence.count({
    where: { uploaderUserId: verifiedSubjectUserId },
  })
  const serviceEvidenceAuditEvents = await db.serviceEvidenceAuditEvent.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  const serviceRequestForms = await db.serviceRequestForm.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const customerTrackingAccesses = await db.customerTrackingAccess.count({
    where: {
      OR: [
        { createdByUserId: verifiedSubjectUserId },
        { revokedByUserId: verifiedSubjectUserId },
      ],
    },
  })
  const serviceNotificationIntents = await db.serviceNotificationIntent.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const serviceManualShares = await db.serviceManualShare.count({
    where: { sharedByUserId: verifiedSubjectUserId },
  })
  const createdCommerceInquiries = await db.commerceInquiry.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const commerceInquiryAuditEvents = await db.commerceInquiryAuditEvent.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  // Email matches are review candidates, not proof that every Tenant customer
  // row belongs to this account. A no-data outcome cannot ignore them.
  const email = verifiedEmail?.trim().toLowerCase()
  const customerDirectoryMatches = email
    ? await db.customer.count({
        where: {
          OR: [
            { normalizedEmail: email },
            { email: { equals: email, mode: "insensitive" } },
          ],
        },
      })
    : 0
  const customerOrderMatches = email
    ? await db.commercialOrder.count({
        where: { customerEmail: { equals: email, mode: "insensitive" } },
      })
    : 0
  const serviceRequestMatches = email
    ? await db.serviceRequest.count({
        where: { customerEmail: { equals: email, mode: "insensitive" } },
      })
    : 0
  const commerceInquiryMatches = email
    ? await db.commerceInquiry.count({
        where: { customerEmail: { equals: email, mode: "insensitive" } },
      })
    : 0
  return {
    createdOrders,
    recordedPayments,
    fulfillmentCommands,
    returns,
    createdOrHandedOffServiceJobs,
    createdServiceIntakes,
    createdServiceRequests,
    createdLegacyServiceQuotes,
    createdLegacyServiceQuoteVersions,
    createdCommerceQuotes,
    createdCommerceQuoteVersions,
    serviceWorkEvents,
    serviceWorkAssignments,
    serviceDueCommitments,
    serviceInternalNotes,
    serviceExceptions,
    serviceEvidence,
    serviceEvidenceAuditEvents,
    serviceRequestForms,
    customerTrackingAccesses,
    serviceNotificationIntents,
    serviceManualShares,
    createdCommerceInquiries,
    commerceInquiryAuditEvents,
    customerDirectoryMatches,
    customerOrderMatches,
    serviceRequestMatches,
    commerceInquiryMatches,
  }
}
