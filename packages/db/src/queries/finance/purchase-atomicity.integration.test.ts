import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { PrismaClient } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  type SingleBalanceInput,
  postSingleBalanceStockOperation,
  postSingleBalanceStockOperationInTransaction,
} from "../inventory-operations"
import { lockFinanceBook } from "./access"
import { createFinanceBook } from "./accounts"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"

const PROOF_KIND = "PURCHASE_ATOMICITY_PROOF"
const PROOF_DATE = new Date("2026-09-15T12:00:00.000Z")

setDefaultTimeout(180_000)

type FixtureTenant = {
  id: string
  slug: string
  storeId: string
  balanceSourceId: string
  inventoryUnitId: string
  configurationVersionId: string
}

type PurchaseInput = {
  stock: SingleBalanceInput
  financeCommandId: string
  amountMinor: string
  unavailableAccountId?: string
}

function assertFixtureCleanup(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function stockSnapshot(
  db: PrismaClient,
  input: { balanceSourceId: string; tenantId: string },
) {
  const [balance, operations, movements, categories, categoryNames] =
    await Promise.all([
      db.stockBalanceSource.findUniqueOrThrow({
        where: { id: input.balanceSourceId },
      }),
      db.stockOperation.count({ where: { tenantId: input.tenantId } }),
      db.stockMovement.count({
        where: { operation: { tenantId: input.tenantId } },
      }),
      db.stockOperationCategory.count({ where: { tenantId: input.tenantId } }),
      db.stockOperationCategoryName.count({
        where: { tenantId: input.tenantId },
      }),
    ])
  return {
    onHandQuantity: balance.onHandQuantity.toString(),
    revision: balance.revision,
    operations,
    movements,
    categories,
    categoryNames,
  }
}

async function financeSnapshot(db: PrismaClient, input: { bookId: string }) {
  const [book, commands, journals, lines] = await Promise.all([
    db.financeBook.findUniqueOrThrow({ where: { id: input.bookId } }),
    db.financeCommand.count({ where: { bookId: input.bookId } }),
    db.financeJournalEntry.count({ where: { bookId: input.bookId } }),
    db.financeJournalLine.count({ where: { bookId: input.bookId } }),
  ])
  return {
    lastSequence: book.lastSequence.toString(),
    commands,
    journals,
    lines,
  }
}

describeWithServiceCommerceDatabase(
  "atomic purchase stock and finance composition",
  () => {
    test("both sides commit or roll back together, with exact replay and scope behavior", async () => {
      const { prisma: db } = await import("../../client")
      const suffix = randomUUID()
      const email = `purchase-atomicity-${suffix}@example.invalid`
      const tenantSlugs: string[] = []
      const tenantIds: string[] = []
      let actorUserId: string | undefined
      let bookId: string | undefined
      const catalogItemIds: string[] = []
      const storeIds: string[] = []

      try {
        const user = await db.user.create({
          data: { email, name: "Purchase atomicity acceptance" },
        })
        actorUserId = user.id

        async function createTenant(label: string): Promise<FixtureTenant> {
          const slug = `purchase-atomicity-${suffix}-${label}`
          const tenant = await db.tenant.create({
            data: {
              slug,
              name: "Purchase atomicity acceptance",
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              dataClassification: "QA",
              users: {
                create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
              },
            },
          })
          tenantSlugs.push(slug)
          tenantIds.push(tenant.id)

          const store = await db.store.create({
            data: {
              tenantId: tenant.id,
              slug: `proof-${label}`,
              name: "Private purchase proof",
            },
          })
          storeIds.push(store.id)

          const item = await db.catalogItem.create({
            data: {
              tenantId: tenant.id,
              slug: `private-proof-${suffix}-${label}`,
              kind: "PRODUCT",
              name: "Private unit-factor proof",
              product: { create: {} },
              variants: {
                create: {
                  key: "default",
                  name: "Default",
                  isDefault: true,
                },
              },
            },
            include: { product: true, variants: true },
          })
          catalogItemIds.push(item.id)
          const product = item.product
          const variant = item.variants[0]
          if (!product || !variant)
            throw new Error("Incomplete private product fixture")

          const configuration = await db.unitConfigurationVersion.create({
            data: {
              productId: product.id,
              version: 1,
              status: "CURRENT",
              canonicalBalanceScale: 18,
              units: {
                create: [
                  {
                    key: "unit",
                    name: "unit",
                    factor: "1",
                    stockBehavior: "CANONICAL_SHARED",
                    transactionScale: 0,
                  },
                  {
                    key: "case",
                    name: "case",
                    factor: "12",
                    stockBehavior: "ALTERNATE_TRANSACTION",
                    transactionScale: 2,
                  },
                ],
              },
            },
            include: { units: true },
          })
          const balanceUnit = configuration.units.find(
            ({ key }) => key === "unit",
          )
          const enteredUnit = configuration.units.find(
            ({ key }) => key === "case",
          )
          if (!balanceUnit || !enteredUnit)
            throw new Error("Missing proof inventory units")
          await db.catalogProduct.update({
            where: { id: product.id },
            data: { currentUnitConfigurationVersionId: configuration.id },
          })
          const balance = await db.stockBalanceSource.create({
            data: {
              tenantId: tenant.id,
              storeId: store.id,
              productId: product.id,
              variantId: variant.id,
              inventoryUnitId: balanceUnit.id,
              kind: "SHARED_POOL",
              onHandQuantity: "0",
            },
          })
          return {
            id: tenant.id,
            slug,
            storeId: store.id,
            balanceSourceId: balance.id,
            inventoryUnitId: enteredUnit.id,
            configurationVersionId: configuration.id,
          }
        }

        const local = await createTenant("local")
        const foreign = await createTenant("foreign")
        const actor = { tenantId: local.id, actorUserId: user.id }
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
        })
        bookId = book.id
        const accounts = await db.financeAccount.findMany({
          where: { bookId: book.id },
        })
        const inventory = accounts.find(({ code }) => code === "1300")
        const payable = accounts.find(({ code }) => code === "2000")
        if (!inventory || !payable)
          throw new Error("Missing proof finance accounts")
        const inventoryId = inventory.id
        const payableId = payable.id

        const stockInput = (
          fixture: FixtureTenant,
          clientOperationId: string,
        ): SingleBalanceInput => ({
          actorUserId: user.id,
          balanceSourceId: fixture.balanceSourceId,
          clientOperationId,
          direction: "increase",
          enteredInventoryUnitId: fixture.inventoryUnitId,
          enteredQuantity: "1.25",
          expectedBalanceRevision: 0,
          expectedConfigurationVersionId: fixture.configurationVersionId,
          effectiveAt: PROOF_DATE,
          categories: [{ name: `Purchase ${clientOperationId}` }],
          schemaVersion: 1,
          source: "purchase_atomicity_proof",
          storeId: fixture.storeId,
          tenantId: fixture.id,
          type: "receipt",
        })

        async function composePurchase(input: PurchaseInput) {
          return db.$transaction(
            async (tx) => {
              // Callers that compose financial and stock writes must lock the
              // financial book before either domain can acquire its own locks.
              await lockFinanceBook(tx, { ...actor, bookId: book.id })
              const postingCommandId = financePostingCommandId(
                input.financeCommandId,
                "purchase-proof-journal",
              )
              return financeDocumentCommand(
                tx,
                {
                  ...actor,
                  bookId: book.id,
                  clientCommandId: input.financeCommandId,
                },
                PROOF_KIND,
                {
                  stock: input.stock,
                  amountMinor: input.amountMinor,
                  unavailableAccountId: input.unavailableAccountId ?? null,
                },
                async () => {
                  const operation =
                    await postSingleBalanceStockOperationInTransaction(
                      tx,
                      input.stock,
                    )
                  await postFinanceJournalInTransaction(tx, {
                    ...actor,
                    bookId: book.id,
                    clientCommandId: postingCommandId,
                    sourceKind: PROOF_KIND,
                    sourceId: input.financeCommandId,
                    description: "Atomic inventory purchase proof",
                    effectiveAt: PROOF_DATE,
                    storeId: local.storeId,
                    lines: [
                      {
                        accountId: input.unavailableAccountId ?? inventoryId,
                        side: "DEBIT",
                        amountMinor: input.amountMinor,
                      },
                      {
                        accountId: payableId,
                        side: "CREDIT",
                        amountMinor: input.amountMinor,
                      },
                    ],
                  })
                  return { id: operation.id }
                },
              )
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        }

        async function financeThenStockFailure(input: PurchaseInput) {
          return db.$transaction(
            async (tx) => {
              await lockFinanceBook(tx, { ...actor, bookId: book.id })
              const postingCommandId = financePostingCommandId(
                input.financeCommandId,
                "purchase-proof-journal",
              )
              await financeDocumentCommand(
                tx,
                {
                  ...actor,
                  bookId: book.id,
                  clientCommandId: input.financeCommandId,
                },
                PROOF_KIND,
                {
                  stock: input.stock,
                  amountMinor: input.amountMinor,
                },
                async () => {
                  await postFinanceJournalInTransaction(tx, {
                    ...actor,
                    bookId: book.id,
                    clientCommandId: postingCommandId,
                    sourceKind: PROOF_KIND,
                    sourceId: input.financeCommandId,
                    description: "Atomic inventory purchase proof",
                    effectiveAt: PROOF_DATE,
                    storeId: local.storeId,
                    lines: [
                      {
                        accountId: inventoryId,
                        side: "DEBIT",
                        amountMinor: input.amountMinor,
                      },
                      {
                        accountId: payableId,
                        side: "CREDIT",
                        amountMinor: input.amountMinor,
                      },
                    ],
                  })
                  await postSingleBalanceStockOperationInTransaction(
                    tx,
                    input.stock,
                  )
                  return { id: "stock-operation-pending" }
                },
              )
              throw new Error("Expected the stock operation to be rejected")
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        }

        const localBaseline = await stockSnapshot(db, {
          balanceSourceId: local.balanceSourceId,
          tenantId: local.id,
        })
        const financeBaseline = await financeSnapshot(db, { bookId: book.id })

        const badFinance = {
          stock: stockInput(local, `receipt-${suffix}`),
          financeCommandId: `unavailable-account-${suffix}`,
          amountMinor: "1000",
          unavailableAccountId: inventoryId,
        }
        await db.financeAccount.update({
          where: { id: inventoryId },
          data: { archivedAt: new Date() },
        })
        await expect(composePurchase(badFinance)).rejects.toMatchObject({
          code: "NOT_FOUND",
        })
        expect(
          await stockSnapshot(db, {
            balanceSourceId: local.balanceSourceId,
            tenantId: local.id,
          }),
        ).toEqual(localBaseline)
        expect(await financeSnapshot(db, { bookId: book.id })).toEqual(
          financeBaseline,
        )

        // Repair the unavailable account, then retry the exact same outer
        // command and receipt identity. The failed transaction must not have
        // consumed either idempotency key.
        await db.financeAccount.update({
          where: { id: inventoryId },
          data: { archivedAt: null },
        })
        const firstResult = await composePurchase(badFinance)
        expect(firstResult.id).toBeTruthy()
        const firstOperation = await db.stockOperation.findUniqueOrThrow({
          include: { movements: true, categories: true },
          where: { id: firstResult.id },
        })
        expect(firstOperation.movements).toHaveLength(1)
        expect(firstOperation.categories).toHaveLength(1)
        expect(firstOperation.movements[0]?.enteredQuantity.toString()).toBe(
          "1.25",
        )
        expect(firstOperation.movements[0]?.unitFactorSnapshot.toString()).toBe(
          "12",
        )
        expect(
          firstOperation.movements[0]?.signedCanonicalEffect.toString(),
        ).toBe("15")
        expect(
          firstOperation.movements[0]?.resultingOnHandQuantity.toString(),
        ).toBe("15")
        const stockAfterPurchase =
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: local.balanceSourceId },
          })
        expect(stockAfterPurchase.onHandQuantity.toString()).toBe("15")
        expect(stockAfterPurchase.revision).toBe(1)

        const journal = await db.financeJournalEntry.findUniqueOrThrow({
          where: {
            bookId_sourceKind_sourceId: {
              bookId: book.id,
              sourceKind: PROOF_KIND,
              sourceId: badFinance.financeCommandId,
            },
          },
          include: { lines: { include: { account: true } } },
        })
        expect(journal.lines).toHaveLength(2)
        expect(
          journal.lines
            .map((line) => ({
              code: line.account.code,
              debit: line.debitMinor.toString(),
              credit: line.creditMinor.toString(),
            }))
            .sort((left, right) => left.code.localeCompare(right.code)),
        ).toEqual([
          { code: "1300", debit: "1000", credit: "0" },
          { code: "2000", debit: "0", credit: "1000" },
        ])
        const savedCommand = await db.financeCommand.findUniqueOrThrow({
          where: {
            bookId_clientCommandId: {
              bookId: book.id,
              clientCommandId: badFinance.financeCommandId,
            },
          },
        })
        expect(savedCommand.kind).toBe(PROOF_KIND)
        expect(savedCommand.result).toEqual({ id: firstOperation.id })

        const committedStock = await stockSnapshot(db, {
          balanceSourceId: local.balanceSourceId,
          tenantId: local.id,
        })
        const committedFinance = await financeSnapshot(db, { bookId: book.id })
        expect(committedStock).toEqual({
          onHandQuantity: "15",
          revision: 1,
          operations: 1,
          movements: 1,
          categories: 1,
          categoryNames: 1,
        })
        expect(committedFinance).toEqual({
          lastSequence: "1",
          commands: 2,
          journals: 1,
          lines: 2,
        })

        const staleStock = {
          stock: {
            ...stockInput(local, `stale-revision-${suffix}`),
          },
          financeCommandId: `stale-revision-${suffix}`,
          amountMinor: "1000",
        }
        await expect(financeThenStockFailure(staleStock)).rejects.toMatchObject(
          { code: "REVISION_CONFLICT" },
        )
        expect(
          await stockSnapshot(db, {
            balanceSourceId: local.balanceSourceId,
            tenantId: local.id,
          }),
        ).toEqual(committedStock)
        expect(await financeSnapshot(db, { bookId: book.id })).toEqual(
          committedFinance,
        )

        const foreignScope = {
          stock: {
            ...stockInput(local, `cross-tenant-${suffix}`),
            balanceSourceId: foreign.balanceSourceId,
            enteredInventoryUnitId: foreign.inventoryUnitId,
            expectedConfigurationVersionId: foreign.configurationVersionId,
          },
          financeCommandId: `cross-tenant-${suffix}`,
          amountMinor: "1000",
        }
        await expect(
          financeThenStockFailure(foreignScope),
        ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
        expect(
          await stockSnapshot(db, {
            balanceSourceId: local.balanceSourceId,
            tenantId: local.id,
          }),
        ).toEqual(committedStock)
        expect(
          await stockSnapshot(db, {
            balanceSourceId: foreign.balanceSourceId,
            tenantId: foreign.id,
          }),
        ).toEqual({
          onHandQuantity: "0",
          revision: 0,
          operations: 0,
          movements: 0,
          categories: 0,
          categoryNames: 0,
        })
        expect(await financeSnapshot(db, { bookId: book.id })).toEqual(
          committedFinance,
        )

        const successful = badFinance
        const simultaneousReplay = await Promise.all([
          composePurchase(successful),
          composePurchase(successful),
        ])
        expect(simultaneousReplay).toEqual([firstResult, firstResult])
        const publicReplay = await postSingleBalanceStockOperation(
          db,
          successful.stock,
        )
        const helperReplay = await db.$transaction(
          (tx) =>
            postSingleBalanceStockOperationInTransaction(tx, successful.stock),
          { maxWait: 10_000, timeout: 30_000 },
        )
        expect(publicReplay).toEqual(helperReplay)
        expect(publicReplay.id).toBe(firstOperation.id)
        expect(
          await stockSnapshot(db, {
            balanceSourceId: local.balanceSourceId,
            tenantId: local.id,
          }),
        ).toEqual(committedStock)
        expect(await financeSnapshot(db, { bookId: book.id })).toEqual(
          committedFinance,
        )

        await expect(
          composePurchase({ ...successful, amountMinor: "1001" }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(
          await stockSnapshot(db, {
            balanceSourceId: local.balanceSourceId,
            tenantId: local.id,
          }),
        ).toEqual(committedStock)
        expect(await financeSnapshot(db, { bookId: book.id })).toEqual(
          committedFinance,
        )
      } finally {
        await db.$transaction(
          async (tx) => {
            if (tenantIds.length) {
              await tx.stockMovement.deleteMany({
                where: { operation: { tenantId: { in: tenantIds } } },
              })
              await tx.stockOperationCategory.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
              await tx.stockOperation.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
              await tx.stockBalanceSource.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
              await tx.stockOperationCategoryName.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
            }
            if (catalogItemIds.length) {
              await tx.catalogItem.deleteMany({
                where: { id: { in: catalogItemIds } },
              })
            }
            if (bookId) {
              await tx.financeJournalLine.deleteMany({
                where: { bookId },
              })
              await tx.financeJournalEntry.deleteMany({ where: { bookId } })
              await tx.financeCommand.deleteMany({ where: { bookId } })
              await tx.financeAccount.deleteMany({ where: { bookId } })
              await tx.financeBook.deleteMany({ where: { id: bookId } })
            }
            if (storeIds.length) {
              await tx.store.deleteMany({ where: { id: { in: storeIds } } })
            }
            if (tenantIds.length) {
              await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
            }
            if (actorUserId) {
              await tx.user.deleteMany({ where: { id: actorUserId } })
            }
          },
          { maxWait: 10_000, timeout: 30_000 },
        )

        const [
          remainingTenants,
          remainingUsers,
          remainingBooks,
          remainingItems,
          remainingStores,
          remainingBalances,
          remainingOperations,
          remainingMovements,
          remainingCategoryNames,
          remainingFinanceCommands,
          remainingJournals,
        ] = await Promise.all([
          db.tenant.count({ where: { slug: { in: tenantSlugs } } }),
          actorUserId
            ? db.user.count({ where: { id: actorUserId } })
            : Promise.resolve(0),
          bookId
            ? db.financeBook.count({ where: { id: bookId } })
            : Promise.resolve(0),
          catalogItemIds.length
            ? db.catalogItem.count({ where: { id: { in: catalogItemIds } } })
            : Promise.resolve(0),
          storeIds.length
            ? db.store.count({ where: { id: { in: storeIds } } })
            : Promise.resolve(0),
          tenantIds.length
            ? db.stockBalanceSource.count({
                where: { tenantId: { in: tenantIds } },
              })
            : Promise.resolve(0),
          tenantIds.length
            ? db.stockOperation.count({
                where: { tenantId: { in: tenantIds } },
              })
            : Promise.resolve(0),
          tenantIds.length
            ? db.stockMovement.count({
                where: { operation: { tenantId: { in: tenantIds } } },
              })
            : Promise.resolve(0),
          tenantIds.length
            ? db.stockOperationCategoryName.count({
                where: { tenantId: { in: tenantIds } },
              })
            : Promise.resolve(0),
          bookId
            ? db.financeCommand.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financeJournalEntry.count({ where: { bookId } })
            : Promise.resolve(0),
        ])
        assertFixtureCleanup(
          [
            remainingTenants,
            remainingUsers,
            remainingBooks,
            remainingItems,
            remainingStores,
            remainingBalances,
            remainingOperations,
            remainingMovements,
            remainingCategoryNames,
            remainingFinanceCommands,
            remainingJournals,
          ].every((count) => count === 0),
          "Run-owned purchase atomicity fixtures remain after cleanup.",
        )
      }
    })
  },
)
