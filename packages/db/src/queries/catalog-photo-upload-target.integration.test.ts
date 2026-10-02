import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import {
  createCatalogPhotoIntent,
  getCatalogPhotoUploadTarget,
} from "./catalog-photos"

setDefaultTimeout(180_000)
describeWithServiceCommerceDatabase(
  "Catalog upload target authorization",
  () => {
    test("owned current intent binds bytes and classification; expired/revoked/foreign targets reject", async () => {
      const { prisma: db } = await import("../client")
      const actor = await db.user.create({
        data: {
          name: "Catalog upload target fixture",
          email: `photo-target-${randomUUID()}@example.invalid`,
        },
      })
      let tenantId: string | undefined
      try {
        const tenant = await db.tenant.create({
          data: {
            name: "Catalog upload target fixture",
            slug: `photo-target-${randomUUID()}`,
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
            name: "One",
            slug: "one",
            status: "ACTIVE",
          },
        })
        const other = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Two",
            slug: "two",
            status: "ACTIVE",
          },
        })
        const scope = {
          tenantId: tenant.id,
          storeId: store.id,
          actorUserId: actor.id,
        }
        const asset = await createCatalogPhotoIntent(db, {
          ...scope,
          clientOperationId: "owned-upload-target",
          contentDigest: "a".repeat(64),
          contentType: "image/png",
          sizeBytes: 8,
        })
        const target = await getCatalogPhotoUploadTarget(db, {
          ...scope,
          assetId: asset.assetId,
        })
        expect(target).toEqual({
          assetId: asset.assetId,
          actorUserId: actor.id,
          scope: {
            tenantId: tenant.id,
            storeId: store.id,
            dataClassification: "QA",
          },
          contentDigest: "a".repeat(64),
          contentType: "image/png",
          sizeBytes: 8,
        })
        expect(JSON.stringify(target)).not.toContain("storagePath")
        await expect(
          getCatalogPhotoUploadTarget(db, {
            ...scope,
            storeId: other.id,
            assetId: asset.assetId,
          }),
        ).rejects.toMatchObject({ code: "PHOTO_NOT_FOUND" })
        await expect(
          getCatalogPhotoUploadTarget(db, {
            ...scope,
            actorUserId: "foreign",
            assetId: asset.assetId,
          }),
        ).rejects.toMatchObject({ code: "PHOTO_ACCESS_DENIED" })
        await db.catalogPhotoAsset.update({
          where: { id: asset.assetId },
          data: { expiresAt: new Date(0) },
        })
        await expect(
          getCatalogPhotoUploadTarget(db, { ...scope, assetId: asset.assetId }),
        ).rejects.toMatchObject({ code: "PHOTO_NOT_READY" })
        await db.catalogPhotoAsset.update({
          where: { id: asset.assetId },
          data: { expiresAt: new Date(Date.now() + 60_000), state: "REMOVED" },
        })
        await expect(
          getCatalogPhotoUploadTarget(db, { ...scope, assetId: asset.assetId }),
        ).rejects.toMatchObject({ code: "PHOTO_NOT_READY" })
        await db.catalogPhotoAsset.update({
          where: { id: asset.assetId },
          data: { state: "UPLOADING" },
        })
        await db.membership.update({
          where: { tenantId_userId: { tenantId: tenant.id, userId: actor.id } },
          data: { status: "SUSPENDED" },
        })
        await expect(
          getCatalogPhotoUploadTarget(db, { ...scope, assetId: asset.assetId }),
        ).rejects.toMatchObject({ code: "PHOTO_ACCESS_DENIED" })
      } finally {
        if (tenantId) {
          await db.catalogPhotoAsset.deleteMany({ where: { tenantId } })
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
