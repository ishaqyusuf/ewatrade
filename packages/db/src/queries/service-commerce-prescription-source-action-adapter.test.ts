import { describe, expect, test } from "bun:test"

import {
  PrescriptionPharmacistDecision,
  PrescriptionRequestStatus,
} from "../../generated/prisma/enums"
import { isPrescriptionReleasedForSharedCommerce } from "./service-commerce-prescription-source-action-adapter"

describe("Prescription Service Commerce source/action adapter", () => {
  const releasedReview = {
    decision: PrescriptionPharmacistDecision.RELEASED,
    mediaRevision: 2,
    transcriptRevision: 3,
  }

  test("allows shared commerce only for the current pharmacist release", () => {
    for (const status of [
      PrescriptionRequestStatus.READY_TO_QUOTE,
      PrescriptionRequestStatus.QUOTED,
      PrescriptionRequestStatus.CONVERTED,
    ]) {
      expect(
        isPrescriptionReleasedForSharedCommerce({
          currentMediaRevision: 2,
          currentTranscriptRevision: 3,
          pharmacistReviews: [releasedReview],
          status,
        }),
      ).toBe(true)
    }
  })

  test("fails closed for stale, missing, or non-released professional facts", () => {
    for (const request of [
      {
        currentMediaRevision: 2,
        currentTranscriptRevision: 3,
        pharmacistReviews: [],
        status: PrescriptionRequestStatus.QUOTED,
      },
      {
        currentMediaRevision: 4,
        currentTranscriptRevision: 3,
        pharmacistReviews: [releasedReview],
        status: PrescriptionRequestStatus.QUOTED,
      },
      {
        currentMediaRevision: 2,
        currentTranscriptRevision: null,
        pharmacistReviews: [releasedReview],
        status: PrescriptionRequestStatus.QUOTED,
      },
      {
        currentMediaRevision: 2,
        currentTranscriptRevision: 3,
        pharmacistReviews: [releasedReview],
        status: PrescriptionRequestStatus.PHARMACIST_REVIEW,
      },
    ]) {
      expect(isPrescriptionReleasedForSharedCommerce(request)).toBe(false)
    }
  })
})
