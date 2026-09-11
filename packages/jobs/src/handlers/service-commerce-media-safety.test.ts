import { describe, expect, test } from "bun:test"

import { runServiceCommerceMediaSafety } from "./service-commerce-media-safety"

const payload = {
  mediaAssetId: "media_1",
  storeId: "store_1",
  tenantId: "tenant_1",
}

describe("Service Commerce media safety", () => {
  test("records the provider outcome from private server-owned metadata", async () => {
    const outcomes: string[] = []
    const result = await runServiceCommerceMediaSafety(payload, {
      assertProviderAllowed: async () => undefined,
      inspect: async () => ({ lifecycle: "safe" }),
      load: async () => ({
        contentDigest: "a".repeat(64),
        mediaAssetId: "media_1",
        mimeType: "image/jpeg",
        storageReference: "private:media_1",
        verifiedSizeBytes: 4,
      }),
      record: async (input) => {
        outcomes.push(input.outcome)
        return { lifecycle: input.outcome }
      },
    })

    expect(result).toEqual({ lifecycle: "safe" })
    expect(outcomes).toEqual(["safe"])
  })

  test("fails closed when the private object is not ready for inspection", async () => {
    await expect(
      runServiceCommerceMediaSafety(payload, {
        assertProviderAllowed: async () => undefined,
        inspect: async () => ({ lifecycle: "safe" }),
        load: async () => null,
        record: async () => ({ lifecycle: "unexpected" }),
      }),
    ).rejects.toThrow("not ready")
  })

  test("records retryable when the scanner is temporarily unavailable", async () => {
    const outcomes: string[] = []
    await expect(
      runServiceCommerceMediaSafety(payload, {
        assertProviderAllowed: async () => undefined,
        inspect: async () => {
          throw new Error("scanner unavailable")
        },
        load: async () => ({
          contentDigest: "b".repeat(64),
          mediaAssetId: "media_1",
          mimeType: "application/pdf",
          storageReference: "private:media_1",
          verifiedSizeBytes: 5,
        }),
        record: async (input) => {
          outcomes.push(input.outcome)
          return { lifecycle: input.outcome }
        },
      }),
    ).rejects.toThrow("scanner unavailable")
    expect(outcomes).toEqual(["retryable"])
  })

  test("keeps a quarantined document private and terminal to normal staff recovery", async () => {
    const outcomes: string[] = []
    const result = await runServiceCommerceMediaSafety(payload, {
      assertProviderAllowed: async () => undefined,
      inspect: async () => ({ lifecycle: "quarantined" }),
      load: async () => ({
        contentDigest: "c".repeat(64),
        mediaAssetId: "media_1",
        mimeType: "application/pdf",
        storageReference: "private:media_1",
        verifiedSizeBytes: 5,
      }),
      record: async (input) => {
        outcomes.push(input.outcome)
        return { lifecycle: input.outcome }
      },
    })

    expect(result).toEqual({ lifecycle: "quarantined" })
    expect(outcomes).toEqual(["quarantined"])
  })
})
