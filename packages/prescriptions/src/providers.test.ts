import { describe, expect, test } from "bun:test"

import {
  InMemoryPrivateMediaProvider,
  type PrivateMediaProvider,
  createDeterministicMediaSafetyProvider,
  createDeterministicOcrProvider,
  storePrescriptionMedia,
  validatePrescriptionMedia,
} from "./providers"

describe("Prescription provider contracts", () => {
  test("rejects unsupported or oversized media before a private object is created", () => {
    expect(() =>
      validatePrescriptionMedia({
        mediaType: "text/html",
        pageNumber: 1,
        sizeBytes: 10,
      }),
    ).toThrow("Unsupported prescription media type")
    expect(() =>
      validatePrescriptionMedia({
        mediaType: "image/jpeg",
        pageNumber: 1,
        sizeBytes: 10_000_001,
      }),
    ).toThrow("Prescription media exceeds the 10 MB page limit")
  })

  test("stores private bytes and issues short-lived authorized delivery only", async () => {
    const provider = new InMemoryPrivateMediaProvider({ now: () => 1_000 })
    const object = await provider.put({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "image/jpeg",
      objectKey: "tenant/store/request/revision-1/page-1",
    })

    expect(object.visibility).toBe("private")
    await expect(
      provider.createAuthorizedDelivery({
        expiresInSeconds: 61,
        objectKey: object.objectKey,
      }),
    ).rejects.toThrow("Authorized media delivery cannot exceed 60 seconds")

    const delivery = await provider.createAuthorizedDelivery({
      expiresInSeconds: 30,
      objectKey: object.objectKey,
    })
    expect(delivery.expiresAt).toEqual(new Date(31_000))
    expect(delivery.url).not.toContain(object.objectKey)
  })

  test("propagates private storage failure without returning a media manifest", async () => {
    const unavailableStorage = {
      createAuthorizedDelivery: async () => {
        throw new Error("storage unavailable")
      },
      delete: async () => undefined,
      get: async () => {
        throw new Error("storage unavailable")
      },
      put: async () => {
        throw new Error("storage unavailable")
      },
    } satisfies PrivateMediaProvider

    await expect(
      storePrescriptionMedia(
        {
          bytes: new Uint8Array([1, 2, 3]),
          clientMediaId: "media-1",
          mediaType: "image/jpeg",
          originalFileName: "prescription.jpg",
          pageNumber: 1,
          scopeId: "tenant-1/store-1/request-1",
        },
        unavailableStorage,
      ),
    ).rejects.toThrow("storage unavailable")
  })

  test("provides deterministic OCR success, partial, timeout, and unavailable outcomes", async () => {
    const provider = createDeterministicOcrProvider()

    const completed = await provider.transcribe({
      mediaRevision: 1,
      mode: "success",
      objectKeys: ["page-1", "page-2"],
      requestId: "request-1",
    })
    expect(completed).toMatchObject({ outcome: "completed" })
    expect(completed.outcome === "failed" ? [] : completed.lines).toHaveLength(
      2,
    )
    expect(
      completed.outcome === "failed" ? null : completed.lines[0],
    ).toMatchObject({
      draftText: "Transcribed line 1",
      lineNumber: 1,
    })
    expect(
      await provider.transcribe({
        mediaRevision: 1,
        mode: "partial",
        objectKeys: ["page-1"],
        requestId: "request-1",
      }),
    ).toMatchObject({ outcome: "partial" })
    expect(
      await provider.transcribe({
        mediaRevision: 1,
        mode: "timeout",
        objectKeys: ["page-1"],
        requestId: "request-1",
      }),
    ).toEqual({ failureCode: "provider_timeout", outcome: "failed" })
    expect(
      await provider.transcribe({
        mediaRevision: 1,
        mode: "unavailable",
        objectKeys: ["page-1"],
        requestId: "request-1",
      }),
    ).toEqual({ failureCode: "provider_unavailable", outcome: "failed" })
  })

  test("provides deterministic private-media safety outcomes", async () => {
    const provider = createDeterministicMediaSafetyProvider()
    await expect(
      provider.scan({ mediaId: "media-1", objectKey: "private/safe-page" }),
    ).resolves.toMatchObject({
      outcome: "safe",
      providerEventId: "scan:media-1",
    })
    await expect(
      provider.scan({
        mediaId: "media-2",
        objectKey: "private/quarantine-page",
      }),
    ).resolves.toMatchObject({ outcome: "quarantined" })
  })
})
