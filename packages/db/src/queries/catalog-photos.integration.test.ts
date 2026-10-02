import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "@ewatrade/catalog/photo-contracts"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import { createCatalogItem, getCatalogItem } from "./catalog"
import {
  type CatalogPhotoActorScope,
  assertCatalogPhotoCreationReplay,
  attachCatalogPhotoAssets,
  createCatalogPhotoIntent,
  getCatalogPhotoMetadata,
  recordVerifiedCatalogPhotoUpload,
} from "./catalog-photos"
import { deleteQaTenant } from "./qa-maintenance"

setDefaultTimeout(600_000)
const txOptions = { maxWait: 10_000, timeout: 30_000 }

function fixtureId(ids: string[], index: number) {
  const id = ids[index]
  if (!id) throw new Error(`Missing photo acceptance fixture ${index}`)
  return id
}

describeWithServiceCommerceDatabase("Catalog private photo records", () => {
  test("Tenant deletion cascades photo metadata through Store and Item references", async () => {
    const { prisma: db } = await import("../client")
    const tenant = await db.tenant.create({
      data: {
        slug: `photo-cascade-${randomUUID()}`,
        name: "Photo cascade fixture",
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        dataClassification: "QA",
        qaPurgeStartedAt: new Date(),
      },
    })
    try {
      const store = await db.store.create({
        data: { tenantId: tenant.id, slug: "one", name: "One" },
      })
      const item = await db.catalogItem.create({
        data: {
          tenantId: tenant.id,
          slug: "private-photo",
          name: "Private metadata fixture",
          kind: "SERVICE",
        },
      })
      // Persistence-only fixture: no provider bytes, approval or live upload.
      await db.catalogPhotoAsset.create({
        data: {
          tenantId: tenant.id,
          storeId: store.id,
          catalogItemId: item.id,
          actorUserId: "fixture-actor",
          clientOperationId: "cascade-command",
          payloadHash: "fixture-only",
          contentDigest: "a".repeat(64),
          contentType: "image/png",
          sizeBytes: 8,
          expiresAt: new Date(),
        },
      })
      await deleteQaTenant(db, tenant.id)
      expect(
        await db.tenant.findUnique({ where: { id: tenant.id } }),
      ).toBeNull()
      expect(
        await db.catalogPhotoAsset.count({ where: { tenantId: tenant.id } }),
      ).toBe(0)
      expect(await db.store.count({ where: { tenantId: tenant.id } })).toBe(0)
      expect(
        await db.catalogItem.count({ where: { tenantId: tenant.id } }),
      ).toBe(0)
    } finally {
      await db.catalogPhotoAsset.deleteMany({ where: { tenantId: tenant.id } })
      await db.tenant.deleteMany({ where: { id: tenant.id } })
    }
  })

  test("scoped retry, permissions, byte receipts and transactional Item attachment", async () => {
    const { prisma: db } = await import("../client")
    const runId = randomUUID()
    const userIds: string[] = []
    const tenantIds: string[] = []
    try {
      for (const name of ["Owner", "Other manager", "Cashier"])
        userIds.push(
          (
            await db.user.create({
              data: {
                name: `Photo acceptance ${name}`,
                email: `catalog-photo-${randomUUID()}@example.invalid`,
              },
            })
          ).id,
        )
      for (let i = 0; i < 2; i++)
        tenantIds.push(
          (
            await db.tenant.create({
              data: {
                slug: `photo-acceptance-${runId}-${i}`,
                name: "Photo acceptance fixture",
                type: "MERCHANT",
                enabledModes: ["MERCHANT"],
                dataClassification: "QA",
                users: {
                  create: {
                    userId: fixtureId(userIds, 0),
                    role: "OWNER",
                    status: "ACTIVE",
                  },
                },
              },
            })
          ).id,
        )
      await db.membership.createMany({
        data: [
          {
            tenantId: fixtureId(tenantIds, 0),
            userId: fixtureId(userIds, 1),
            role: "MANAGER",
            status: "ACTIVE",
          },
          {
            tenantId: fixtureId(tenantIds, 0),
            userId: fixtureId(userIds, 2),
            role: "CASHIER",
            status: "ACTIVE",
          },
        ],
      })
      const store = await db.store.create({
        data: {
          tenantId: fixtureId(tenantIds, 0),
          slug: "one",
          name: "One",
          status: "ACTIVE",
        },
      })
      const otherStore = await db.store.create({
        data: {
          tenantId: fixtureId(tenantIds, 0),
          slug: "two",
          name: "Two",
          status: "ACTIVE",
        },
      })
      const foreignStore = await db.store.create({
        data: {
          tenantId: fixtureId(tenantIds, 1),
          slug: "foreign",
          name: "Foreign",
          status: "ACTIVE",
        },
      })
      const scope: CatalogPhotoActorScope = {
        tenantId: fixtureId(tenantIds, 0),
        storeId: store.id,
        actorUserId: fixtureId(userIds, 0),
      }
      const intent = {
        ...scope,
        clientOperationId: "same-upload-command",
        contentDigest: "a".repeat(64),
        contentType: "image/png" as const,
        sizeBytes: 8,
      }
      const [first, retry] = await Promise.all([
        createCatalogPhotoIntent(db, intent),
        createCatalogPhotoIntent(db, intent),
      ])
      expect(first).toEqual(retry)
      expect(first.state).toBe("UPLOADING")
      expect(first.catalogItemId).toBeNull()
      expect(
        await db.catalogPhotoAsset.count({
          where: { tenantId: scope.tenantId },
        }),
      ).toBe(1)
      for (const override of [
        { contentDigest: "b".repeat(64) },
        { sizeBytes: 9 },
        { storeId: otherStore.id },
        { actorUserId: fixtureId(userIds, 1) },
      ])
        await expect(
          createCatalogPhotoIntent(db, { ...intent, ...override }),
        ).rejects.toMatchObject({ code: "PHOTO_COMMAND_CONFLICT" })
      for (const override of [
        { storeId: otherStore.id },
        { actorUserId: fixtureId(userIds, 1) },
        { tenantId: fixtureId(tenantIds, 1), storeId: foreignStore.id },
      ])
        await expect(
          getCatalogPhotoMetadata(db, {
            ...scope,
            ...override,
            assetId: first.assetId,
          }),
        ).rejects.toMatchObject({ code: "PHOTO_NOT_FOUND" })
      await expect(
        createCatalogPhotoIntent(db, {
          ...intent,
          actorUserId: fixtureId(userIds, 2),
        }),
      ).rejects.toMatchObject({ code: "PHOTO_ACCESS_DENIED" })
      await db.store.update({
        where: { id: store.id },
        data: { status: "PAUSED" },
      })
      await expect(
        getCatalogPhotoMetadata(db, { ...scope, assetId: first.assetId }),
      ).rejects.toMatchObject({ code: "PHOTO_ACCESS_DENIED" })
      await db.store.update({
        where: { id: store.id },
        data: { status: "ACTIVE" },
      })
      await db.membership.update({
        where: {
          tenantId_userId: {
            tenantId: scope.tenantId,
            userId: scope.actorUserId,
          },
        },
        data: { status: "SUSPENDED" },
      })
      await expect(createCatalogPhotoIntent(db, intent)).rejects.toMatchObject({
        code: "PHOTO_ACCESS_DENIED",
      })
      await db.membership.update({
        where: {
          tenantId_userId: {
            tenantId: scope.tenantId,
            userId: scope.actorUserId,
          },
        },
        data: { status: "ACTIVE" },
      })
      await db.tenant.update({
        where: { id: scope.tenantId },
        data: { qaPurgeStartedAt: new Date() },
      })
      await expect(
        getCatalogPhotoMetadata(db, { ...scope, assetId: first.assetId }),
      ).rejects.toMatchObject({ code: "PHOTO_ACCESS_DENIED" })
      await db.tenant.update({
        where: { id: scope.tenantId },
        data: { qaPurgeStartedAt: null },
      })

      function stored(assetId: string): CatalogStoredPhoto {
        const photo = {
          ...scope,
          assetId,
          contentDigest: intent.contentDigest,
          contentType: intent.contentType,
          sizeBytes: intent.sizeBytes,
          storageProvider: "vercel_blob_private" as const,
        }
        return { ...photo, storagePath: catalogPhotoStoragePath(photo) }
      }
      // Synthetic descriptors test database commit only; no QA provider is called.
      await expect(
        recordVerifiedCatalogPhotoUpload(db, scope, {
          ...stored(first.assetId),
          sizeBytes: 9,
        }),
      ).rejects.toMatchObject({ code: "PHOTO_COMMAND_CONFLICT" })
      expect(
        (
          await getCatalogPhotoMetadata(db, {
            ...scope,
            assetId: first.assetId,
          })
        ).state,
      ).toBe("UPLOADING")
      const uploaded = await recordVerifiedCatalogPhotoUpload(
        db,
        scope,
        stored(first.assetId),
      )
      expect(uploaded.state).toBe("PENDING_REVIEW")
      expect(uploaded.uploadedAt).not.toBeNull()
      expect(
        await recordVerifiedCatalogPhotoUpload(
          db,
          scope,
          stored(first.assetId),
        ),
      ).toEqual(uploaded)
      expect(JSON.stringify(uploaded)).not.toContain("storagePath")
      expect(JSON.stringify(uploaded)).not.toContain("catalog/quarantine")

      const serviceInput = {
        ...scope,
        clientOperationId: "photo-item-create-command",
        kind: "service" as const,
        name: "Photo acceptance cleaning",
        photoAssetIds: [first.assetId],
        variants: [
          {
            key: "default",
            name: "Cleaning",
            isDefault: true,
            offerings: [
              {
                key: "cleaning",
                name: "Cleaning",
                pricingPolicy: "fixed" as const,
                fixedPriceMinor: 1000,
              },
            ],
          },
        ],
      }
      const created = await createCatalogItem(db, serviceInput)
      expect(created.imageUrl).toBeNull()
      expect(created.imageLinks).toEqual([])
      expect(JSON.stringify(created)).not.toContain("catalog/quarantine")
      const attached = await getCatalogPhotoMetadata(db, {
        ...scope,
        assetId: first.assetId,
      })
      expect(attached.catalogItemId).toBe(created.id)
      expect(attached.sortOrder).toBe(0)
      expect(attached.state).toBe("PENDING_REVIEW")
      expect(await createCatalogItem(db, serviceInput)).toEqual(created)
      await expect(
        createCatalogItem(db, {
          ...serviceInput,
          actorUserId: fixtureId(userIds, 1),
        }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
      expect(
        (
          await getCatalogItem(db, {
            tenantId: scope.tenantId,
            itemId: created.id,
          })
        )?.imageUrl,
      ).toBeNull()

      const productPhotos = await Promise.all(
        [0, 1].map((index) =>
          createCatalogPhotoIntent(db, {
            ...intent,
            clientOperationId: `product-photo-${index}`,
          }),
        ),
      )
      for (const photo of productPhotos)
        await recordVerifiedCatalogPhotoUpload(db, scope, stored(photo.assetId))
      const product = await createCatalogItem(db, {
        ...scope,
        clientOperationId: "product-private-photos",
        kind: "product",
        name: "Photo acceptance eggs",
        photoAssetIds: productPhotos.map((photo) => photo.assetId),
        unitConfiguration: {
          canonicalBalanceScale: 0,
          units: [
            {
              factor: "1",
              key: "egg",
              name: "Egg",
              stockBehavior: "canonical_shared",
              transactionScale: 0,
            },
          ],
        },
        variants: [
          {
            key: "default",
            name: "Eggs",
            isDefault: true,
            offerings: [
              {
                key: "egg",
                name: "Egg",
                inventoryUnitKey: "egg",
                pricingPolicy: "fixed",
                fixedPriceMinor: 100,
              },
            ],
          },
        ],
      })
      expect(product.imageUrl).toBeNull()
      expect(product.imageLinks).toEqual([])
      for (const [index, photo] of productPhotos.entries()) {
        const photoMetadata = await getCatalogPhotoMetadata(db, {
          ...scope,
          assetId: photo.assetId,
        })
        expect(photoMetadata.catalogItemId).toBe(product.id)
        expect(photoMetadata.sortOrder).toBe(index)
        expect(photoMetadata.state).toBe("PENDING_REVIEW")
      }

      const unuploaded = await createCatalogPhotoIntent(db, {
        ...intent,
        clientOperationId: "not-uploaded-command",
      })
      const beforeItems = await db.catalogItem.count({
        where: { tenantId: scope.tenantId },
      })
      await expect(
        createCatalogItem(db, {
          ...serviceInput,
          clientOperationId: "not-uploaded-item-command",
          name: "Must roll back",
          photoAssetIds: [unuploaded.assetId],
        }),
      ).rejects.toMatchObject({ code: "PHOTO_NOT_READY" })
      expect(
        await db.catalogItem.count({ where: { tenantId: scope.tenantId } }),
      ).toBe(beforeItems)
      expect(
        await db.catalogCommandReceipt.count({
          where: {
            tenantId: scope.tenantId,
            clientOperationId: "not-uploaded-item-command",
          },
        }),
      ).toBe(0)
      await db.catalogPhotoAsset.update({
        where: { id: unuploaded.assetId },
        data: { expiresAt: new Date(0) },
      })
      await expect(
        recordVerifiedCatalogPhotoUpload(db, scope, stored(unuploaded.assetId)),
      ).rejects.toMatchObject({ code: "PHOTO_NOT_READY" })

      const raceAsset = await createCatalogPhotoIntent(db, {
        ...intent,
        clientOperationId: "competing-attachment-command",
      })
      await recordVerifiedCatalogPhotoUpload(
        db,
        scope,
        stored(raceAsset.assetId),
      )
      const items = await Promise.all(
        [0, 1].map((index) =>
          db.catalogItem.create({
            data: {
              tenantId: scope.tenantId,
              slug: `race-${index}`,
              kind: "SERVICE",
              name: "Private attachment fixture",
            },
          }),
        ),
      )
      const races = await Promise.allSettled(
        items.map((item) =>
          db.$transaction(
            (tx) =>
              attachCatalogPhotoAssets(tx, {
                ...scope,
                catalogItemId: item.id,
                assetIds: [raceAsset.assetId],
              }),
            txOptions,
          ),
        ),
      )
      expect(
        races.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1)
      expect(
        races.filter((result) => result.status === "rejected"),
      ).toHaveLength(1)
      const winner = await getCatalogPhotoMetadata(db, {
        ...scope,
        assetId: raceAsset.assetId,
      })
      const winnerItemId = winner.catalogItemId
      if (!winnerItemId) throw new Error("Attachment race produced no owner")
      expect(items.map((item) => item.id)).toContain(winnerItemId)
      await db.$transaction(
        (tx) =>
          assertCatalogPhotoCreationReplay(tx, {
            ...scope,
            catalogItemId: winnerItemId,
            assetIds: [raceAsset.assetId],
          }),
        txOptions,
      )
      await expect(
        db.$transaction(
          (tx) =>
            attachCatalogPhotoAssets(tx, {
              ...scope,
              catalogItemId: created.id,
              assetIds: [first.assetId, first.assetId],
            }),
          txOptions,
        ),
      ).rejects.toMatchObject({ code: "INVALID_PHOTO" })
      await expect(
        Promise.resolve(
          db.catalogPhotoAsset.create({
            data: {
              tenantId: scope.tenantId,
              storeId: foreignStore.id,
              actorUserId: scope.actorUserId,
              clientOperationId: "invalid-store-fk-command",
              payloadHash: "fixture",
              contentDigest: intent.contentDigest,
              contentType: intent.contentType,
              sizeBytes: 8,
              expiresAt: new Date(),
            },
          }),
        ),
      ).rejects.toMatchObject({ code: "P2003" })

      // Bound concurrently open intents per actor/Store; expiry cleanup is separate.
      await db.catalogPhotoAsset.createMany({
        data: Array.from({ length: 32 }, (_, index) => ({
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          actorUserId: fixtureId(userIds, 1),
          clientOperationId: `quota-fixture-${index}`,
          payloadHash: "fixture-only",
          contentDigest: intent.contentDigest,
          contentType: intent.contentType,
          sizeBytes: 8,
          expiresAt: new Date(Date.now() + 60_000),
        })),
      })
      await expect(
        createCatalogPhotoIntent(db, {
          ...intent,
          actorUserId: fixtureId(userIds, 1),
          clientOperationId: "quota-denied-command",
        }),
      ).rejects.toMatchObject({ code: "PHOTO_LIMIT_REACHED" })
    } finally {
      if (tenantIds.length) {
        await db.catalogPhotoAsset.deleteMany({
          where: { tenantId: { in: tenantIds } },
        })
        await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
      }
      if (userIds.length)
        await db.user.deleteMany({ where: { id: { in: userIds } } })
      expect(await db.tenant.count({ where: { id: { in: tenantIds } } })).toBe(
        0,
      )
      expect(await db.user.count({ where: { id: { in: userIds } } })).toBe(0)
      expect(
        await db.catalogPhotoAsset.count({
          where: { tenantId: { in: tenantIds } },
        }),
      ).toBe(0)
    }
  })
})
