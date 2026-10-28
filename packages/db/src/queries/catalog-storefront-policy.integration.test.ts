import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  readCatalogStorefrontPolicy,
  setCatalogStorefrontPolicy,
} from "./catalog-storefront-policy"

setDefaultTimeout(120_000)
const check =
  process.env.RUN_JAWDAH_STOREFRONT_ACCEPTANCE === "1" ? test : test.skip

check(
  "existing Jawdah QA policy has CAS, stable retries, scope refusal and no stock/order effects",
  async () => {
    const { prisma: db } = await import("../client")
    const tenant = await db.tenant.findFirst({
      where: {
        id: "cmuv4c0450001z49kd8k5o0s1",
        slug: "jawdah-poultry-qa-62bf6899-qa",
        dataClassification: "QA",
        isActive: true,
      },
      select: {
        id: true,
        users: {
          where: { role: "OWNER", status: "ACTIVE" },
          select: { userId: true },
          take: 1,
        },
      },
    })
    if (!tenant?.users[0])
      throw Error("Expected existing non-production Jawdah QA owner")
    const scope = {
      tenantId: tenant.id,
      actorUserId: tenant.users[0].userId,
      storeId: "cmuv4c0mm0005z49kdycddipr",
      catalogItemId: "cmuvpgsfc0000z19kraila9rq",
    }
    const before = await readCatalogStorefrontPolicy(db, scope)
    const businessFacts = async () => ({
      orders: await db.commercialOrder.count({
        where: { tenantId: scope.tenantId, storeId: scope.storeId },
      }),
      stock: await db.stockBalanceSource.findMany({
        where: { tenantId: scope.tenantId, storeId: scope.storeId },
        select: { id: true, onHandQuantity: true, reservedQuantity: true },
        orderBy: { id: "asc" },
      }),
    })
    const facts = JSON.stringify(await businessFacts())
    let lastRevision = before.revision
    let testError: unknown
    try {
      const first = {
        ...scope,
        unavailable: !before.unavailable,
        allowBookAhead: !before.allowBookAhead,
        expectedRevision: before.revision,
        clientOperationId: `jawdah-policy:${randomUUID()}`,
      }
      const competing = {
        ...first,
        clientOperationId: `jawdah-policy:${randomUUID()}`,
      }
      const results = await Promise.allSettled([
        setCatalogStorefrontPolicy(db, first),
        setCatalogStorefrontPolicy(db, competing),
      ])
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1)
      lastRevision = before.revision + 1
      const accepted = results[0]?.status === "fulfilled" ? first : competing
      expect(await setCatalogStorefrontPolicy(db, accepted)).toMatchObject({
        replayed: true,
        revision: lastRevision,
      })
      await expect(
        setCatalogStorefrontPolicy(db, {
          ...accepted,
          unavailable: !accepted.unavailable,
        }),
      ).rejects.toThrow("identity")
      await expect(
        readCatalogStorefrontPolicy(db, {
          ...scope,
          storeId: "not-an-authorized-store",
        }),
      ).rejects.toThrow()
      expect(JSON.stringify(await businessFacts())).toBe(facts)
    } catch (error) {
      testError = error
    }
    let cleanupError: unknown
    try {
      const current = await readCatalogStorefrontPolicy(db, scope)
      if (current.revision !== lastRevision)
        throw Error("Policy changed outside this check; preserve it for review")
      await setCatalogStorefrontPolicy(db, {
        ...scope,
        ...before,
        expectedRevision: current.revision,
        clientOperationId: `jawdah-policy:restore:${randomUUID()}`,
      })
      const restored = await readCatalogStorefrontPolicy(db, scope)
      expect(restored.unavailable).toBe(before.unavailable)
      expect(restored.allowBookAhead).toBe(before.allowBookAhead)
    } catch (error) {
      cleanupError = error
    } finally {
      await db.$disconnect()
    }
    if (testError && cleanupError)
      throw new AggregateError(
        [testError, cleanupError],
        "Policy acceptance and restoration failed",
      )
    if (testError) throw testError
    if (cleanupError) throw cleanupError
  },
)
