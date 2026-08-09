import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  assertPrescriptionPickupQuoteAcceptance,
  assertPrescriptionReleaseLineAvailability,
  assertPrescriptionRequestTransition,
  createPrescriptionIntakeFingerprint,
  normalizePrescriptionMediaManifest,
  normalizePrescriptionTranscriptionRevision,
  prescriptionQueueWhere,
  recordPrescriptionMediaSafety,
  replacePrescriptionMedia,
  requiresVerifiedTranscript,
  submitPublicPrescriptionRequest,
  submitStaffPrescriptionRequest,
} from "./prescription-requests"

function createIntakeDb(input?: { active?: boolean; attendant?: boolean }) {
  let persisted: Record<string, unknown> | null = null
  const channelQueries: unknown[] = []
  const requestCreates: Array<Record<string, unknown>> = []
  const roleQueries: unknown[] = []
  const transaction = {
    prescriptionRequest: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        requestCreates.push(data)
        persisted = {
          ...data,
          createdAt: new Date("2026-08-09T10:00:00.000Z"),
          id: "request-1",
          reference: "RX-TEST",
        }
        return persisted
      },
      findUnique: async () => persisted,
    },
    prescriptionUsageEvent: { create: async () => ({ id: "usage-1" }) },
  }
  const db = {
    $transaction: async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    prescriptionChannel: {
      create: async () => {
        throw new Error("Existing channel should be reused in this test.")
      },
      findFirst: async (query: unknown) => {
        channelQueries.push(query)
        return { id: "channel-1", storeId: "store-1", tenantId: "tenant-1" }
      },
    },
    prescriptionStoreRole: {
      findFirst: async (query: unknown) => {
        roleQueries.push(query)
        return input?.attendant === false ? null : { id: "role-1" }
      },
    },
    prescriptionStoreSettings: {
      findFirst: async () =>
        input?.active === false ? null : { id: "settings-1" },
    },
  } as unknown as PrismaClient

  return { channelQueries, db, requestCreates, roleQueries }
}

const mediaPage = {
  clientMediaId: "page-1",
  mediaType: "image/jpeg",
  objectKey: "private/tenant-1/store-1/page-1.jpg",
  originalFileName: "prescription.jpg",
  pageNumber: 1,
  sha256: "a".repeat(64),
  sizeBytes: 1_024,
}

describe("Prescription Request lifecycle", () => {
  test("normalizes attendant additions, corrections, and deletions as a new revision", () => {
    expect(
      normalizePrescriptionTranscriptionRevision([
        " corrected first line ",
        "",
        "new second line",
      ]),
    ).toEqual(["corrected first line", "new second line"])
    expect(() => normalizePrescriptionTranscriptionRevision([])).toThrow(
      "between one and 100 lines",
    )
  })

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

  test("requires a positive mapped quantity and enough stock before release", () => {
    expect(() =>
      assertPrescriptionReleaseLineAvailability({
        availability: "available",
        offeringId: "offering-1",
      }),
    ).toThrow("Product Offering and quantity")
    expect(() =>
      assertPrescriptionReleaseLineAvailability({
        availability: "partial",
        offeringId: "offering-1",
        quantity: "0",
      }),
    ).toThrow("positive decimal quantity")
    expect(() =>
      assertPrescriptionReleaseLineAvailability({
        availability: "available",
        availableOfferingQuantity: "1",
        offeringId: "offering-1",
        quantity: "2",
      }),
    ).toThrow("enough available stock")
    expect(
      assertPrescriptionReleaseLineAvailability({
        availability: "partial",
        availableOfferingQuantity: "2",
        offeringId: "offering-1",
        quantity: "1.5",
      }),
    ).toBe("1.5")
    expect(
      assertPrescriptionReleaseLineAvailability({
        availability: "unavailable",
      }),
    ).toBeNull()
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

  test("creates one Store-attributed public intake and safely replays the same command", async () => {
    const { channelQueries, db, requestCreates } = createIntakeDb()
    const command = {
      clientRequestId: "web-intake-1",
      consentAcceptedAt: new Date("2026-08-09T10:00:00.000Z"),
      consentVersion: "v1",
      customerName: "Test Customer",
      customerPhone: "+2348000000000",
      fulfilmentPreference: "pickup" as const,
      media: [mediaPage],
      publicToken: "public-channel-token",
    }

    await expect(
      submitPublicPrescriptionRequest(db, command),
    ).resolves.toMatchObject({
      created: true,
      reference: "RX-TEST",
      requestId: "request-1",
    })
    await expect(
      submitPublicPrescriptionRequest(db, command),
    ).resolves.toMatchObject({
      created: false,
      reference: "RX-TEST",
      requestId: "request-1",
      statusToken: null,
    })
    expect(requestCreates).toHaveLength(1)
    expect(requestCreates[0]).toMatchObject({
      channelId: "channel-1",
      source: "WEB",
      statusTokenDigest: expect.any(String),
      storeId: "store-1",
      tenantId: "tenant-1",
    })
    expect(channelQueries[0]).toEqual({
      where: {
        publicToken: "public-channel-token",
        status: "ACTIVE",
        webEnabled: true,
      },
    })
    await expect(
      submitPublicPrescriptionRequest(db, {
        ...command,
        customerPhone: "+2348111111111",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  })

  test("fails public intake closed when Prescription Commerce is inactive", async () => {
    const { db, requestCreates } = createIntakeDb({ active: false })

    await expect(
      submitPublicPrescriptionRequest(db, {
        clientRequestId: "web-intake-disabled",
        consentAcceptedAt: new Date("2026-08-09T10:00:00.000Z"),
        consentVersion: "v1",
        customerPhone: "+2348000000000",
        fulfilmentPreference: "pickup",
        media: [mediaPage],
        publicToken: "disabled-channel-token",
      }),
    ).rejects.toMatchObject({ code: "PRESCRIPTION_NOT_ACTIVE" })
    expect(requestCreates).toHaveLength(0)
  })

  test("attributes staff-assisted intake to the authorized attendant and shared aggregate", async () => {
    const { db, requestCreates, roleQueries } = createIntakeDb()

    await expect(
      submitStaffPrescriptionRequest(db, {
        actorUserId: "attendant-1",
        clientRequestId: "staff-intake-1",
        consentAcceptedAt: new Date("2026-08-09T10:00:00.000Z"),
        consentVersion: "v1",
        customerName: "Walk-in Customer",
        fulfilmentPreference: "unspecified",
        manualIntakeText: "One handwritten medicine line",
        media: [],
        source: "staff_walk_in",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toMatchObject({ created: true, requestId: "request-1" })
    expect(roleQueries[0]).toEqual({
      where: {
        role: "ATTENDANT",
        status: "ACTIVE",
        storeId: "store-1",
        tenantId: "tenant-1",
        userId: "attendant-1",
      },
    })
    expect(requestCreates[0]).toMatchObject({
      auditEvents: {
        create: {
          actorUserId: "attendant-1",
          payload: { source: "staff_walk_in" },
          storeId: "store-1",
          tenantId: "tenant-1",
          type: "RECEIVED",
        },
      },
      source: "STAFF_WALK_IN",
      staffAssistedByUserId: "attendant-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    })
  })

  test("rejects staff-assisted intake without the exact Store role", async () => {
    const { db, requestCreates } = createIntakeDb({ attendant: false })

    await expect(
      submitStaffPrescriptionRequest(db, {
        actorUserId: "ordinary-staff-1",
        clientRequestId: "staff-intake-denied",
        consentAcceptedAt: new Date("2026-08-09T10:00:00.000Z"),
        consentVersion: "v1",
        fulfilmentPreference: "pickup",
        manualIntakeText: "Medicine line",
        media: [],
        source: "staff_phone",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "PRESCRIPTION_ROLE_REQUIRED" })
    expect(requestCreates).toHaveLength(0)
  })

  test("records one tenant-scoped media-safety callback and ignores its replay", async () => {
    const accessEvents: unknown[] = []
    const mediaQueries: unknown[] = []
    const mediaUpdates: unknown[] = []
    const media = {
      id: "media-1",
      request: { id: "request-1" },
      status: "PENDING",
    }
    const transaction = {
      prescriptionMedia: {
        findFirst: async (query: unknown) => {
          mediaQueries.push(query)
          return media
        },
        update: async (input: { data: { status: string } }) => {
          mediaUpdates.push(input)
          media.status = input.data.status
          return { ...media }
        },
      },
      prescriptionMediaAccessEvent: {
        create: async (input: unknown) => {
          accessEvents.push(input)
          return input
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient
    const command = {
      mediaId: "media-1",
      outcome: "safe" as const,
      providerEventId: "safety-event-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    }

    await expect(
      recordPrescriptionMediaSafety(db, command),
    ).resolves.toMatchObject({
      status: "SAFE",
    })
    await expect(
      recordPrescriptionMediaSafety(db, command),
    ).resolves.toMatchObject({
      status: "SAFE",
    })
    expect(mediaQueries[0]).toMatchObject({
      where: { id: "media-1", storeId: "store-1", tenantId: "tenant-1" },
    })
    expect(mediaUpdates).toHaveLength(1)
    expect(accessEvents).toHaveLength(1)
  })

  test("replaces media through an expiring capability and invalidates stale transcripts", async () => {
    const createdMedia: unknown[] = []
    const requestQueries: Array<{
      where: Record<string, unknown>
    }> = []
    const requestUpdates: unknown[] = []
    const transcriptionUpdates: unknown[] = []
    const transaction = {
      prescriptionMedia: {
        createMany: async (input: unknown) => {
          createdMedia.push(input)
          return { count: 1 }
        },
      },
      prescriptionRequest: {
        findFirst: async (query: { where: Record<string, unknown> }) => {
          requestQueries.push(query)
          return {
            currentMediaRevision: 1,
            id: "request-1",
            reference: "RX-TEST",
            status: "NEEDS_CLEARER_MEDIA",
            storeId: "store-1",
            tenantId: "tenant-1",
          }
        },
        update: async (input: unknown) => {
          requestUpdates.push(input)
          return input
        },
        updateMany: async () => ({ count: 1 }),
      },
      prescriptionRequestAuditEvent: {
        create: async () => ({ id: "audit-1" }),
      },
      prescriptionTranscription: {
        updateMany: async (input: unknown) => {
          transcriptionUpdates.push(input)
          return { count: 1 }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      replacePrescriptionMedia(db, {
        media: [{ ...mediaPage, clientMediaId: "replacement-page-1" }],
        reuploadToken: "secret-reupload-token",
      }),
    ).resolves.toEqual({
      currentMediaRevision: 2,
      reference: "RX-TEST",
      requestId: "request-1",
    })
    expect(requestQueries[0]?.where).toMatchObject({
      reuploadTokenDigest: expect.any(String),
      reuploadTokenExpiresAt: { gt: expect.any(Date) },
      status: "NEEDS_CLEARER_MEDIA",
    })
    expect(JSON.stringify(requestQueries[0])).not.toContain(
      "secret-reupload-token",
    )
    expect(createdMedia[0]).toMatchObject({
      data: [
        expect.objectContaining({
          revision: 2,
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
      ],
    })
    expect(transcriptionUpdates[0]).toMatchObject({
      data: { status: "SUPERSEDED", supersededAt: expect.any(Date) },
      where: { requestId: "request-1" },
    })
    expect(requestUpdates[0]).toMatchObject({
      data: {
        currentMediaRevision: 2,
        currentTranscriptRevision: null,
        reuploadTokenDigest: null,
        reuploadTokenExpiresAt: null,
      },
      where: { id: "request-1" },
    })
  })

  test("fails an expired or unknown re-upload capability closed", async () => {
    const transaction = {
      prescriptionRequest: { findFirst: async () => null },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      replacePrescriptionMedia(db, {
        media: [mediaPage],
        reuploadToken: "expired-token",
      }),
    ).rejects.toMatchObject({ code: "PUBLIC_ACCESS_INVALID" })
  })
})
