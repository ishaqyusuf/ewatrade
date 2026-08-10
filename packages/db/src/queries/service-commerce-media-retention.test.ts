import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  claimServiceCommerceMediaRetention,
  recordDeletedServiceCommerceMediaAsset,
} from "./service-commerce-media-assets"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

describe("Service Commerce baseline media retention", () => {
  test("leases and deletes only a due ordinary-commerce asset in scope", async () => {
    const writes: Array<Record<string, unknown>> = []
    const current = {
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      declaredMediaType: "image/jpeg",
      id: "media_1",
      kind: "IMAGE",
      lifecycle: "SAFE",
      objectKey: "private:media_1",
      originalFileName: "bag.jpg",
      providerConnectionId: null,
      providerMediaId: null,
      storeId: "store_1",
      tenantId: "tenant_1",
      verifiedMediaType: "image/jpeg",
      verifiedSizeBytes: 4,
    }
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      serviceCommerceMediaAsset: {
        findFirst: async () => current,
        updateMany: async ({
          data,
          where,
        }: {
          data: Record<string, unknown>
          where: Record<string, unknown>
        }) => {
          writes.push(where)
          Object.assign(current, data)
          return { count: 1 }
        },
      },
      serviceCommerceMediaAuditEvent: { create: async () => ({ id: "audit" }) },
    }
    const scope = {
      mediaAssetId: "media_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    }

    const claim = await claimServiceCommerceMediaRetention(dbClient(client), {
      ...scope,
      now: new Date("2026-08-10T12:00:00.000Z"),
    })
    expect(claim).toEqual({
      mediaAssetId: "media_1",
      storageReference: "private:media_1",
    })
    const deleted = await recordDeletedServiceCommerceMediaAsset(
      dbClient(client),
      { ...scope, reason: "baseline_retention_deleted" },
    )
    expect(deleted).toMatchObject({ lifecycle: "deleted" })
    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ storeId: "store_1", tenantId: "tenant_1" }),
      ]),
    )
  })
})
