import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "@ewatrade/catalog/photo-contracts"
import { CATALOG_CATEGORY_PRESETS } from "@ewatrade/utils/catalog-category-presets"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import {
  listCatalogCategories,
  resolveCatalogCategorySelection,
} from "./catalog-categories"
import {
  claimCatalogPhotoCleanup,
  finishCatalogPhotoCleanup,
  recordCatalogPhotoVerdict,
  removeCatalogPhoto,
} from "./catalog-photo-lifecycle"
import { replaceCatalogItemPhotos } from "./catalog-photo-replacement"
import {
  createCatalogPhotoIntent,
  getCatalogPhotoReadTarget,
  getCatalogPublicPhotoTarget,
  recordVerifiedCatalogPhotoUpload,
} from "./catalog-photos"

setDefaultTimeout(240_000)
describeWithServiceCommerceDatabase(
  "Catalog photo lifecycle and hierarchy",
  () => {
    test("private pending/approved delivery, removal retention and tenant-owned categories", async () => {
      const { prisma: db } = await import("../client")
      const actor = await db.user.create({
        data: {
          name: "Owned Catalog lifecycle fixture",
          email: `catalog-lifecycle-${randomUUID()}@example.invalid`,
        },
      })
      let tenantId: string | undefined
      try {
        const tenant = await db.tenant.create({
          data: {
            slug: `catalog-lifecycle-${randomUUID()}`,
            name: "Owned Catalog lifecycle fixture",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: actor.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantId = tenant.id
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            slug: "fixture",
            name: "Fixture",
            status: "ACTIVE",
          },
        })
        const scope = {
          tenantId: tenant.id,
          storeId: store.id,
          actorUserId: actor.id,
        }
        const preset = CATALOG_CATEGORY_PRESETS[0]
        if (!preset?.subcategories[0])
          throw new Error("Missing vocabulary fixture")
        const label = `${preset.label} / ${preset.subcategories[0].label}`
        const selection = await db.$transaction(
          (tx) =>
            resolveCatalogCategorySelection(tx, { ...scope, category: label }),
          { maxWait: 10_000, timeout: 30_000 },
        )
        const replay = await db.$transaction(
          (tx) =>
            resolveCatalogCategorySelection(tx, { ...scope, category: label }),
          { maxWait: 10_000, timeout: 30_000 },
        )
        expect(replay).toEqual(selection)
        expect(selection.subcategoryId).not.toBeNull()
        const { subcategoryId } = selection
        if (subcategoryId === null)
          throw new Error(
            "Expected the category label to resolve a subcategory",
          )
        expect(
          (await listCatalogCategories(db, scope))[0]?.children[0]?.id,
        ).toBe(subcategoryId)
        await expect(
          db.$transaction(
            (tx) =>
              resolveCatalogCategorySelection(tx, {
                ...scope,
                categoryId: selection.subcategoryId ?? "invalid",
              }),
            { maxWait: 10_000, timeout: 30_000 },
          ),
        ).rejects.toThrow("parent")
        expect(
          await db.$transaction((tx) =>
            resolveCatalogCategorySelection(tx, scope),
          ),
        ).toEqual({ category: null, categoryId: null, subcategoryId: null })
        const item = await db.catalogItem.create({
          data: {
            tenantId: tenant.id,
            slug: "fixture-item",
            name: "Fixture",
            kind: "SERVICE",
            status: "ACTIVE",
            ...selection,
          },
        })
        const variant = await db.sellableVariant.create({
          data: {
            catalogItemId: item.id,
            key: "default",
            name: "Fixture",
            status: "ACTIVE",
            isDefault: true,
          },
        })
        const offering = await db.sellableOffering.create({
          data: {
            tenantId: tenant.id,
            catalogItemId: item.id,
            variantId: variant.id,
            key: "default",
            name: "Fixture",
            kind: "SERVICE",
            status: "ACTIVE",
            pricingPolicy: "FIXED",
            fixedPriceMinor: 1,
            currencyCode: "NGN",
            storeAvailability: {
              create: { storeId: store.id, isAvailable: true },
            },
          },
        })
        const asset = await createCatalogPhotoIntent(db, {
          ...scope,
          clientOperationId: "owned-lifecycle-photo",
          contentDigest: "a".repeat(64),
          contentType: "image/png",
          sizeBytes: 8,
        })
        const photo: CatalogStoredPhoto = {
          assetId: asset.assetId,
          tenantId: tenant.id,
          storeId: store.id,
          contentDigest: "a".repeat(64),
          contentType: "image/png",
          sizeBytes: 8,
          storageProvider: "vercel_blob_private",
          storagePath: "",
        }
        photo.storagePath = catalogPhotoStoragePath(photo)
        await recordVerifiedCatalogPhotoUpload(db, scope, photo)
        expect(
          (
            await getCatalogPhotoReadTarget(db, {
              ...scope,
              assetId: asset.assetId,
            })
          ).photo,
        ).toEqual(photo)
        const lookup = { assetId: asset.assetId, storeId: store.id }
        await expect(getCatalogPublicPhotoTarget(db, lookup)).rejects.toThrow(
          "not found",
        )
        const replacement = {
          ...scope,
          catalogItemId: item.id,
          assetIds: [asset.assetId],
          clientOperationId: "owned-replace-photo",
        }
        expect(await replaceCatalogItemPhotos(db, replacement)).toEqual({
          assetIds: [asset.assetId],
          illustrationId: undefined,
          replayed: false,
        })
        expect(await replaceCatalogItemPhotos(db, replacement)).toEqual({
          assetIds: [asset.assetId],
          illustrationId: undefined,
          replayed: true,
        })
        await expect(
          replaceCatalogItemPhotos(db, { ...replacement, assetIds: [] }),
        ).rejects.toThrow("command")
        await expect(
          replaceCatalogItemPhotos(db, {
            ...replacement,
            clientOperationId: "foreign-replace-photo",
            storeId: "foreign",
          }),
        ).rejects.toThrow()
        const otherStore = await db.store.create({
          data: {
            tenantId: tenant.id,
            slug: "other",
            name: "Other fixture",
            status: "ACTIVE",
          },
        })
        const otherScope = { ...scope, storeId: otherStore.id }
        const otherAsset = await createCatalogPhotoIntent(db, {
          ...otherScope,
          clientOperationId: "owned-other-store-photo",
          contentDigest: photo.contentDigest,
          contentType: photo.contentType,
          sizeBytes: photo.sizeBytes,
        })
        const otherPhoto = {
          ...photo,
          assetId: otherAsset.assetId,
          storeId: otherStore.id,
        }
        otherPhoto.storagePath = catalogPhotoStoragePath(otherPhoto)
        await recordVerifiedCatalogPhotoUpload(db, otherScope, otherPhoto)
        await replaceCatalogItemPhotos(db, {
          ...otherScope,
          catalogItemId: item.id,
          assetIds: [otherAsset.assetId],
          clientOperationId: "owned-other-store-replace",
        })
        await expect(
          replaceCatalogItemPhotos(db, {
            ...replacement,
            assetIds: [otherAsset.assetId],
            clientOperationId: "owned-wrong-store-replace",
          }),
        ).rejects.toThrow("Store")
        // Synthetic internal verdict exercises persistence only, never a real
        // provider. QA classification still refuses anonymous/live delivery.
        await recordCatalogPhotoVerdict(db, {
          ...scope,
          assetId: asset.assetId,
          sourceDigest: photo.contentDigest,
          displayDigest: "b".repeat(64),
          provider: "owned-fixture",
          policyVersion: "v1",
          verdict: "APPROVED",
        })
        await expect(getCatalogPublicPhotoTarget(db, lookup)).rejects.toThrow(
          "not found",
        )
        await db.tenant.update({
          where: { id: tenant.id },
          data: { dataClassification: "LIVE" },
        })
        await expect(getCatalogPublicPhotoTarget(db, lookup)).rejects.toThrow(
          "not found",
        )
        await db.site.create({
          data: {
            tenantId: tenant.id,
            storeId: store.id,
            name: "Fixture",
            slug: "fixture",
            status: "PUBLISHED",
          },
        })
        expect(
          (await getCatalogPublicPhotoTarget(db, lookup)).displayDigest,
        ).toBe("b".repeat(64))
        await expect(
          getCatalogPublicPhotoTarget(db, { ...lookup, storeId: "foreign" }),
        ).rejects.toThrow("not found")
        await db.storeOfferingAvailability.update({
          where: {
            storeId_offeringId: { storeId: store.id, offeringId: offering.id },
          },
          data: { isAvailable: false },
        })
        await expect(getCatalogPublicPhotoTarget(db, lookup)).rejects.toThrow(
          "not found",
        )
        expect(
          await replaceCatalogItemPhotos(db, {
            ...replacement,
            assetIds: [],
            clientOperationId: "owned-clear-photos",
          }),
        ).toEqual({ assetIds: [], illustrationId: undefined, replayed: false })
        expect(
          (
            await db.catalogPhotoAsset.findUnique({
              where: { id: otherAsset.assetId },
            })
          )?.catalogItemId,
        ).toBe(item.id)
        // Replaying an older successful command must not resurrect removed data.
        await replaceCatalogItemPhotos(db, replacement)
        expect(
          (
            await db.catalogPhotoAsset.findUnique({
              where: { id: asset.assetId },
            })
          )?.catalogItemId,
        ).toBeNull()
        const removed = await removeCatalogPhoto(db, {
          ...scope,
          assetId: asset.assetId,
        })
        expect(removed.canDelete).toBe(false)
        await expect(
          getCatalogPhotoReadTarget(db, { ...scope, assetId: asset.assetId }),
        ).rejects.toThrow("not found")
        expect(await claimCatalogPhotoCleanup(db, asset.assetId)).toBeNull()
        await db.catalogPhotoAsset.update({
          where: { id: asset.assetId },
          data: { expiresAt: new Date(0) },
        })
        const cleanup = await claimCatalogPhotoCleanup(db, asset.assetId)
        expect(cleanup?.photo).toEqual(photo)
        expect(await finishCatalogPhotoCleanup(db, photo)).toBe(true)
        expect(await claimCatalogPhotoCleanup(db, asset.assetId)).toBeNull()
        expect(
          (await db.catalogItem.findUnique({ where: { id: item.id } }))
            ?.categoryId,
        ).toBe(selection.categoryId)
      } finally {
        if (tenantId) {
          await db.catalogCommandReceipt.deleteMany({ where: { tenantId } })
          await db.catalogPhotoAsset.deleteMany({ where: { tenantId } })
          await db.catalogItem.deleteMany({ where: { tenantId } })
          await db.catalogCategory.deleteMany({
            where: { tenantId, parentId: { not: null } },
          })
          await db.catalogCategory.deleteMany({ where: { tenantId } })
          await db.site.deleteMany({ where: { tenantId } })
          await db.store.deleteMany({ where: { tenantId } })
          await db.membership.deleteMany({ where: { tenantId } })
          await db.tenant.deleteMany({ where: { id: tenantId } })
        }
        await db.user.delete({ where: { id: actor.id } })
        expect(await db.user.findUnique({ where: { id: actor.id } })).toBeNull()
        if (tenantId)
          expect(
            await db.tenant.findUnique({ where: { id: tenantId } }),
          ).toBeNull()
      }
    })
  },
)
