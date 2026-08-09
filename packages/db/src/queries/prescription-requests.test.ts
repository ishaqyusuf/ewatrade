import { describe, expect, test } from "bun:test"

import {
  assertPrescriptionPickupQuoteAcceptance,
  assertPrescriptionRequestTransition,
  createPrescriptionIntakeFingerprint,
  normalizePrescriptionMediaManifest,
  prescriptionQueueWhere,
  requiresVerifiedTranscript,
} from "./prescription-requests"

describe("Prescription Request lifecycle", () => {
  test("moves reviewed media through transcription and both human gates", () => {
    expect(() =>
      assertPrescriptionRequestTransition("received", "media_review"),
    ).not.toThrow()
    expect(() =>
      assertPrescriptionRequestTransition("media_review", "transcribing"),
    ).not.toThrow()
    expect(() =>
      assertPrescriptionRequestTransition(
        "attendant_verification",
        "pharmacist_review",
      ),
    ).not.toThrow()
    expect(() =>
      assertPrescriptionRequestTransition(
        "pharmacist_review",
        "ready_to_quote",
      ),
    ).not.toThrow()
  })

  test("prevents bypassing media, attendant, or pharmacist review", () => {
    expect(() =>
      assertPrescriptionRequestTransition("received", "ready_to_quote"),
    ).toThrow("Invalid Prescription Request transition")
    expect(() =>
      assertPrescriptionRequestTransition("transcribing", "pharmacist_review"),
    ).toThrow("Invalid Prescription Request transition")
    expect(() =>
      assertPrescriptionRequestTransition("pharmacist_review", "converted"),
    ).toThrow("Invalid Prescription Request transition")
  })

  test("requires every current transcription line to be resolved", () => {
    expect(
      requiresVerifiedTranscript([
        { status: "verified" },
        { status: "unreadable" },
      ]),
    ).toBe(true)
    expect(
      requiresVerifiedTranscript([
        { status: "verified" },
        { status: "pending" },
      ]),
    ).toBe(false)
    expect(requiresVerifiedTranscript([])).toBe(false)
  })

  test("creates a stable intake fingerprint without storing media or contact content", () => {
    const first = createPrescriptionIntakeFingerprint({
      clientRequestId: " request-1 ",
      contact: "+2348000000000",
      media: [
        { clientMediaId: "b", pageNumber: 2, sha256: "sha-b" },
        { clientMediaId: "a", pageNumber: 1, sha256: "sha-a" },
      ],
      source: "web",
      storeId: "store-1",
    })
    const repeated = createPrescriptionIntakeFingerprint({
      clientRequestId: "request-1",
      contact: "+2348000000000",
      media: [
        { clientMediaId: "a", pageNumber: 1, sha256: "sha-a" },
        { clientMediaId: "b", pageNumber: 2, sha256: "sha-b" },
      ],
      source: "web",
      storeId: "store-1",
    })

    expect(first).toBe(repeated)
    expect(first).not.toContain("+2348000000000")
    expect(first).not.toContain("sha-a")
  })

  test("normalizes one contiguous, bounded media page set", () => {
    expect(
      normalizePrescriptionMediaManifest([
        {
          clientMediaId: "page-b",
          mediaType: "image/png",
          objectKey: "private/b",
          originalFileName: "b.png",
          pageNumber: 2,
          sha256: "b",
          sizeBytes: 10,
        },
        {
          clientMediaId: "page-a",
          mediaType: "image/jpeg",
          objectKey: "private/a",
          originalFileName: "a.jpg",
          pageNumber: 1,
          sha256: "a",
          sizeBytes: 10,
        },
      ]).map((page) => page.pageNumber),
    ).toEqual([1, 2])
    expect(() =>
      normalizePrescriptionMediaManifest([
        {
          clientMediaId: "page-b",
          mediaType: "image/png",
          objectKey: "private/b",
          originalFileName: "b.png",
          pageNumber: 2,
          sha256: "b",
          sizeBytes: 10,
        },
      ]),
    ).toThrow("Media pages must be contiguous")
  })

  test("requires explicit acknowledgement for a partial pickup Quote", () => {
    expect(() =>
      assertPrescriptionPickupQuoteAcceptance({
        availabilityOutcome: "partial",
        fulfilmentType: "pickup",
        partialAcknowledged: false,
      }),
    ).toThrow("Partial availability must be acknowledged")
    expect(() =>
      assertPrescriptionPickupQuoteAcceptance({
        availabilityOutcome: "partial",
        fulfilmentType: "pickup",
        partialAcknowledged: true,
      }),
    ).not.toThrow()
    expect(() =>
      assertPrescriptionPickupQuoteAcceptance({
        availabilityOutcome: "full",
        fulfilmentType: "delivery",
        partialAcknowledged: true,
      }),
    ).toThrow("not a prescription pickup Quote")
  })

  test("builds tenant-scoped assignee and date-range queue predicates", () => {
    expect(
      prescriptionQueueWhere({
        assignees: ["user-1"],
        from: "2026-08-01",
        storeId: "store-1",
        tenantId: "tenant-1",
        to: "2026-08-10",
      }),
    ).toMatchObject({
      createdAt: {
        gte: new Date("2026-08-01T00:00:00.000Z"),
        lt: new Date("2026-08-10T00:00:00.000Z"),
      },
      OR: [
        { staffAssistedByUserId: { in: ["user-1"] } },
        {
          pharmacistReviews: {
            some: { pharmacistUserId: { in: ["user-1"] } },
          },
        },
      ],
      storeId: "store-1",
      tenantId: "tenant-1",
    })
  })
})
