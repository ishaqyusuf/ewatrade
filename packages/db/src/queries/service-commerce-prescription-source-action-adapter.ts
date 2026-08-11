import {
  PrescriptionPharmacistDecision,
  PrescriptionRequestStatus,
} from "../../generated/prisma/enums"

import type { DbClient } from "./types"

type PrescriptionSourceActionRecord = {
  contactOptIn: boolean
  currentMediaRevision: number
  currentTranscriptRevision: number | null
  customerEmail: string | null
  customerPhone: string | null
  pharmacistReviews: Array<{
    decision: PrescriptionPharmacistDecision
    mediaRevision: number
    transcriptRevision: number
  }>
  status: PrescriptionRequestStatus
  updatedAt: Date
}

export type PrescriptionServiceCommerceSourceActionFacts = {
  contactOptIn: boolean
  customerEmail: string | null
  customerPhone: string | null
  releasedForSharedCommerce: boolean
  status: PrescriptionRequestStatus
  updatedAt: Date
}

/** Exposes only the current clinical-release fact needed by shared actions. */
export function isPrescriptionReleasedForSharedCommerce(
  request: Pick<
    PrescriptionSourceActionRecord,
    | "currentMediaRevision"
    | "currentTranscriptRevision"
    | "pharmacistReviews"
    | "status"
  >,
) {
  if (
    request.status !== PrescriptionRequestStatus.READY_TO_QUOTE &&
    request.status !== PrescriptionRequestStatus.QUOTED &&
    request.status !== PrescriptionRequestStatus.CONVERTED
  ) {
    return false
  }
  if (request.currentTranscriptRevision === null) return false

  return request.pharmacistReviews.some(
    (review) =>
      review.decision === PrescriptionPharmacistDecision.RELEASED &&
      review.mediaRevision === request.currentMediaRevision &&
      review.transcriptRevision === request.currentTranscriptRevision,
  )
}

export async function loadPrescriptionServiceCommerceSourceActionFacts(
  db: DbClient,
  input: { id: string; storeId: string; tenantId: string },
): Promise<PrescriptionServiceCommerceSourceActionFacts | null> {
  const request = await db.prescriptionRequest.findFirst({
    select: {
      contactOptIn: true,
      currentMediaRevision: true,
      currentTranscriptRevision: true,
      customerEmail: true,
      customerPhone: true,
      pharmacistReviews: {
        orderBy: { createdAt: "desc" },
        select: {
          decision: true,
          mediaRevision: true,
          transcriptRevision: true,
        },
        take: 1,
      },
      status: true,
      updatedAt: true,
    },
    where: {
      id: input.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!request) return null

  return {
    contactOptIn: request.contactOptIn,
    customerEmail: request.customerEmail,
    customerPhone: request.customerPhone,
    releasedForSharedCommerce: isPrescriptionReleasedForSharedCommerce(request),
    status: request.status,
    updatedAt: request.updatedAt,
  }
}
