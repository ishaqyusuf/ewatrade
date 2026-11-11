import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "@ewatrade/catalog/photo-contracts"
import {
  CATALOG_QA_REVIEW_POLICY,
  CATALOG_QA_REVIEW_PROVIDER,
  CATALOG_QA_STORE_ID,
} from "@ewatrade/catalog/photo-qa-policy"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import { replaceCatalogItemPhotos } from "./catalog-photo-replacement"
import {
  catalogPhotoUsage,
  catalogPhotoUsageSelect,
} from "./catalog-photo-usage"
import { getCatalogPublicPhotoTarget } from "./catalog-photos"

describeWithServiceCommerceDatabase("Catalog option photos", () => {
  test("assigns a scoped photo atomically and limits public delivery to its variant", async () => {
    const { prisma: db } = await import("../client")
    const key = randomUUID()
    const {
      actor,
      tenant,
      store,
      otherStore,
      item,
      variant,
      fallback,
      otherVariant,
      assetId,
    } = await db.$transaction(
      async (tx) => {
        const actor = await tx.user.create({
          data: {
            name: "Photo fixture",
            email: `option-photo-${key}@example.invalid`,
          },
        })
        const tenant = await tx.tenant.create({
          data: {
            name: "Photo fixture",
            slug: `option-photo-${key}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: actor.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        const store = await tx.store.create({
          data: {
            tenantId: tenant.id,
            name: "Fixture",
            slug: "fixture",
            status: "ACTIVE",
          },
        })
        const otherStore = await tx.store.create({
          data: {
            tenantId: tenant.id,
            name: "Other Store",
            slug: "other",
            status: "ACTIVE",
          },
        })
        await tx.site.create({
          data: {
            tenantId: tenant.id,
            storeId: store.id,
            name: "Fixture",
            slug: "fixture",
            status: "PUBLISHED",
          },
        })
        const item = await tx.catalogItem.create({
          data: {
            tenantId: tenant.id,
            slug: "broiler",
            name: "Broiler",
            kind: "PRODUCT",
            status: "ACTIVE",
          },
        })
        const another = await tx.catalogItem.create({
          data: {
            tenantId: tenant.id,
            slug: "other",
            name: "Other item",
            kind: "PRODUCT",
          },
        })
        const variant = await tx.sellableVariant.create({
          data: {
            catalogItemId: item.id,
            key: "day-old",
            name: "Day-old",
            status: "ACTIVE",
          },
        })
        const fallback = await tx.sellableVariant.create({
          data: {
            catalogItemId: item.id,
            key: "fully-grown",
            name: "Fully grown",
            status: "ACTIVE",
          },
        })
        const otherVariant = await tx.sellableVariant.create({
          data: {
            catalogItemId: another.id,
            key: "elsewhere",
            name: "Other",
            status: "ACTIVE",
          },
        })
        for (const choice of [variant, fallback]) {
          await tx.sellableOffering.create({
            data: {
              tenantId: tenant.id,
              catalogItemId: item.id,
              variantId: choice.id,
              key: choice.key,
              kind: "PRODUCT_UNIT",
              status: "ACTIVE",
              name: choice.name,
              pricingPolicy: "FIXED",
              fixedPriceMinor: 1,
              currencyCode: "NGN",
              storeAvailability: {
                create: { storeId: store.id, isAvailable: true },
              },
            },
          })
        }
        const assetId = randomUUID()
        const photo: CatalogStoredPhoto = {
          assetId,
          tenantId: tenant.id,
          storeId: store.id,
          contentDigest: "a".repeat(64),
          contentType: "image/png",
          sizeBytes: 8,
          storageProvider: "local_test",
          storagePath: "",
        }
        const now = new Date()
        await tx.catalogPhotoAsset.create({
          data: {
            id: assetId,
            catalogItemId: item.id,
            tenantId: tenant.id,
            storeId: store.id,
            actorUserId: actor.id,
            clientOperationId: "fixture-photo",
            payloadHash: photo.contentDigest,
            contentDigest: photo.contentDigest,
            contentType: photo.contentType,
            sizeBytes: photo.sizeBytes,
            storageProvider: photo.storageProvider,
            storageStoreId: CATALOG_QA_STORE_ID,
            storagePath: catalogPhotoStoragePath(photo),
            attachedAt: now,
            sortOrder: 0,
            uploadedAt: now,
            expiresAt: new Date(now.getTime() + 86_400_000),
            state: "APPROVED",
            approvedAt: now,
            reviewedAt: now,
            reviewProvider: CATALOG_QA_REVIEW_PROVIDER,
            reviewPolicyVersion: CATALOG_QA_REVIEW_POLICY,
            reviewDisplayDigest: "b".repeat(64),
          },
        })
        return {
          actor,
          tenant,
          store,
          otherStore,
          item,
          variant,
          fallback,
          otherVariant,
          assetId,
        }
      },
      { maxWait: 10_000, timeout: 30_000 },
    )

    try {
      const lookup = { assetId, storeId: store.id }
      const assign = {
        actorUserId: actor.id,
        tenantId: tenant.id,
        storeId: store.id,
        catalogItemId: item.id,
        clientOperationId: "assign-option-photo",
        assetIds: [assetId],
        optionVariantIds: [variant.id],
        expectedAssetIds: [assetId],
        expectedOptionVariantIds: [null],
      }
      // Existing general attachment is deliverable without any assignment.
      expect(
        (await getCatalogPublicPhotoTarget(db, lookup)).photo.assetId,
      ).toBe(assetId)
      await expect(
        replaceCatalogItemPhotos(db, {
          ...assign,
          optionVariantIds: [otherVariant.id],
        }),
      ).rejects.toMatchObject({ code: "INVALID_PHOTO" })
      await expect(
        replaceCatalogItemPhotos(db, {
          ...assign,
          storeId: otherStore.id,
          expectedAssetIds: [],
          expectedOptionVariantIds: [],
        }),
      ).rejects.toMatchObject({ code: "PHOTO_NOT_READY" })
      await expect(
        replaceCatalogItemPhotos(db, {
          ...assign,
          actorUserId: "unauthorized-user",
        }),
      ).rejects.toMatchObject({ code: "PHOTO_ACCESS_DENIED" })
      expect(await replaceCatalogItemPhotos(db, assign)).toMatchObject({
        optionVariantIds: [variant.id],
        replayed: false,
      })
      expect(await replaceCatalogItemPhotos(db, assign)).toMatchObject({
        optionVariantIds: [variant.id],
        replayed: true,
      })
      await expect(
        replaceCatalogItemPhotos(db, {
          ...assign,
          clientOperationId: "stale-option-photo",
          optionVariantIds: [null],
        }),
      ).rejects.toMatchObject({ code: "PHOTO_COMMAND_CONFLICT" })
      await replaceCatalogItemPhotos(db, {
        ...assign,
        clientOperationId: "legacy-photo-command",
        optionVariantIds: undefined,
        expectedOptionVariantIds: undefined,
      })
      expect(
        await db.catalogPhotoAsset.findUnique({
          where: { id: assetId },
          select: { optionVariantId: true },
        }),
      ).toEqual({ optionVariantId: variant.id })
      expect(
        (await getCatalogPublicPhotoTarget(db, lookup)).photo.assetId,
      ).toBe(assetId)
      await db.sellableVariant.update({
        where: { id: variant.id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      })
      // The other offering keeps the item eligible. The archived option's URL is refused.
      await expect(
        getCatalogPublicPhotoTarget(db, lookup),
      ).rejects.toMatchObject({ code: "PHOTO_NOT_FOUND" })
      await replaceCatalogItemPhotos(db, {
        ...assign,
        clientOperationId: "restore-general-photo",
        optionVariantIds: [null],
        expectedOptionVariantIds: [variant.id],
      })
      expect(
        (await getCatalogPublicPhotoTarget(db, lookup)).photo.assetId,
      ).toBe(assetId)
      await db.sellableVariant.update({
        where: { id: variant.id },
        data: { status: "ACTIVE", archivedAt: null },
      })
      const shared = {
        ...assign,
        clientOperationId: "share-photo-across-uses",
        optionVariantIds: undefined,
        expectedOptionVariantIds: undefined,
        photoUsages: [[null, variant.id, fallback.id]],
        expectedPhotoUsages: [[null]],
      }
      const primaryId = variant.id < fallback.id ? variant.id : fallback.id
      const secondaryId = primaryId === variant.id ? fallback.id : variant.id
      const usages = [[null, primaryId, secondaryId]]
      expect(await replaceCatalogItemPhotos(db, shared)).toMatchObject({
        photoUsages: usages,
        replayed: false,
      })
      expect(
        await replaceCatalogItemPhotos(db, {
          ...shared,
          photoUsages: [[fallback.id, variant.id, null]],
        }),
      ).toMatchObject({ photoUsages: usages, replayed: true })
      await expect(
        replaceCatalogItemPhotos(db, {
          ...shared,
          clientOperationId: "stale-multiple-uses",
        }),
      ).rejects.toMatchObject({ code: "PHOTO_COMMAND_CONFLICT" })
      await replaceCatalogItemPhotos(db, {
        ...assign,
        clientOperationId: "old-client-keeps-extra-uses",
        optionVariantIds: [null],
        expectedOptionVariantIds: [null],
      })
      const persisted = await db.catalogPhotoAsset.findUniqueOrThrow({
        where: { id: assetId },
        select: catalogPhotoUsageSelect,
      })
      expect(catalogPhotoUsage(persisted)).toEqual(usages[0])
      await expect(
        replaceCatalogItemPhotos(db, {
          ...shared,
          clientOperationId: "foreign-multiple-uses",
          expectedPhotoUsages: usages,
          photoUsages: [[null, otherVariant.id]],
        }),
      ).rejects.toMatchObject({ code: "INVALID_PHOTO" })
      await replaceCatalogItemPhotos(db, {
        ...shared,
        clientOperationId: "share-with-two-options-only",
        expectedPhotoUsages: usages,
        photoUsages: [[primaryId, secondaryId]],
      })
      await db.sellableVariant.update({
        where: { id: primaryId },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      })
      expect(
        (await getCatalogPublicPhotoTarget(db, lookup)).photo.assetId,
      ).toBe(assetId)
      await replaceCatalogItemPhotos(db, {
        ...shared,
        clientOperationId: "remove-both-option-uses",
        expectedPhotoUsages: [[primaryId, secondaryId]],
        photoUsages: [[null]],
      })
      expect(await db.catalogPhotoOption.count({ where: { assetId } })).toBe(0)
    } finally {
      const tenantScope = { tenantId: tenant.id }
      await db.$transaction([
        db.catalogCommandReceipt.deleteMany({ where: tenantScope }),
        db.catalogPhotoAsset.deleteMany({ where: tenantScope }),
        db.catalogItem.deleteMany({ where: tenantScope }),
        db.site.deleteMany({ where: tenantScope }),
        db.store.deleteMany({ where: tenantScope }),
        db.membership.deleteMany({ where: tenantScope }),
        db.tenant.delete({ where: { id: tenant.id } }),
        db.user.delete({ where: { id: actor.id } }),
      ])
    }
  }, 120_000)
})
