import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "@ewatrade/catalog/photo-contracts"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import {
  addCatalogPhotoToGallery,
  getCatalogPhotoReuseSource,
  listCatalogPhotoGallery,
  updateCatalogGalleryDetails,
} from "./catalog-photo-gallery"
import {
  listCatalogPhotoCleanupCandidates,
  recordCatalogPhotoVerdict,
  removeCatalogPhoto,
} from "./catalog-photo-lifecycle"
import { replaceCatalogItemPhotos } from "./catalog-photo-replacement"
import {
  type CatalogPhotoActorScope,
  createCatalogPhotoIntent,
  getCatalogPhotoReadTarget,
  recordVerifiedCatalogPhotoUpload,
} from "./catalog-photos"

setDefaultTimeout(240_000)
describeWithServiceCommerceDatabase("Catalog My images gallery", () => {
  test("lists approved attached photos by bytes, scoped to managed Stores", async () => {
    const { prisma: db } = await import("../client")
    const actor = await db.user.create({
      data: {
        name: "My images fixture",
        email: `catalog-gallery-${randomUUID()}@example.invalid`,
      },
    })
    const outsider = await db.user.create({
      data: {
        name: "My images outsider",
        email: `catalog-gallery-out-${randomUUID()}@example.invalid`,
      },
    })
    let tenantId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `catalog-gallery-${randomUUID()}`,
          name: "My images fixture",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "LIVE",
          users: {
            create: { userId: actor.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      })
      tenantId = tenant.id
      const [lekki, ikeja] = await Promise.all(
        ["lekki", "ikeja"].map((slug) =>
          db.store.create({
            data: { tenantId: tenant.id, slug, name: slug, status: "ACTIVE" },
          }),
        ),
      )
      if (!lekki || !ikeja) throw new Error("Missing Store fixtures")
      const at = (storeId: string): CatalogPhotoActorScope => ({
        tenantId: tenant.id,
        storeId,
        actorUserId: actor.id,
      })
      const item = (name: string) =>
        db.catalogItem.create({
          data: {
            tenantId: tenant.id,
            slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 6)}`,
            name,
            kind: "PRODUCT",
            status: "ACTIVE",
          },
        })
      const crate = await item("Fresh eggs crate")
      const wholesale = await item("Eggs wholesale")
      const feed = await item("Layer feed")
      const half = await item("Eggs half crate")

      async function photo(
        scope: CatalogPhotoActorScope,
        key: string,
        digest: string,
        verdict?: "APPROVED",
      ) {
        const intent = await createCatalogPhotoIntent(db, {
          ...scope,
          clientOperationId: `gallery-${key}`,
          contentDigest: digest,
          contentType: "image/png",
          sizeBytes: 8,
        })
        const stored: CatalogStoredPhoto = {
          assetId: intent.assetId,
          tenantId: tenant.id,
          storeId: scope.storeId,
          contentDigest: digest,
          contentType: "image/png",
          sizeBytes: 8,
          storageProvider: "vercel_blob_private",
          storagePath: "",
        }
        stored.storagePath = catalogPhotoStoragePath(stored)
        await recordVerifiedCatalogPhotoUpload(db, scope, stored)
        if (verdict)
          await recordCatalogPhotoVerdict(db, {
            ...scope,
            assetId: intent.assetId,
            sourceDigest: digest,
            displayDigest: "f".repeat(64),
            provider: "gallery-fixture",
            policyVersion: "v1",
            verdict,
          })
        return intent.assetId
      }
      async function attach(
        scope: CatalogPhotoActorScope,
        catalogItemId: string,
        assetIds: string[],
      ) {
        await replaceCatalogItemPhotos(db, {
          ...scope,
          catalogItemId,
          assetIds,
          clientOperationId: `gallery-attach-${randomUUID()}`,
        })
      }

      const eggs = "a".repeat(64)
      const lekkiEggs = await photo(
        at(lekki.id),
        "lekki-eggs",
        eggs,
        "APPROVED",
      )
      await attach(at(lekki.id), crate.id, [lekkiEggs])
      // The same bytes, copied onto another Item in another Store.
      const ikejaEggs = await photo(
        at(ikeja.id),
        "ikeja-eggs",
        eggs,
        "APPROVED",
      )
      await attach(at(ikeja.id), wholesale.id, [ikejaEggs])
      const pendingFeed = await photo(
        at(lekki.id),
        "pending-feed",
        "b".repeat(64),
      )
      await attach(at(lekki.id), feed.id, [pendingFeed])
      const draft = await photo(
        at(lekki.id),
        "unattached",
        "c".repeat(64),
        "APPROVED",
      )

      const lekkiOnly = await listCatalogPhotoGallery(db, {
        ...at(lekki.id),
        storeIds: [lekki.id],
        target: { storeId: lekki.id, catalogItemId: half.id },
      })
      expect(lekkiOnly.entries).toHaveLength(1)
      expect(lekkiOnly.entries[0]).toMatchObject({
        assetId: lekkiEggs,
        storeId: lekki.id,
        storeIds: [lekki.id],
        onTargetItem: false,
      })

      const everyStore = await listCatalogPhotoGallery(db, {
        ...at(lekki.id),
        storeIds: [lekki.id, ikeja.id],
        target: { storeId: lekki.id, catalogItemId: crate.id },
      })
      expect(everyStore.entries).toHaveLength(1)
      const [shared] = everyStore.entries
      expect(shared?.onTargetItem).toBe(true)
      expect(shared?.storeIds.toSorted()).toEqual(
        [lekki.id, ikeja.id].toSorted(),
      )
      expect(shared?.items.map((entry) => entry.name).toSorted()).toEqual([
        "Eggs wholesale",
        "Fresh eggs crate",
      ])
      // Pending and unattached photos never appear.
      expect(
        everyStore.entries.some((entry) =>
          [pendingFeed, draft].includes(entry.assetId),
        ),
      ).toBe(false)

      // A copy still waiting for its image check already counts as on the item.
      const halfCopy = await photo(at(lekki.id), "half-copy", eggs)
      await attach(at(lekki.id), half.id, [halfCopy])
      expect(
        (
          await listCatalogPhotoGallery(db, {
            ...at(lekki.id),
            storeIds: [lekki.id],
            target: { storeId: lekki.id, catalogItemId: half.id },
          })
        ).entries[0]?.onTargetItem,
      ).toBe(true)

      const search = await listCatalogPhotoGallery(db, {
        ...at(lekki.id),
        storeIds: [lekki.id, ikeja.id],
        query: "WHOLESALE",
      })
      expect(search.entries).toHaveLength(1)
      expect(
        (
          await listCatalogPhotoGallery(db, {
            ...at(lekki.id),
            storeIds: [lekki.id, ikeja.id],
            query: "feed",
          })
        ).entries,
      ).toHaveLength(0)

      await expect(
        listCatalogPhotoGallery(db, {
          actorUserId: outsider.id,
          tenantId: tenant.id,
          storeIds: [lekki.id],
        }),
      ).rejects.toThrow("unavailable")

      // Removing a photo from its Item takes it out of My images.
      await attach(at(ikeja.id), wholesale.id, [])
      expect(
        (
          await listCatalogPhotoGallery(db, {
            ...at(lekki.id),
            storeIds: [ikeja.id],
          })
        ).entries,
      ).toHaveLength(0)

      const source = await getCatalogPhotoReuseSource(db, {
        ...at(lekki.id),
        assetId: lekkiEggs,
      })
      expect(source.photo.contentDigest).toBe(eggs)
      // The verdict a byte-identical copy may carry over.
      expect(source.review).toEqual({
        displayDigest: "f".repeat(64),
        policyVersion: "v1",
      })
      await expect(
        getCatalogPhotoReuseSource(db, {
          ...at(lekki.id),
          assetId: pendingFeed,
        }),
      ).rejects.toThrow("no longer available")
      await expect(
        getCatalogPhotoReuseSource(db, { ...at(lekki.id), assetId: draft }),
      ).rejects.toThrow("no longer available")
      await expect(
        getCatalogPhotoReuseSource(db, {
          ...at(ikeja.id),
          assetId: lekkiEggs,
        }),
      ).rejects.toThrow()
    } finally {
      if (tenantId) {
        await db.catalogCommandReceipt.deleteMany({ where: { tenantId } })
        await db.catalogPhotoAsset.deleteMany({ where: { tenantId } })
        await db.catalogItem.deleteMany({ where: { tenantId } })
        await db.store.deleteMany({ where: { tenantId } })
        await db.membership.deleteMany({ where: { tenantId } })
        await db.tenant.deleteMany({ where: { id: tenantId } })
      }
      await db.user.deleteMany({
        where: { id: { in: [actor.id, outsider.id] } },
      })
    }
  })

  test("keeps gallery-only uploads with title, category, search and pages", async () => {
    const { prisma: db } = await import("../client")
    const [owner, manager] = await Promise.all(
      ["owner", "manager"].map((name) =>
        db.user.create({
          data: {
            name: `My images ${name}`,
            email: `catalog-gallery-${name}-${randomUUID()}@example.invalid`,
          },
        }),
      ),
    )
    if (!owner || !manager) throw new Error("Missing user fixtures")
    let tenantId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `catalog-gallery-only-${randomUUID()}`,
          name: "My images uploads fixture",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "LIVE",
          users: {
            create: [
              { userId: owner.id, role: "OWNER", status: "ACTIVE" },
              { userId: manager.id, role: "MANAGER", status: "ACTIVE" },
            ],
          },
        },
      })
      tenantId = tenant.id
      const store = await db.store.create({
        data: {
          tenantId: tenant.id,
          slug: "lekki",
          name: "Lekki",
          status: "ACTIVE",
        },
      })
      const as = (actorUserId: string): CatalogPhotoActorScope => ({
        tenantId: tenant.id,
        storeId: store.id,
        actorUserId,
      })
      const list = (actorUserId: string, extra = {}) =>
        listCatalogPhotoGallery(db, {
          ...as(actorUserId),
          storeIds: [store.id],
          ...extra,
        })
      async function upload(key: string, digest: string) {
        const intent = await createCatalogPhotoIntent(db, {
          ...as(owner.id),
          clientOperationId: `gallery-only-${key}`,
          contentDigest: digest,
          contentType: "image/png",
          sizeBytes: 8,
        })
        const stored: CatalogStoredPhoto = {
          assetId: intent.assetId,
          tenantId: tenant.id,
          storeId: store.id,
          contentDigest: digest,
          contentType: "image/png",
          sizeBytes: 8,
          storageProvider: "vercel_blob_private",
          storagePath: "",
        }
        stored.storagePath = catalogPhotoStoragePath(stored)
        return { assetId: intent.assetId, stored }
      }
      const approve = (
        assetId: string,
        digest: string,
        verdict: "APPROVED" | "REJECTED" = "APPROVED",
      ) =>
        recordCatalogPhotoVerdict(db, {
          ...as(owner.id),
          assetId,
          sourceDigest: digest,
          displayDigest: "e".repeat(64),
          provider: "gallery-fixture",
          policyVersion: "v1",
          verdict,
        })

      // An upload that has not passed the byte check cannot be kept.
      const tray = await upload("tray", "1".repeat(64))
      await expect(
        addCatalogPhotoToGallery(db, {
          ...as(owner.id),
          assetId: tray.assetId,
        }),
      ).rejects.toThrow("Finish the photo upload")
      await recordVerifiedCatalogPhotoUpload(db, as(owner.id), tray.stored)
      // Only the uploader can keep their own upload.
      await expect(
        addCatalogPhotoToGallery(db, {
          ...as(manager.id),
          assetId: tray.assetId,
        }),
      ).rejects.toThrow("Photo not found")
      const kept = await addCatalogPhotoToGallery(db, {
        ...as(owner.id),
        assetId: tray.assetId,
        title: "  Egg   tray ",
        category: "Packaging",
      })
      expect(kept).toMatchObject({
        state: "PENDING_REVIEW",
        title: "Egg tray",
        category: "Packaging",
      })
      // Replaying keeps the first time and leaves omitted details alone.
      const replay = await addCatalogPhotoToGallery(db, {
        ...as(owner.id),
        assetId: tray.assetId,
      })
      expect(replay.galleryAddedAt).toEqual(kept.galleryAddedAt)
      expect(replay.title).toBeNull()
      // Kept uploads leave draft expiry, so cleanup never picks them.
      const keptRow = await db.catalogPhotoAsset.findUniqueOrThrow({
        where: { id: tray.assetId },
      })
      expect(keptRow.expiresAt.getUTCFullYear()).toBe(9999)
      expect(
        (await listCatalogPhotoCleanupCandidates(db)).some(
          (row) => row.id === tray.assetId,
        ),
      ).toBe(false)

      // While in review only the uploader sees it.
      expect((await list(owner.id)).entries).toMatchObject([
        {
          assetId: tray.assetId,
          state: "PENDING_REVIEW",
          items: [],
          title: "Egg tray",
          category: "Packaging",
          galleryAsset: { assetId: tray.assetId, storeId: store.id },
        },
      ])
      expect((await list(manager.id)).entries).toHaveLength(0)
      await expect(
        getCatalogPhotoReadTarget(db, {
          ...as(manager.id),
          assetId: tray.assetId,
        }),
      ).rejects.toThrow("Photo not found")
      await expect(
        getCatalogPhotoReuseSource(db, {
          ...as(owner.id),
          assetId: tray.assetId,
        }),
      ).rejects.toThrow("no longer available")

      // Once approved, every manager of the Store sees and can reuse it.
      await approve(tray.assetId, "1".repeat(64))
      const shared = await list(manager.id)
      expect(shared.entries).toMatchObject([
        { assetId: tray.assetId, state: "APPROVED", title: "Egg tray" },
      ])
      expect(shared.categories).toEqual([{ name: "Packaging", count: 1 }])
      await getCatalogPhotoReadTarget(db, {
        ...as(manager.id),
        assetId: tray.assetId,
      })
      expect(
        (
          await getCatalogPhotoReuseSource(db, {
            ...as(manager.id),
            assetId: tray.assetId,
          })
        ).photo.contentDigest,
      ).toBe("1".repeat(64))

      // A kept upload is copied onto Items, never moved onto one.
      const item = await db.catalogItem.create({
        data: {
          tenantId: tenant.id,
          slug: `layer-feed-${randomUUID().slice(0, 6)}`,
          name: "Layer feed bag",
          kind: "PRODUCT",
          status: "ACTIVE",
        },
      })
      await expect(
        replaceCatalogItemPhotos(db, {
          ...as(owner.id),
          catalogItemId: item.id,
          assetIds: [tray.assetId],
          clientOperationId: `gallery-move-${randomUUID()}`,
        }),
      ).rejects.toThrow("unavailable")

      // Details are shared by the bytes and editable by any manager.
      const feed = await upload("feed", "2".repeat(64))
      await recordVerifiedCatalogPhotoUpload(db, as(owner.id), feed.stored)
      await approve(feed.assetId, "2".repeat(64))
      await replaceCatalogItemPhotos(db, {
        ...as(owner.id),
        catalogItemId: item.id,
        assetIds: [feed.assetId],
        clientOperationId: `gallery-attach-${randomUUID()}`,
      })
      await updateCatalogGalleryDetails(db, {
        ...as(manager.id),
        assetId: feed.assetId,
        category: "packaging",
      })
      await expect(
        updateCatalogGalleryDetails(db, {
          ...as(manager.id),
          assetId: feed.assetId,
          title: "x".repeat(81),
        }),
      ).rejects.toThrow("at most 80")
      // Search covers titles, categories and Item names; % is literal.
      expect((await list(manager.id, { query: "TRAY" })).entries).toHaveLength(
        1,
      )
      expect(
        (await list(manager.id, { query: "layer" })).entries,
      ).toMatchObject([
        { assetId: feed.assetId, title: null, category: "packaging" },
      ])
      expect(
        (await list(manager.id, { query: "packag" })).entries,
      ).toHaveLength(2)
      expect((await list(manager.id, { query: "%" })).entries).toHaveLength(0)
      expect(
        (await list(manager.id, { category: "PACKAGING" })).entries,
      ).toHaveLength(2)

      // Pages are newest first and never repeat an image.
      const first = await list(manager.id, { limit: 1 })
      expect(first.entries.map((entry) => entry.assetId)).toEqual([
        feed.assetId,
      ])
      expect(first.nextCursor).not.toBeNull()
      const second = await list(manager.id, {
        limit: 1,
        cursor: first.nextCursor ?? undefined,
      })
      expect(second.entries.map((entry) => entry.assetId)).toEqual([
        tray.assetId,
      ])
      expect(second.nextCursor).toBeNull()
      expect(second.categories).toEqual([])
      await expect(list(manager.id, { cursor: "bm9wZQ" })).rejects.toThrow(
        "Invalid My images page",
      )

      // A rejected upload shows to its uploader for a day, then expires.
      const blurry = await upload("blurry", "3".repeat(64))
      await recordVerifiedCatalogPhotoUpload(db, as(owner.id), blurry.stored)
      await addCatalogPhotoToGallery(db, {
        ...as(owner.id),
        assetId: blurry.assetId,
      })
      await approve(blurry.assetId, "3".repeat(64), "REJECTED")
      expect(
        (await list(owner.id)).entries.find(
          (entry) => entry.assetId === blurry.assetId,
        )?.state,
      ).toBe("REJECTED")
      expect(
        (
          await db.catalogPhotoAsset.findUniqueOrThrow({
            where: { id: blurry.assetId },
          })
        ).expiresAt.getUTCFullYear(),
      ).toBeLessThan(9999)

      // Any manager can remove an approved gallery-only image.
      await removeCatalogPhoto(db, { ...as(manager.id), assetId: tray.assetId })
      const removed = await db.catalogPhotoAsset.findUniqueOrThrow({
        where: { id: tray.assetId },
      })
      expect(removed).toMatchObject({ state: "REMOVED", galleryAddedAt: null })
      expect(removed.expiresAt.getUTCFullYear()).toBeLessThan(9999)
      expect(
        (await list(manager.id)).entries.map((entry) => entry.assetId),
      ).toEqual([feed.assetId])
    } finally {
      if (tenantId) {
        await db.catalogCommandReceipt.deleteMany({ where: { tenantId } })
        await db.catalogGalleryImage.deleteMany({ where: { tenantId } })
        await db.catalogPhotoAsset.deleteMany({ where: { tenantId } })
        await db.catalogItem.deleteMany({ where: { tenantId } })
        await db.store.deleteMany({ where: { tenantId } })
        await db.membership.deleteMany({ where: { tenantId } })
        await db.tenant.deleteMany({ where: { id: tenantId } })
      }
      await db.user.deleteMany({
        where: { id: { in: [owner.id, manager.id] } },
      })
    }
  })
})
