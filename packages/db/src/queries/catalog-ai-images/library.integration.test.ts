import { expect, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { catalogPhotoStoragePath } from "@ewatrade/catalog/photo-contracts"
import { catalogPhotoStorageIdentity } from "@ewatrade/catalog/photo-qa-policy"
import { emptyCatalogAiPolicy } from "@ewatrade/utils/catalog-ai-images"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { catalogAiTokenAnalytics } from "./analytics"
import {
  readCatalogAiLibrary,
  readCatalogAiLibraryImageTarget,
} from "./library"

describeWithServiceCommerceDatabase("Catalog AI reporting", () => {
  test("reports failed provider usage and protects removed output", async () => {
    const { prisma: db } = await import("../../client")
    const scope = await db.store.findFirstOrThrow({
      where: {
        status: "ACTIVE",
        tenant: {
          dataClassification: "LIVE",
          isActive: true,
          qaPurgeStartedAt: null,
        },
      },
      select: { id: true, tenantId: true },
    })
    const rollback = new Error("Rollback temporary reporting metadata.")
    // Roll back every row. No media is written or read, and no provider is called.
    await expect(
      db.$transaction(
        async (tx) => {
          const receivedAt = new Date("2044-05-02T01:00:00Z")
          const now = new Date("2044-05-02T02:00:00Z")
          const policy = emptyCatalogAiPolicy()
          const owner = {
            tenantId: scope.tenantId,
            storeId: scope.id,
            actorUserId: "local-reporting-verification",
          }
          const assetId = randomUUID()
          const photo = {
            ...owner,
            assetId,
            contentDigest: createHash("sha256").update(assetId).digest("hex"),
            contentType: "image/webp" as const,
          }
          const storageStoreId = catalogPhotoStorageIdentity("LIVE").storeId
          if (!storageStoreId)
            throw new Error("Local private photo store is required.")
          await tx.catalogPhotoAsset.create({
            data: {
              ...owner,
              id: assetId,
              clientOperationId: assetId,
              payloadHash: "reporting-check",
              contentDigest: photo.contentDigest,
              contentType: photo.contentType,
              sizeBytes: 100,
              storageProvider: "vercel_blob_private",
              storageStoreId,
              storagePath: catalogPhotoStoragePath(photo),
              state: "APPROVED",
              uploadedAt: receivedAt,
              approvedAt: receivedAt,
              reviewDisplayDigest: photo.contentDigest,
              expiresAt: new Date("2044-06-01T00:00:00Z"),
            },
          })
          const jobFacts = {
            ...owner,
            contextKey: "local-reporting-verification",
            payloadHash: "reporting-check",
            mode: "generate",
            facts: { name: "Temporary reporting metadata", kind: "PRODUCT" },
            note: "",
            policySnapshot: policy,
            policyRevision: policy.revision,
            model: policy.generation.model,
            reservedCostMicros: 2000,
            createdAt: receivedAt,
            dispatchedAt: receivedAt,
          }
          const delivered = await tx.catalogAiImageJob.create({
            data: {
              ...jobFacts,
              clientOperationId: randomUUID(),
              state: "DELIVERED",
              outputAssetId: assetId,
              deliveredAt: receivedAt,
              costMicros: 120,
              usage: { textInput: 14, imageInput: 0, output: 20 },
            },
          })
          const failed = await tx.catalogAiImageJob.create({
            data: {
              ...jobFacts,
              clientOperationId: randomUUID(),
              state: "FAILED",
              costMicros: 35,
              usage: { textInput: 5, imageInput: 4, output: 0 },
            },
          })
          await tx.catalogAiProviderCost.createMany({
            data: [
              { id: delivered.id, costMicros: 120 },
              { id: failed.id, costMicros: 35 },
              { id: randomUUID(), costMicros: null },
              { id: randomUUID(), costMicros: 0 },
            ].map((cost) => ({
              ...cost,
              reservedCostMicros: 2000,
              createdAt: receivedAt,
            })),
          })
          await tx.catalogAiImageVersion.create({
            data: {
              assetId,
              rootAssetId: assetId,
              jobId: delivered.id,
              tenantId: owner.tenantId,
              storeId: owner.storeId,
            },
          })
          const usage = await catalogAiTokenAnalytics(tx, now)
          expect(usage.daily).toHaveLength(30)
          expect(usage.totals).toEqual({
            textInput: 19,
            imageInput: 4,
            output: 20,
            reportedRequests: 2,
            missingUsageRequests: 1,
          })
          expect(usage.daily.at(-1)).toEqual({
            date: "2044-05-02",
            ...usage.totals,
          })
          const library = await readCatalogAiLibrary(tx)
          expect(library.items[0]).toEqual({
            id: delivered.id,
            mode: "generate",
            model: policy.generation.model,
            deliveredAt: receivedAt,
            usage: { textInput: 14, imageInput: 0, output: 20 },
            estimatedCostMicros: 120,
          })
          expect(
            (await readCatalogAiLibrary(tx, delivered.id)).items.map(
              (item) => item.id,
            ),
          ).not.toContain(delivered.id)
          expect(
            (await readCatalogAiLibraryImageTarget(tx, delivered.id)).photo
              .assetId,
          ).toBe(assetId)
          await tx.catalogAiImageVersion.update({
            where: { assetId },
            data: { removedAt: receivedAt },
          })
          expect(
            (await readCatalogAiLibrary(tx)).items.map((item) => item.id),
          ).not.toContain(delivered.id)
          await expect(
            readCatalogAiLibraryImageTarget(tx, delivered.id),
          ).rejects.toThrow("Image unavailable")
          throw rollback
        },
        { maxWait: 10_000, timeout: 45_000 },
      ),
    ).rejects.toBe(rollback)
  }, 60_000)
})
