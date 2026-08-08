import { describe, expect, test } from "bun:test"

import { runPrescriptionPrivacyRequest } from "./prescription-privacy-request"

describe("prescription privacy request job", () => {
  test("keeps the durable payload identifier-only and deletes media before erasure completion", async () => {
    const deleted: string[] = []
    const completed: Array<Record<string, unknown>> = []
    await runPrescriptionPrivacyRequest(
      { actorUserId: "user-1", privacyRequestId: "privacy-1" },
      {
        claim: async () => ({
          media: [
            { id: "media-1", objectKey: "private/media-1" },
            { id: "media-2", objectKey: "private/media-2" },
          ],
          prescriptionRequestIds: ["request-1"],
          privacyRequestId: "privacy-1",
          requestedChanges: null,
          storeId: "store-1",
          subjectReference: "RX-SAFE",
          tenantId: "tenant-1",
          type: "ERASURE",
        }),
        complete: async (input) => {
          completed.push(input)
        },
        media: {
          createAuthorizedDelivery: async () => ({
            expiresAt: new Date(),
            url: "https://private.example/unused",
          }),
          delete: async (objectKey) => {
            deleted.push(objectKey)
          },
          get: async () => new Uint8Array(),
          put: async () => ({
            mediaType: "image/png",
            objectKey: "unused",
            sizeBytes: 1,
            visibility: "private",
          }),
        },
      },
    )

    expect(deleted).toEqual(["private/media-1", "private/media-2"])
    expect(completed).toHaveLength(1)
    expect(completed[0]?.deletedMediaIds).toEqual(["media-1", "media-2"])
    expect(completed[0]).not.toHaveProperty("prescriptionContent")
  })
})
