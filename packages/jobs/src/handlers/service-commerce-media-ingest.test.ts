import { describe, expect, test } from "bun:test"

import { runServiceCommerceMediaIngest } from "./service-commerce-media-ingest"

const payload = {
  mediaAssetId: "media_1",
  storeId: "store_1",
  tenantId: "tenant_1",
}

describe("Service Commerce media ingest", () => {
  test("retrieves, privately stores and schedules safety using identifier-only work", async () => {
    const calls: string[] = []
    const result = await runServiceCommerceMediaIngest(payload, {
      claim: async () => ({
        provider: "meta",
        providerConnectionId: "connection_1",
        providerMediaId: "provider_media_1",
      }),
      enqueueSafety: async (input) =>
        calls.push(`enqueue:${input.mediaAssetId}`),
      fetchMedia: async () => ({
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
        mediaType: "image/jpeg",
      }),
      loadConnection: async () => ({
        credentialReference: "credential_ref",
        phoneNumberId: "phone_1",
      }),
      loadSafety: async () => null,
      recordStored: async (input) => {
        calls.push(`stored:${input.mediaAssetId}:${input.verifiedMediaType}`)
        return { id: input.mediaAssetId }
      },
      requestSafety: async (input) =>
        calls.push(`safety:${input.mediaAssetId}`),
      reject: async () => {
        throw new Error("unexpected rejection")
      },
      resolveCredential: () => "secret",
      scheduleRetry: async () => {
        throw new Error("unexpected retry")
      },
      storage: {
        createViewerGrant: async () => {
          throw new Error("not used")
        },
        delete: async () => undefined,
        read: async () => {
          throw new Error("not used")
        },
        store: async () => ({ storageReference: "private:media_1" }),
      },
    })

    expect(result).toEqual({ id: "media_1" })
    expect(calls).toEqual([
      "stored:media_1:image/jpeg",
      "safety:media_1",
      "enqueue:media_1",
    ])
  })

  test("rejects a fetched file whose signature does not match its provider type", async () => {
    const rejected: string[] = []
    const result = await runServiceCommerceMediaIngest(payload, {
      claim: async () => ({
        provider: "meta",
        providerConnectionId: "connection_1",
        providerMediaId: "provider_media_1",
      }),
      enqueueSafety: async () => undefined,
      fetchMedia: async () => ({
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
        mediaType: "image/jpeg",
      }),
      loadConnection: async () => ({
        credentialReference: "credential_ref",
        phoneNumberId: "phone_1",
      }),
      loadSafety: async () => null,
      recordStored: async () => {
        throw new Error("unexpected store")
      },
      requestSafety: async () => undefined,
      reject: async (input) => {
        rejected.push(input.failureCode)
        return { lifecycle: "rejected" }
      },
      resolveCredential: () => "secret",
      scheduleRetry: async () => {
        throw new Error("unexpected retry")
      },
      storage: {
        createViewerGrant: async () => {
          throw new Error("not used")
        },
        delete: async () => undefined,
        read: async () => {
          throw new Error("not used")
        },
        store: async () => {
          throw new Error("unexpected store")
        },
      },
    })

    expect(result).toEqual({ lifecycle: "rejected" })
    expect(rejected).toEqual(["signature_mime_mismatch"])
  })

  test("records a bounded retry without leaking provider data into the payload", async () => {
    const retries: string[] = []
    await expect(
      runServiceCommerceMediaIngest(payload, {
        claim: async () => ({
          provider: "meta",
          providerConnectionId: "connection_1",
          providerMediaId: "provider_media_1",
        }),
        enqueueSafety: async () => undefined,
        fetchMedia: async () => {
          throw new Error("temporary provider failure")
        },
        loadConnection: async () => ({
          credentialReference: "credential_ref",
          phoneNumberId: "phone_1",
        }),
        loadSafety: async () => null,
        recordStored: async () => ({ id: "unexpected" }),
        requestSafety: async () => undefined,
        reject: async () => ({ lifecycle: "unexpected" }),
        resolveCredential: () => "secret",
        scheduleRetry: async (input) => {
          retries.push(input.failureCode)
        },
        storage: {
          createViewerGrant: async () => {
            throw new Error("not used")
          },
          delete: async () => undefined,
          read: async () => {
            throw new Error("not used")
          },
          store: async () => {
            throw new Error("not used")
          },
        },
      }),
    ).rejects.toThrow("temporary provider failure")

    expect(retries).toEqual(["provider_retrieval_failed"])
    expect(Object.keys(payload).sort()).toEqual([
      "mediaAssetId",
      "storeId",
      "tenantId",
    ])
  })
})
