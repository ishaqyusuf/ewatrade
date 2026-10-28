import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { replaceCatalogItemPhotos } from "./catalog-photo-replacement"

setDefaultTimeout(90_000)
const check =
  process.env.RUN_JAWDAH_STOREFRONT_ACCEPTANCE === "1" ? test : test.skip

check(
  "existing Jawdah image selection refuses a stale cover snapshot and preserves its saved identity",
  async () => {
    const { prisma: db } = await import("../client")
    try {
      const tenant = await db.tenant.findFirst({
        where: {
          id: "cmuv4c0450001z49kd8k5o0s1",
          slug: "jawdah-poultry-qa-62bf6899-qa",
          dataClassification: "QA",
          isActive: true,
        },
        select: {
          users: {
            where: { role: "OWNER", status: "ACTIVE" },
            select: { userId: true },
            take: 1,
          },
        },
      })
      if (!tenant?.users[0]) throw Error("Expected existing Jawdah QA owner")
      const scope = {
        tenantId: "cmuv4c0450001z49kd8k5o0s1",
        actorUserId: tenant.users[0].userId,
        storeId: "cmuv4c0mm0005z49kdycddipr",
        catalogItemId: "cmuvpgsfc0000z19kraila9rq",
      }
      const read = async () => ({
        photos: await db.catalogPhotoAsset.findMany({
          where: {
            tenantId: scope.tenantId,
            storeId: scope.storeId,
            catalogItemId: scope.catalogItemId,
            state: { in: ["PENDING_REVIEW", "APPROVED"] },
          },
          select: { id: true },
          orderBy: { sortOrder: "asc" },
        }),
        illustration: await db.catalogItemIllustration.findUnique({
          where: {
            tenantId_catalogItemId_storeId: {
              tenantId: scope.tenantId,
              catalogItemId: scope.catalogItemId,
              storeId: scope.storeId,
            },
          },
          select: { illustrationId: true },
        }),
      })
      const before = await read()
      await expect(
        replaceCatalogItemPhotos(db, {
          ...scope,
          assetIds: before.photos.map((p) => p.id),
          illustrationId: before.illustration?.illustrationId ?? null,
          expectedAssetIds: before.photos.map((p) => p.id),
          expectedIllustrationId: "a-stale-review-value",
          clientOperationId: `jawdah-photo-stale:${randomUUID()}`,
        }),
      ).rejects.toThrow("changed elsewhere")
      expect(await read()).toEqual(before)
    } finally {
      await db.$disconnect()
    }
  },
)
