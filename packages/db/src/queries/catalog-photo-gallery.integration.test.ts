import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "@ewatrade/catalog/photo-contracts"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import {
  getCatalogPhotoReuseSource,
  listCatalogPhotoGallery,
} from "./catalog-photo-gallery"
import { recordCatalogPhotoVerdict } from "./catalog-photo-lifecycle"
import { replaceCatalogItemPhotos } from "./catalog-photo-replacement"
import {
  type CatalogPhotoActorScope,
  createCatalogPhotoIntent,
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
})
