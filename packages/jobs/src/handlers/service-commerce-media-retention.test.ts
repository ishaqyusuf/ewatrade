import { describe, expect, test } from "bun:test"

import { runServiceCommerceMediaRetention } from "./service-commerce-media-retention"

describe("Service Commerce media retention", () => {
  test("deletes only the private object returned by a scoped retention claim", async () => {
    const calls: unknown[] = []
    const result = await runServiceCommerceMediaRetention(
      { mediaAssetId: "media_1", storeId: "store_1", tenantId: "tenant_1" },
      {
        claim: async () => ({
          mediaAssetId: "media_1",
          storageReference: "private:media_1",
        }),
        complete: async (input) => {
          calls.push(["complete", input.reason])
          return { lifecycle: "deleted" }
        },
        storage: {
          delete: async (input) => {
            calls.push(["delete", input])
          },
        },
      },
    )

    expect(result).toEqual({ lifecycle: "deleted" })
    expect(calls).toEqual([
      [
        "delete",
        {
          mediaAssetId: "media_1",
          storageReference: "private:media_1",
        },
      ],
      ["complete", "baseline_retention_deleted"],
    ])
  })

  test("is a no-op when another worker owns the lease", async () => {
    expect(
      await runServiceCommerceMediaRetention(
        { mediaAssetId: "media_1", storeId: "store_1", tenantId: "tenant_1" },
        {
          claim: async () => null,
          complete: async () => {
            throw new Error("not used")
          },
          storage: {
            delete: async () => {
              throw new Error("not used")
            },
          },
        },
      ),
    ).toBeNull()
  })
})
