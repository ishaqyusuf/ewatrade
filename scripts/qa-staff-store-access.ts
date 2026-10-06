import { randomUUID } from "node:crypto"
import type { TRPCContext } from "../apps/api/src/trpc/init"
import { appRouter } from "../apps/api/src/trpc/routers/_app"
import { scopeStaffRequest } from "../apps/api/src/utils/staff-request-access"
import { withStaffWriteTransaction } from "../apps/api/src/utils/staff-write-transaction"
import { prisma } from "../packages/db/src/client"
import {
  createSimpleCatalogItem,
  listCatalogItems,
} from "../packages/db/src/queries/catalog"
import {
  setStaffStoreAccess,
  updateRetailOpsStaffStoreAccess,
} from "../packages/db/src/queries/staff-store-access"
import { getActiveTenantForUser } from "../packages/db/src/queries/tenants"
import type { PrismaClient } from "../packages/db/src/types"

if (!["local", "preview"].includes(process.env.APP_ENV ?? ""))
  throw new Error("Non-production profile required.")
const owner = await prisma.membership.findFirst({
  where: {
    role: "OWNER",
    status: "ACTIVE",
    user: { email: "jawdah.preview.20261005@ishaq.qa.test" },
    tenant: { isActive: true, dataClassification: "QA" },
  },
  select: {
    userId: true,
    tenantId: true,
    tenant: {
      select: {
        slug: true,
        stores: { where: { status: "ACTIVE" }, select: { id: true } },
      },
    },
  },
})
if (!owner || !owner.tenant.stores[0])
  throw new Error("Active Jawdah QA Store required.")
const storeId = owner.tenant.stores[0].id
if (process.env.QA_STAFF_ACCESS_CASE === "race") {
  const fixture = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: "Temporary access race fixture",
        email: `staff-race-${randomUUID()}@ishaq.qa.test`,
        metadata: { qaFixture: "staff_store_access_race" },
      },
    })
    const member = await tx.membership.create({
      data: {
        tenantId: owner.tenantId,
        userId: user.id,
        role: "OPERATOR",
        status: "ACTIVE",
        staffAccessMode: "SCOPED",
      },
    })
    await tx.staffStoreAssignment.create({
      data: {
        tenantId: owner.tenantId,
        membershipId: member.id,
        storeId,
        role: "OPERATOR",
        updatedByUserId: owner.userId,
      },
    })
    return { user, member }
  })
  try {
    const tenant = await getActiveTenantForUser(prisma, {
      userId: fixture.user.id,
      tenantSlug: owner.tenant.slug,
    })
    if (!tenant) throw new Error("Race fixture context missing.")
    const ctx = { db: prisma, tenantContext: tenant }
    let lockedReady: () => void = () => {}
    const ready = new Promise<void>((resolve) => {
      lockedReady = resolve
    })
    let releaseWrite: () => void = () => {}
    const release = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    const write = withStaffWriteTransaction(ctx, async (locked) => {
      await scopeStaffRequest(
        locked,
        "inventory.postBalanceOperation",
        "mutation",
        { storeId },
      )
      lockedReady()
      await release
    })
    const authority = {
      tenantId: owner.tenantId,
      actorUserId: owner.userId,
      membershipId: fixture.member.id,
      expectedRevision: 1,
      defaultStoreId: storeId,
      catalogEditor: false,
      assignments: [{ storeId, role: "CASHIER" as const }],
    }
    await Promise.race([
      ready,
      write.then(() => {
        throw new Error("Write did not acquire its lock.")
      }),
    ])
    let blocked = false
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '250ms'")
        await setStaffStoreAccess(tx, authority)
      })
    } catch (error) {
      blocked = String(error).includes("lock timeout")
    } finally {
      releaseWrite()
      await write
    }
    if (!blocked)
      throw new Error(
        "Authority update did not wait for the accepted write lock.",
      )
    await updateRetailOpsStaffStoreAccess(prisma, {
      ...authority,
      staffUserId: fixture.user.id,
    })
    let denied = false
    try {
      await withStaffWriteTransaction(ctx, (locked) =>
        scopeStaffRequest(
          locked,
          "inventory.postBalanceOperation",
          "mutation",
          { storeId },
        ),
      )
    } catch (error) {
      denied = (error as { code?: string }).code === "FORBIDDEN"
    }
    if (!denied) throw new Error("Post-revocation write was accepted.")
    console.log(
      JSON.stringify({
        checks: [
          "real concurrent authority update waited for an accepted write",
          "actual grant writer completed after the lock was released",
          "following stock write rejected after Cashier downgrade",
        ],
        fixture: "temporary uncredentialed QA identity removed",
      }),
    )
  } finally {
    await prisma.user.delete({ where: { id: fixture.user.id } })
    await prisma.$disconnect()
  }
  process.exit(0)
}
const rollback = new Error("QA fixture rollback")
const checks: string[] = []
try {
  await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.create({
        data: {
          name: "Temporary scoped access fixture",
          email: `staff-scope-${randomUUID()}@ishaq.qa.test`,
        },
      })
      const member = await tx.membership.create({
        data: {
          tenantId: owner.tenantId,
          userId: user.id,
          role: "OPERATOR",
          status: "ACTIVE",
          staffAccessMode: "SCOPED",
        },
      })
      await tx.staffStoreAssignment.create({
        data: {
          tenantId: owner.tenantId,
          membershipId: member.id,
          storeId,
          role: "OPERATOR",
          updatedByUserId: owner.userId,
        },
      })
      const tenant = await getActiveTenantForUser(tx, {
        userId: user.id,
        tenantSlug: owner.tenant.slug,
      })
      if (
        !tenant ||
        tenant.stores.length !== 1 ||
        tenant.activeStore?.id !== storeId
      )
        throw new Error("Store directory scope failed.")
      checks.push("fresh scoped Store directory")
      const client = new Proxy(tx, {
        get(target, key) {
          if (key === "$transaction")
            return async (callback: (nested: typeof tx) => Promise<unknown>) =>
              callback(tx)
          return Reflect.get(target, key)
        },
      }) as PrismaClient
      const ctx = { db: client, tenantContext: tenant }
      const caller = appRouter.createCaller({
        ...ctx,
        session: { user },
        requestHeaders: new Headers(),
        tenantSlug: owner.tenant.slug,
        activeStoreId: storeId,
        tenantId: owner.tenantId,
        qaSessionScope: null,
        isInternalRequest: false,
        requestId: "staff-scope-qa",
      } as unknown as TRPCContext)
      const qaCase = process.env.QA_STAFF_ACCESS_CASE ?? "policy"
      if (qaCase === "policy") {
        const directory = await caller.tenant.stores()
        if (directory.length !== 1 || directory[0]?.id !== storeId)
          throw new Error("tRPC Store directory failed.")
        for (const operation of [
          () => caller.catalog.createItem({} as never),
          () => caller.retailOps.inviteStaff({} as never),
          () =>
            caller.inventory.postBalanceOperation({
              storeId: "unassigned-store",
            } as never),
        ]) {
          let denied = false
          try {
            await operation()
          } catch (error) {
            denied = (error as { code?: string }).code === "FORBIDDEN"
          }
          if (!denied)
            throw new Error(
              "tRPC middleware failed to deny before the input parser.",
            )
        }
        checks.push(
          "actual tRPC middleware denies catalog, staff and foreign-Store mutations before input parsing",
        )
      }
      if (qaCase !== "policy") {
        const existingItems = await listCatalogItems(client, {
          tenantId: owner.tenantId,
          kind: "product",
          status: "active",
          storeIds: [storeId],
        })
        const existing = existingItems.find(
          (item) =>
            item.product?.currentUnitConfiguration?.units.some(
              (unit) => unit.factor === "1",
            ) &&
            item.product.stockBalances.some(
              (balance) =>
                balance.storeId === storeId &&
                (qaCase !== "orders" ||
                  Number(balance.onHandQuantity) -
                    Number(balance.reservedQuantity) >=
                    1),
            ) &&
            (qaCase !== "orders" ||
              item.variants.some((variant) =>
                variant.offerings.some(
                  (offering) =>
                    offering.fixedPriceMinor !== null &&
                    offering.status === "active" &&
                    offering.stores.some(
                      (availability) =>
                        availability.storeId === storeId &&
                        availability.isAvailable,
                    ),
                ),
              )),
        )
        const item =
          existing ??
          (await createSimpleCatalogItem(client, {
            actorUserId: owner.userId,
            clientOperationId: `qa-item-${randomUUID()}`,
            tenantId: owner.tenantId,
            storeId,
            name: "Temporary QA poultry eggs",
            kind: "product",
            canonicalUnitName: "egg",
            priceMinor: 100,
            openingStockQuantity: qaCase === "orders" ? "1" : undefined,
          }))
        const balance = item.product?.stockBalances[0]
        const configuration = item.product?.currentUnitConfiguration
        const offering = item.variants
          .flatMap((variant) => variant.offerings)
          .find(
            (offering) =>
              qaCase !== "orders" || offering.fixedPriceMinor !== null,
          )
        if (!balance || !configuration || !offering)
          throw new Error("Poultry fixture is incomplete.")
        if (qaCase === "stock") {
          await caller.inventory.postBalanceOperation({
            schemaVersion: 1,
            clientOperationId: `qa-stock-${randomUUID()}`,
            storeId,
            source: "staff_scope_qa",
            reason: "Temporary QA intake",
            type: "receipt",
            direction: "increase",
            enteredQuantity: "2",
            enteredInventoryUnitId: balance.inventoryUnitId,
            balanceSourceId: balance.id,
            expectedConfigurationVersionId: configuration.id,
            expectedBalanceRevision: balance.revision,
          })
          const afterStock = await tx.stockBalanceSource.findUniqueOrThrow({
            where: { id: balance.id },
          })
          if (
            Number(afterStock.onHandQuantity.toString()) !==
            Number(balance.onHandQuantity) + 2
          )
            throw new Error("Operator stock intake failed.")
          checks.push("actual Operator poultry stock intake succeeded")
        } else {
          await caller.orders.create({
            schemaVersion: 1,
            clientOrderId: `qa-order-${randomUUID()}`,
            storeId,
            lines: [
              {
                offeringId: offering.id,
                quantity: "1",
                expectedConfigurationVersionId: configuration.id,
                expectedFixedPriceMinor: offering.fixedPriceMinor ?? undefined,
              },
            ],
          })
          checks.push("actual Operator poultry order succeeded")
        }
      }
      if (qaCase === "policy") {
        await withStaffWriteTransaction(ctx, async (locked) => {
          await scopeStaffRequest(locked, "orders.create", "mutation", {
            storeId,
          })
          await scopeStaffRequest(
            locked,
            "inventory.postBalanceOperation",
            "mutation",
            { storeId },
          )
        })
        checks.push(
          "Operator order and stock authorization under real Membership lock",
        )
        for (const [path, input] of [
          ["catalog.createItem", { storeId }],
          ["retailOps.inviteStaff", { storeId }],
          ["orders.create", { storeId: "unassigned-store" }],
        ] as const) {
          let denied = false
          try {
            await scopeStaffRequest(ctx, path, "mutation", input)
          } catch (error) {
            denied = (error as { code?: string }).code === "FORBIDDEN"
          }
          if (!denied) throw new Error(`Expected denial: ${path}`)
        }
        checks.push("catalog, staff administration and unassigned Store denied")
        await tx.staffStoreAssignment.update({
          where: { membershipId_storeId: { membershipId: member.id, storeId } },
          data: { role: "CASHIER", revision: { increment: 1 } },
        })
        let downgraded = false
        try {
          await withStaffWriteTransaction(ctx, (locked) =>
            scopeStaffRequest(
              locked,
              "inventory.postBalanceOperation",
              "mutation",
              { storeId },
            ),
          )
        } catch (error) {
          downgraded = (error as { code?: string }).code === "FORBIDDEN"
        }
        if (!downgraded)
          throw new Error("Fresh role downgrade was not enforced.")
        checks.push("stale request rejected after role downgrade")
        await tx.membership.update({
          where: { id: member.id },
          data: { status: "SUSPENDED" },
        })
        let suspended = false
        try {
          await withStaffWriteTransaction(ctx, (locked) =>
            scopeStaffRequest(locked, "orders.create", "mutation", { storeId }),
          )
        } catch (error) {
          suspended = (error as { code?: string }).code === "FORBIDDEN"
        }
        if (!suspended) throw new Error("Suspension was not enforced.")
        checks.push("stale request rejected after suspension")
      }
      throw rollback
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
} catch (error) {
  if (error !== rollback) throw error
} finally {
  await prisma.$disconnect()
}
console.log(
  JSON.stringify({
    checks,
    fixture:
      "rolled back; no account, credential, invitation or stock data retained",
  }),
)
// Imported service SDKs retain timers; this standalone rollback runner is complete.
process.exit(0)
