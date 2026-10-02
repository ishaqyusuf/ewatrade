import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import { lockInventoryFinancialStores } from "./inventory-finance-locks"

setDefaultTimeout(120_000)

const transactionOptions = { maxWait: 10_000, timeout: 30_000 }

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function assertCleanup(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

describeWithServiceCommerceDatabase(
  "inventory financial Store locking acceptance",
  () => {
    test("serializes reversed multi-Store requests and enforces tenant scope", async () => {
      const { prisma: db } = await import("../client")
      const suffix = randomUUID()
      const tenantId = randomUUID()
      const foreignTenantId = randomUUID()
      const noBookTenantId = randomUUID()
      const userId = randomUUID()
      const storeIds = {
        ngnA: randomUUID(),
        ngnB: randomUUID(),
        zar: randomUUID(),
      }
      const foreignStoreId = randomUUID()
      const noBookStoreId = randomUUID()
      const bookIds = { ngn: randomUUID(), zar: randomUUID() }
      const tenantIds = [tenantId, foreignTenantId, noBookTenantId]
      const allStoreIds = [
        ...Object.values(storeIds),
        foreignStoreId,
        noBookStoreId,
      ]
      const allBookIds = Object.values(bookIds)
      const startedAt = new Date("2026-01-01T00:00:00.000Z")

      try {
        await db.user.create({
          data: {
            id: userId,
            email: `inventory-finance-lock-${suffix}@example.invalid`,
            name: "Inventory finance lock acceptance",
          },
        })
        await db.tenant.createMany({
          data: tenantIds.map((id, index) => ({
            id,
            slug: `inventory-finance-lock-${suffix}-${index}`,
            name: "Inventory finance lock acceptance",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
          })),
        })
        await db.membership.create({
          data: { tenantId, userId, role: "OWNER", status: "ACTIVE" },
        })
        await db.store.createMany({
          data: [
            {
              id: storeIds.ngnA,
              tenantId,
              slug: `ngn-a-${suffix}`,
              name: "NGN A",
              currencyCode: "NGN",
              status: "ACTIVE",
            },
            {
              id: storeIds.ngnB,
              tenantId,
              slug: `ngn-b-${suffix}`,
              name: "NGN B",
              currencyCode: "NGN",
              status: "ACTIVE",
            },
            {
              id: storeIds.zar,
              tenantId,
              slug: `zar-${suffix}`,
              name: "ZAR",
              currencyCode: "ZAR",
              status: "ACTIVE",
            },
            {
              id: foreignStoreId,
              tenantId: foreignTenantId,
              slug: `foreign-${suffix}`,
              name: "Foreign",
              currencyCode: "NGN",
              status: "ACTIVE",
            },
            {
              id: noBookStoreId,
              tenantId: noBookTenantId,
              slug: `no-book-${suffix}`,
              name: "No book",
              currencyCode: "NGN",
              status: "ACTIVE",
            },
          ],
        })
        await db.financeBook.createMany({
          data: [
            {
              id: bookIds.ngn,
              tenantId,
              currencyCode: "NGN",
              timezone: "Africa/Lagos",
              startsAt: startedAt,
              createdById: userId,
            },
            {
              id: bookIds.zar,
              tenantId,
              currencyCode: "ZAR",
              timezone: "Africa/Lagos",
              startsAt: startedAt,
              createdById: userId,
            },
          ],
        })

        const holderReady = deferred()
        const releaseHolder = deferred()
        const holder = db.$transaction(async (tx) => {
          const contexts = await lockInventoryFinancialStores(tx, {
            tenantId,
            storeIds: [storeIds.ngnA, storeIds.zar],
          })
          holderReady.resolve()
          await releaseHolder.promise
          return contexts
        }, transactionOptions)

        let contender:
          | Promise<Awaited<ReturnType<typeof lockInventoryFinancialStores>>>
          | undefined
        try {
          await Promise.race([holderReady.promise, holder])
          const contenderStarted = deferred<number>()
          contender = db.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<Array<{ pid: number }>>`
              SELECT pg_backend_pid() AS pid
            `
            const pid = rows[0]?.pid
            if (!pid) throw new Error("Missing contender transaction identity")
            contenderStarted.resolve(pid)
            return lockInventoryFinancialStores(tx, {
              tenantId,
              storeIds: [storeIds.zar, storeIds.ngnA],
            })
          }, transactionOptions)
          const pid = await Promise.race([
            contenderStarted.promise,
            contender.then(() => {
              throw new Error("Contender finished before transaction identity")
            }),
          ])
          let waiting = false
          for (let attempt = 0; attempt < 8; attempt += 1) {
            const rows = await db.$queryRaw<Array<{ waiting: boolean }>>`
              SELECT EXISTS (
                SELECT 1 FROM pg_locks WHERE pid = ${pid} AND NOT granted
              ) AS waiting
            `
            if (rows[0]?.waiting) {
              waiting = true
              break
            }
          }
          expect(waiting).toBe(true)
        } finally {
          releaseHolder.resolve()
          await Promise.allSettled([holder, ...(contender ? [contender] : [])])
        }
        if (!contender) throw new Error("Contender did not start")
        const [heldContexts, reversedContexts] = await Promise.all([
          holder,
          contender,
        ])
        expect(heldContexts.map((context) => context?.bookId)).toEqual([
          bookIds.ngn,
          bookIds.zar,
        ])
        expect(reversedContexts.map((context) => context?.bookId)).toEqual([
          bookIds.ngn,
          bookIds.zar,
        ])

        const duplicateCurrencyContexts = await db.$transaction(
          (tx) =>
            lockInventoryFinancialStores(tx, {
              tenantId,
              storeIds: [storeIds.ngnB, storeIds.ngnA],
            }),
          transactionOptions,
        )
        expect(duplicateCurrencyContexts).toHaveLength(1)
        expect(duplicateCurrencyContexts[0]?.bookId).toBe(bookIds.ngn)

        const beforeDeniedRequests = await effectSnapshot(db, tenantIds)
        await expect(
          db.$transaction(
            (tx) =>
              lockInventoryFinancialStores(tx, {
                tenantId,
                storeIds: [storeIds.ngnA, randomUUID()],
              }),
            transactionOptions,
          ),
        ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" })
        await expect(
          db.$transaction(
            (tx) =>
              lockInventoryFinancialStores(tx, {
                tenantId,
                storeIds: [storeIds.ngnA, foreignStoreId],
              }),
            transactionOptions,
          ),
        ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" })
        expect(await effectSnapshot(db, tenantIds)).toEqual(
          beforeDeniedRequests,
        )

        const noBookContexts = await db.$transaction(
          (tx) =>
            lockInventoryFinancialStores(tx, {
              tenantId: noBookTenantId,
              storeIds: [noBookStoreId],
            }),
          transactionOptions,
        )
        expect(noBookContexts).toEqual([null])
      } finally {
        await db.financeBook.deleteMany({ where: { id: { in: allBookIds } } })
        await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
        await db.user.deleteMany({ where: { id: userId } })

        const [
          remainingTenants,
          remainingStores,
          remainingBooks,
          remainingUsers,
        ] = await Promise.all([
          db.tenant.count({ where: { id: { in: tenantIds } } }),
          db.store.count({ where: { id: { in: allStoreIds } } }),
          db.financeBook.count({ where: { id: { in: allBookIds } } }),
          db.user.count({ where: { id: userId } }),
        ])
        assertCleanup(remainingTenants === 0, "QA tenants remain after cleanup")
        assertCleanup(remainingStores === 0, "QA stores remain after cleanup")
        assertCleanup(
          remainingBooks === 0,
          "QA finance books remain after cleanup",
        )
        assertCleanup(remainingUsers === 0, "QA user remains after cleanup")
      }
    })
  },
)

async function effectSnapshot(db: PrismaClient, tenantIds: string[]) {
  const [books, journals, operations, movements] = await Promise.all([
    db.financeBook.count({ where: { tenantId: { in: tenantIds } } }),
    db.financeJournalEntry.count({
      where: { book: { tenantId: { in: tenantIds } } },
    }),
    db.stockOperation.count({ where: { tenantId: { in: tenantIds } } }),
    db.stockMovement.count({
      where: { operation: { tenantId: { in: tenantIds } } },
    }),
  ])
  return { books, journals, operations, movements }
}
