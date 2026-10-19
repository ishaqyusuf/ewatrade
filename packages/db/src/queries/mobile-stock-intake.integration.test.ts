import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { inventorySingleBalanceOperationSchema } from "../../../../apps/api/src/schemas/inventory"
import {
  INITIAL_STOCK_DRAFT,
  stockCommand,
  stockDraftReadiness,
} from "../../../../apps/mobile/src/components/mobile/stock-intake/stock-intake-model"
import {
  parseStockIntakeTarget,
  resolveStockIntakeTarget,
} from "../../../../apps/mobile/src/lib/stock-intake-target"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "./acceptance/qa-access/database"
import { createSimpleCatalogItem } from "./catalog"
import { CatalogError } from "./catalog-errors"
import { createFinanceBook } from "./finance/accounts"
import { getFinanceAccountBalances } from "./finance/reads"
import { stockOperationCategoryGraph } from "./inventory-categories"
import { postSingleBalanceStockOperation } from "./inventory-operations"
import { listInventoryBalanceReport } from "./inventory-reporting"

// Actual scoped report→mobile target/helper→stockCommand→strict API schema→
// canonical stock transaction. ProtectedProcedure/assertCanManageInventory and
// Store authorization belong to the router and are NOT fabricated/tested here.
// The real persisted QA Owner supplies explicit actor/Tenant/Store scope.
// No native/HTTP response-loss, refresh-failure or all-stock-types claim.
const requestedRunId = process.env.QA_MOBILE_STOCK_INTAKE_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
)
  throw Error("QA_MOBILE_STOCK_INTAKE_RUN_ID must be a UUID")
const transactionOptions = { maxWait: 10000, timeout: 30000 }
const slugFor = (runId: string) => `mobile-stock-intake-${runId}`
const emailFor = (runId: string) =>
  `mobile-stock-intake-owner-${runId}@example.invalid`
type PlannedUser = { id: string; email: string }
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }
async function settledValues<T extends readonly unknown[]>(
  tasks: { [K in keyof T]: Promise<T[K]> },
): Promise<T> {
  const values = await Promise.allSettled(tasks)
  const errors = values.filter((value) => value.status === "rejected")
  if (errors.length === 1) throw errors[0]?.reason
  if (errors.length > 1)
    throw new AggregateError(
      errors.map((value) => value.reason),
      "Owned stock intake QA reads failed",
    )
  return values.map((value) => {
    if (value.status !== "fulfilled") throw Error("Unsettled stock intake read")
    return value.value
  }) as unknown as T
}

describeWithQaAccessDatabase(
  "mobile Stock-in canonical at-most-once command",
  () => {
    test("Product A intake applies once across concurrent duplicate and discarded-response retry while all typed refusals preserve A/B and monetary facts", async () => {
      assertQaAccessAcceptanceDatabase()
      const runId = requestedRunId ?? randomUUID()
      const started = Date.now()
      const progress = (stage: string) => {
        console.info(
          `[mobile-stock-intake QA ${runId}] ${stage} ${Date.now() - started}ms`,
        )
        if (Date.now() - started > 720000)
          throw Error("Stock intake scenario deadline")
      }
      progress("setup:start")
      const { prisma: db } = await import("../client")
      const plannedUsers: PlannedUser[] = []
      let tenantId: string | undefined
      const failures: unknown[] = []
      const jobs = new Set<Promise<unknown>>()
      function tracked<T>(promise: Promise<T>): Promise<Settled<T>> {
        const result = promise.then(
          (value): Settled<T> => ({ ok: true, value }),
          (error): Settled<T> => {
            failures.push(error)
            return { ok: false, error }
          },
        )
        jobs.add(result)
        void result.finally(() => jobs.delete(result))
        return result
      }
      function succeeded<T>(result: Settled<T>) {
        if (!result.ok) throw result.error
        return result.value
      }
      try {
        const identity = { id: randomUUID(), email: emailFor(runId) }
        plannedUsers.push(identity)
        const owner = await db.user.create({
          data: {
            ...identity,
            name: "Stock intake QA Owner",
            ageBand: "ADULT",
            ageDeclaredAt: new Date(),
          },
        })
        tenantId = randomUUID()
        const tenant = await db.tenant.create({
          data: {
            id: tenantId,
            name: "Mobile stock intake QA",
            slug: slugFor(runId),
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            metadata: {
              retailOps: {
                subscription: { planId: "growth", status: "active" },
              },
            },
            users: {
              create: { userId: owner.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Stock intake original Store",
            slug: "original",
            status: "ACTIVE",
          },
        })
        const otherStore = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Stock intake different Store",
            slug: "different",
            status: "ACTIVE",
          },
        })
        const actor = { actorUserId: owner.id, tenantId: tenant.id }
        expect(
          await db.membership.findFirstOrThrow({
            where: { tenantId: tenant.id, userId: owner.id },
            select: { role: true, status: true },
          }),
        ).toEqual({ role: "OWNER", status: "ACTIVE" })
        const product = async (label: string, openingStockQuantity: string) => {
          progress(`setup:Product-${label}`)
          const item = await createSimpleCatalogItem(db, {
            ...actor,
            storeId: store.id,
            kind: "product",
            name: `Stock intake Product ${label}`,
            canonicalUnitName: "piece",
            priceMinor: 500,
            openingStockQuantity,
            clientOperationId: `${runId}:product-${label}`,
          })
          const balance = item.product?.stockBalances[0]
          if (!balance || !item.product)
            throw Error("Product omitted actual stock source")
          return {
            itemId: item.id,
            productId: item.product.id,
            balanceId: balance.id,
          }
        }
        // Opening stock precedes Finance setup; it is not claimed as known-cost.
        const a = await product("A", "10")
        const b = await product("B", "20")
        progress("setup:Finance-Book")
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2026-01-01T00:00:00Z"),
        })
        const report = await listInventoryBalanceReport(db, {
          tenantId: tenant.id,
          storeId: store.id,
        })
        expect(report.rows).toHaveLength(2)
        const parsed = parseStockIntakeTarget({
          catalogItemId: a.itemId,
          storeId: store.id,
        })
        const selected = resolveStockIntakeTarget({
          parsed,
          rows: report.rows,
          storeId: store.id,
          enabled: true,
          loading: false,
        })
        expect(selected.status).toBe("selected")
        expect(selected.rows.map((row) => row.balanceSourceId)).toEqual([
          a.balanceId,
        ])
        const balance = selected.selected
        const balanceB = report.rows.find(
          (row) => row.balanceSourceId === b.balanceId,
        )
        if (!balance || !balanceB) throw Error("Missing exact A/B balance")
        expect(balance).toMatchObject({
          balanceSourceId: a.balanceId,
          productId: a.productId,
          catalogItemId: a.itemId,
          storeId: store.id,
          onHandQuantity: "10",
          reservedQuantity: "0",
          availableQuantity: "10",
          kind: "SHARED_POOL",
          custodyType: "STORE",
          inventoryUnitFactor: "1",
        })
        expect(balanceB.onHandQuantity).toBe("20")
        const draft = {
          ...INITIAL_STOCK_DRAFT,
          balanceId: balance.balanceSourceId,
          quantity: "3",
          categories: [{ name: "QA intake arrival" }],
        }
        const readiness = stockDraftReadiness(draft, balance, [])
        expect(readiness.error).toBeNull()
        expect(String(readiness.quantity)).toBe("3")
        const review = {
          balance,
          draft,
          quantity: "3",
          recipientName: "",
          businessId: tenant.id,
          userId: owner.id,
          storeId: store.id,
        }
        const built = stockCommand(review, `${runId}:mobile-stock-in`)
        if (built.kind !== "balance")
          throw Error("Receive did not build a balance operation")
        const input = inventorySingleBalanceOperationSchema.parse(
          JSON.parse(JSON.stringify(built.input)),
        )
        if (input.storeId !== store.id)
          throw Error("Strict command omitted original Store")
        expect(input).toMatchObject({
          clientOperationId: `${runId}:mobile-stock-in`,
          balanceSourceId: a.balanceId,
          enteredInventoryUnitId: balance.inventoryUnitId,
          enteredQuantity: "3",
          expectedBalanceRevision: balance.revision,
          expectedConfigurationVersionId: balance.configurationVersionId,
          direction: "increase",
          type: "receipt",
          source: "mobile_inventory",
          categories: [{ name: "QA intake arrival" }],
        })
        expect(
          inventorySingleBalanceOperationSchema.safeParse({
            ...built.input,
            tenantId: tenant.id,
            actorUserId: owner.id,
          }).success,
        ).toBe(false)
        // The router normally adds these server-owned identities after strict parsing.
        // Here the explicit real Owner scope is supplied directly to the shared command.
        const command = { ...input, ...actor, storeId: input.storeId }
        const captured = structuredClone(command)
        const catalogGraph = {
          variants: {
            orderBy: { id: "asc" as const },
            include: {
              offerings: {
                orderBy: { id: "asc" as const },
                include: {
                  productUnitOffering: true,
                  storeAvailability: { orderBy: { storeId: "asc" as const } },
                },
              },
            },
          },
          product: {
            include: {
              currentUnitConfiguration: {
                include: { units: { orderBy: { id: "asc" as const } } },
              },
              stockBalanceSources: {
                orderBy: { id: "asc" as const },
                include: {
                  inventoryUnit: true,
                  reservations: { orderBy: { id: "asc" as const } },
                  movements: {
                    orderBy: { id: "asc" as const },
                    include: {
                      operation: {
                        include: { categories: stockOperationCategoryGraph },
                      },
                      valuationEvent: true,
                    },
                  },
                  financeInventoryPools: { orderBy: { id: "asc" as const } },
                },
              },
            },
          },
        } satisfies Prisma.CatalogItemInclude
        const snapshot = async () => {
          const where = { tenantId: tenant.id }
          const [
            balances,
            operations,
            events,
            pools,
            unrelatedB,
            categories,
            journals,
            financeCommands,
            money,
            orders,
            payments,
            ledger,
            sequence,
          ] = await settledValues([
            db.stockBalanceSource.findMany({ where, orderBy: { id: "asc" } }),
            db.stockOperation.findMany({
              where,
              include: {
                movements: { orderBy: { id: "asc" } },
                categories: stockOperationCategoryGraph,
              },
              orderBy: { id: "asc" },
            }),
            db.financeInventoryValuationEvent.findMany({
              where,
              orderBy: { id: "asc" },
            }),
            db.financeInventoryPool.findMany({ where, orderBy: { id: "asc" } }),
            db.catalogItem.findUniqueOrThrow({
              where: { id: b.itemId, tenantId: tenant.id },
              include: catalogGraph,
            }),
            db.stockOperationCategoryName.findMany({
              where,
              orderBy: { id: "asc" },
            }),
            db.financeJournalEntry.findMany({
              where: { bookId: book.id },
              include: { lines: { orderBy: { id: "asc" } } },
              orderBy: { id: "asc" },
            }),
            db.financeCommand.findMany({
              where: { bookId: book.id },
              orderBy: { id: "asc" },
            }),
            getFinanceAccountBalances(db, { ...actor, bookId: book.id }),
            db.commercialOrder.count({ where }),
            db.commercialOrderPayment.count({ where }),
            db.customerLedgerEntry.count({ where }),
            db.tenant.findUniqueOrThrow({
              where: { id: tenant.id },
              select: { lastCommercialOrderSequence: true },
            }),
          ])
          return {
            balances,
            operations,
            events,
            pools,
            unrelatedB,
            categories,
            journals,
            financeCommands,
            orders,
            payments,
            ledger,
            financeSequence: money.snapshotSequence,
            orderSequence: sequence.lastCommercialOrderSequence,
            accountBalances: money.accounts
              .map(({ id, balanceMinor }) => ({ id, balanceMinor }))
              .sort((a, b) => a.id.localeCompare(b.id)),
          }
        }
        progress("baseline:A-and-B-before-intake")
        const before = await snapshot()
        expect(before.events).toEqual([])
        expect(before.pools).toEqual([])
        expect(before.balances).toHaveLength(2)
        const originalB = before.balances.find((row) => row.id === b.balanceId)
        if (!originalB) throw Error("Missing unrelated B snapshot")
        progress("intake:concurrent-same-identity-first-response-discarded")
        // Consume and deliberately discard only the first successful return value.
        // This models a retrying caller without pretending to drop HTTP/native IO.
        // Any real rejection from either command remains a test failure and drains.
        const first = tracked(
          postSingleBalanceStockOperation(db, command).then(() => undefined),
        )
        const second = tracked(postSingleBalanceStockOperation(db, command))
        const results = await Promise.all([first, second])
        succeeded(results[0])
        const recorded = succeeded(results[1])
        expect(recorded).toMatchObject({
          clientOperationId: captured.clientOperationId,
          type: "RECEIPT",
          storeId: store.id,
          source: "mobile_inventory",
        })
        expect(recorded.movements).toHaveLength(1)
        expect(recorded.movements[0]).toMatchObject({
          balanceSourceId: a.balanceId,
          configurationVersionId: balance.configurationVersionId,
          enteredInventoryUnitId: balance.inventoryUnitId,
          enteredQuantity: "3",
          previousOnHandQuantity: "10",
          resultingOnHandQuantity: "13",
          signedCanonicalEffect: "3",
          unitFactorSnapshot: "1",
        })
        const after = await snapshot()
        expect(after.operations).toHaveLength(before.operations.length + 1)
        const operation = after.operations.find(
          (row) => row.clientOperationId === captured.clientOperationId,
        )
        if (!operation) throw Error("Missing durable stock intake")
        expect(operation).toMatchObject({
          id: recorded.id,
          actorUserId: owner.id,
          tenantId: tenant.id,
          storeId: store.id,
          type: "RECEIPT",
          source: "mobile_inventory",
        })
        expect(operation.movements).toHaveLength(1)
        expect(operation.categories).toHaveLength(1)
        expect(operation.categories[0]?.categoryName.name).toBe(
          "QA intake arrival",
        )
        expect(
          after.operations.filter((row) => row.id !== operation.id),
        ).toEqual(before.operations)
        expect(
          after.balances.find((row) => row.id === a.balanceId),
        ).toMatchObject({ revision: balance.revision + 1 })
        expect(
          after.balances
            .find((row) => row.id === a.balanceId)
            ?.onHandQuantity.toFixed(),
        ).toBe("13")
        expect(
          after.balances
            .find((row) => row.id === a.balanceId)
            ?.reservedQuantity.toFixed(),
        ).toBe("0")
        expect(after.balances.find((row) => row.id === b.balanceId)).toEqual(
          originalB,
        )
        expect(after.unrelatedB).toEqual(before.unrelatedB)
        expect(after.events).toHaveLength(1)
        expect(after.pools).toHaveLength(1)
        const valuation = after.events[0]
        const pool = after.pools[0]
        if (!valuation || !pool)
          throw Error("Missing Book-backed ordinary valuation")
        // Generic mobile stock-in has no trusted purchase-cost authority. Its
        // actual Book-backed valuation is explicitly unknown, never fabricated cash/COGS.
        expect(valuation).toMatchObject({
          bookId: book.id,
          balanceSourceId: a.balanceId,
          stockOperationId: recorded.id,
          stockMovementId: recorded.movements[0]?.id,
          sourceId: recorded.id,
          actorUserId: owner.id,
          kind: "ADJUSTMENT",
          sourceKind: "ORDINARY_STOCK_OPERATION",
          unknownReason: "UNCAPTURED_MOVEMENTS",
          sourceCostMinor: null,
          valueBeforeMinor: null,
          valueDeltaMinor: null,
          valueAfterMinor: null,
          sequence: 1n,
        })
        expect([
          valuation.quantityBefore.toFixed(),
          valuation.quantityAfter.toFixed(),
          valuation.canonicalEffect.toFixed(),
        ]).toEqual(["10", "13", "3"])
        expect(pool).toMatchObject({
          bookId: book.id,
          balanceSourceId: a.balanceId,
          valueMinor: null,
          unknownReason: "UNCAPTURED_MOVEMENTS",
          lastStockRevision: balance.revision + 1,
          lastSequence: 1n,
        })
        expect(pool.quantity.toFixed()).toBe("13")
        expect(pool.lastMovementCount).toBe(
          BigInt(
            before.operations
              .flatMap((row) => row.movements)
              .filter((row) => row.balanceSourceId === a.balanceId).length + 1,
          ),
        )
        expect(after.journals).toEqual(before.journals)
        expect(after.financeCommands).toEqual(before.financeCommands)
        expect(after.accountBalances).toEqual(before.accountBalances)
        expect([
          after.financeSequence,
          after.orderSequence,
          after.orders,
          after.payments,
          after.ledger,
        ]).toEqual([before.financeSequence, before.orderSequence, 0, 0, 0])
        expect(command).toEqual(captured)
        progress("intake:serial-retry-after-discarded-response")
        expect(await postSingleBalanceStockOperation(db, command)).toEqual(
          recorded,
        )
        expect(await snapshot()).toEqual(after)
        progress("denials:changed-same-identity-and-stale-fresh-identity")
        await expect(
          postSingleBalanceStockOperation(db, {
            ...command,
            enteredQuantity: "4",
          }),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
        expect(await snapshot()).toEqual(after)
        await expect(
          postSingleBalanceStockOperation(db, {
            ...command,
            clientOperationId: `${runId}:stale-fresh-identity`,
          }),
        ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
        expect(await snapshot()).toEqual(after)
        progress("denials:different-Store-unavailable-source-and-foreign-unit")
        for (const scenario of [
          {
            input: {
              ...command,
              clientOperationId: `${runId}:different-Store-source`,
              storeId: otherStore.id,
              expectedBalanceRevision: balance.revision + 1,
            },
            message: "Balance Source not found for this business and Store.",
          },
          {
            input: {
              ...command,
              clientOperationId: `${runId}:unavailable-source`,
              balanceSourceId: randomUUID(),
              expectedBalanceRevision: 0,
            },
            message: "Balance Source not found for this business and Store.",
          },
          {
            input: {
              ...command,
              clientOperationId: `${runId}:foreign-Product-unit`,
              enteredInventoryUnitId: balanceB.inventoryUnitId,
              expectedBalanceRevision: balance.revision + 1,
            },
            message: "Entered Inventory Unit does not belong to this Product.",
          },
        ]) {
          const {
            actorUserId: _actor,
            tenantId: _tenant,
            ...publicInput
          } = scenario.input
          const admitted = inventorySingleBalanceOperationSchema.parse(
            JSON.parse(JSON.stringify(publicInput)),
          )
          if (!admitted.storeId) throw Error("Negative case lost its Store")
          const refused = postSingleBalanceStockOperation(db, {
            ...admitted,
            ...actor,
            storeId: admitted.storeId,
          })
          await expect(refused).rejects.toBeInstanceOf(CatalogError)
          await expect(refused).rejects.toMatchObject({
            code: "INVALID_STOCK_OPERATION",
            message: scenario.message,
          })
          expect(await snapshot()).toEqual(after)
        }
        expect(command).toEqual(captured)
        expect(stockCommand(review, captured.clientOperationId)).toEqual(built)
        progress("scenario:complete")
      } catch (error) {
        failures.push(error)
        console.error(
          `[mobile-stock-intake QA ${runId}] scenario failure before cleanup`,
          error,
        )
      } finally {
        await Promise.allSettled([...jobs])
        try {
          await dispose(db, runId, tenantId, plannedUsers)
        } catch (error) {
          failures.push(error)
        }
        try {
          await db.$disconnect()
        } catch (error) {
          failures.push(error)
        }
      }
      const distinct = [...new Set(failures)]
      if (distinct.length === 1) throw distinct[0]
      if (distinct.length > 1)
        throw new AggregateError(
          distinct,
          `Stock intake QA ${runId}: scenario/disposal failures (original first)`,
        )
    }, 900000)
  },
)

async function dispose(
  db: PrismaClient,
  runId: string,
  tenantId: string | undefined,
  plannedUsers: PlannedUser[],
) {
  if (plannedUsers.length === 0 && tenantId === undefined) {
    console.info(
      `[mobile-stock-intake QA ${runId}] cleanup skipped: no fixture writes attempted`,
    )
    return false
  }
  assertQaAccessAcceptanceDatabase()
  const userIds = plannedUsers.map((user) => user.id)
  const expectedEmails = new Map(
    plannedUsers.map((user) => [user.id, user.email]),
  )
  const [users, tenant] = await settledValues([
    db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    }),
    tenantId
      ? db.tenant.findUnique({
          where: { id: tenantId },
          select: { slug: true, dataClassification: true },
        })
      : Promise.resolve(null),
  ])
  if (users.some((user) => expectedEmails.get(user.id) !== user.email))
    throw Error(`Stock intake QA ${runId}: cleanup User proof failed`)
  if (
    tenant &&
    (tenant.slug !== `mobile-stock-intake-${runId}` ||
      tenant.dataClassification !== "QA")
  )
    throw Error(`Stock intake QA ${runId}: cleanup Tenant proof failed`)
  // Missing planned rows are valid partial setup, not missing disposal authority.
  // Only an actually observed exact QA Tenant enters these twelve groups.
  if (tenant && tenantId) {
    const ownedTenantId = tenantId
    const where = { tenantId }
    const group = async (
      label: string,
      work: (tx: Prisma.TransactionClient) => Promise<void>,
    ) => {
      assertQaAccessAcceptanceDatabase()
      console.info(`[mobile-stock-intake QA ${runId}] cleanup:${label}`)
      try {
        await db.$transaction(async (tx) => {
          // Re-prove exact QA identity and hold its row in EVERY disposal
          // transaction; a prior successful group grants no later authority.
          const owned = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Tenant" WHERE "id"=${ownedTenantId}
              AND "slug"=${`mobile-stock-intake-${runId}`} AND "dataClassification"='QA'
            FOR UPDATE
          `
          if (owned.length !== 1)
            throw Error(`Stock intake QA ${runId}: cleanup Tenant proof failed`)
          await work(tx)
        }, transactionOptions)
      } catch (error) {
        throw new Error(
          `Stock intake QA ${runId}: cleanup group ${label} failed`,
          { cause: error },
        )
      }
    }
    await group("offline-and-activity", async (tx) => {
      await tx.offlineCommand.deleteMany({ where })
      await tx.businessActivityEvent.deleteMany({ where })
    })
    await group("fulfillment-and-reservations", async (tx) => {
      await tx.commercialServiceFulfillment.deleteMany({ where })
      await tx.productFulfillment.deleteMany({
        where: { orderLine: { order: where } },
      })
      await tx.stockReservation.deleteMany({ where })
    })
    await group("payments-and-allocations", async (tx) => {
      await tx.commercialOrderPayment.deleteMany({ where })
      await tx.customerLedgerAllocationRelease.deleteMany({
        where: { allocation: { credit: where } },
      })
      await tx.customerLedgerAllocation.deleteMany({ where: { credit: where } })
    })
    await group("customer-receipts-and-entries", async (tx) => {
      await tx.customerLedgerReceipt.deleteMany({ where: { entry: where } })
      await tx.customerLedgerCommand.deleteMany({ where })
      await tx.customerLedgerEntry.deleteMany({ where })
    })
    await group("customer-accounts-and-orders", async (tx) => {
      await tx.customerLedgerAccount.deleteMany({ where })
      await tx.commercialOrder.deleteMany({ where })
    })
    await group("inventory-valuations", async (tx) => {
      // Remove the actual owned ordinary intake valuation before removing stock
      // provenance. No cross-Tenant rows are touched.
      await tx.financeInventoryValuationEvent.deleteMany({ where })
      await tx.financeInventoryPool.deleteMany({ where })
    })
    await group("catalog-receipts-and-stock-movements", async (tx) => {
      await tx.catalogCommandReceipt.deleteMany({ where })
      await tx.stockMovement.deleteMany({ where: { operation: where } })
    })
    await group("stock-operations-and-balances", async (tx) => {
      await tx.stockOperation.deleteMany({ where })
      await tx.stockBalanceSource.deleteMany({ where })
    })
    await group("finance-commands-and-lines", async (tx) => {
      await tx.financeCommand.deleteMany({ where: { book: where } })
      await tx.financeJournalLine.deleteMany({
        where: { entry: { book: where } },
      })
    })
    await group("finance-journals-and-accounts", async (tx) => {
      await tx.financeJournalEntry.deleteMany({ where: { book: where } })
      await tx.financeAccount.deleteMany({ where: { book: where } })
    })
    await group("finance-Book-and-Catalog", async (tx) => {
      await tx.financeBook.deleteMany({ where })
      await tx.catalogPriceChange.deleteMany({ where })
      await tx.catalogItem.deleteMany({ where })
    })
    await group("Tenant", async (tx) => {
      await tx.tenant.delete({ where: { id: tenantId } })
    })
  }
  await db.$transaction(async (tx) => {
    // Re-read under row locks; validate each exact ID/email pair rather than
    // assuming every attempted insert committed (or accepting swapped emails).
    const owned = await tx.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT "id", "email" FROM "User" WHERE "id"=ANY(${userIds}::text[])
        FOR UPDATE
    `
    if (owned.some((user) => expectedEmails.get(user.id) !== user.email))
      throw Error(`Stock intake QA ${runId}: cleanup User proof failed`)
    if (
      (await tx.membership.count({ where: { userId: { in: userIds } } })) !== 0
    )
      throw Error(
        `Stock intake QA ${runId}: foreign membership prevents User disposal`,
      )
    if (owned.length > 0)
      await tx.user.deleteMany({
        where: { OR: owned.map(({ id, email }) => ({ id, email })) },
      })
  }, transactionOptions)
  const residual = await settledValues([
    db.user.count({ where: { id: { in: userIds } } }),
    ...(tenantId
      ? [
          db.tenant.count({ where: { id: tenantId } }),
          db.offlineCommand.count({ where: { tenantId } }),
          db.commercialOrder.count({ where: { tenantId } }),
          db.commercialOrderPayment.count({ where: { tenantId } }),
          db.financeBook.count({ where: { tenantId } }),
          db.catalogItem.count({ where: { tenantId } }),
          db.offlineDevice.count({ where: { tenantId } }),
          db.store.count({ where: { tenantId } }),
          db.stockOperation.count({ where: { tenantId } }),
          db.stockBalanceSource.count({ where: { tenantId } }),
          db.stockReservation.count({ where: { tenantId } }),
          db.customerLedgerEntry.count({ where: { tenantId } }),
          db.catalogPriceChange.count({ where: { tenantId } }),
          db.financeInventoryValuationEvent.count({ where: { tenantId } }),
          db.financeInventoryPool.count({ where: { tenantId } }),
          db.stockMovement.count({ where: { operation: { tenantId } } }),
          db.stockOperationCategoryName.count({ where: { tenantId } }),
        ]
      : []),
  ])
  if (residual.some((count) => count !== 0))
    throw Error(`Stock intake QA ${runId}: cleanup left owned rows`)
  console.info(`[mobile-stock-intake QA ${runId}] cleanup zero owned rows`)
  return true
}
