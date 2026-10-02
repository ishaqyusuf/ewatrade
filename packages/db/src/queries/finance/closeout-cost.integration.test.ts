import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  createInventoryCloseout,
  finalizeInventoryCloseout,
  moveInventoryCustody,
} from "../inventory-custody-transfers"
import { correctStockOperation } from "../inventory-operations"
import { createFinanceBook } from "./accounts"
import { recordFinancePurchase } from "./purchases"
import { createFinanceSupplier } from "./supplier-writes"

setDefaultTimeout(900_000)

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error(
      "Closeout acceptance requires the exact development database.",
    )
}

describeWithServiceCommerceDatabase("custody closeout cost acceptance", () => {
  test("keeps exact cost, journals and replay atomic under real custody, concurrency and failure", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    console.info(`closeout-cost QA run ${runId}`)
    const tenantIds: string[] = []
    const storeIds: string[] = []
    const itemIds: string[] = []
    const balanceIds: string[] = []
    const bookIds: string[] = []
    const userIds: string[] = []
    try {
      const owner = await db.user.create({
        data: {
          email: `closeout-cost-${runId}@example.invalid`,
          name: "Closeout QA owner",
        },
      })
      userIds.push(owner.id)
      const manager = await db.user.create({
        data: {
          email: `closeout-cost-manager-${runId}@example.invalid`,
          name: "Closeout QA manager",
        },
      })
      userIds.push(manager.id)
      async function makeTenant(label: string) {
        const tenant = await db.tenant.create({
          data: {
            name: `Closeout cost QA ${label}`,
            slug: `closeout-cost-${label}-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: [
                { userId: owner.id, role: "OWNER", status: "ACTIVE" },
                { userId: manager.id, role: "MANAGER", status: "ACTIVE" },
              ],
            },
          },
        })
        tenantIds.push(tenant.id)
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Private closeout QA",
            slug: `closeout-cost-${label}-${runId}`,
            status: "ACTIVE",
          },
        })
        storeIds.push(store.id)
        return { tenant, store }
      }
      const known = await makeTenant("known")
      const physicalOnly = await makeTenant("no-book")
      const book = await createFinanceBook(db, {
        tenantId: known.tenant.id,
        actorUserId: owner.id,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      })
      bookIds.push(book.id)
      const supplier = await createFinanceSupplier(db, {
        tenantId: known.tenant.id,
        actorUserId: owner.id,
        bookId: book.id,
        clientCommandId: `supplier-${runId}`,
        code: `CC-${runId.slice(0, 8)}`,
        name: "Closeout QA supplier",
      })
      async function makeStock(
        target: typeof known,
        label: string,
        packaged: boolean,
        initial = "0",
      ) {
        const item = await db.catalogItem.create({
          data: {
            tenantId: target.tenant.id,
            slug: `closeout-cost-${label}-${runId}`,
            kind: "PRODUCT",
            name: `Closeout QA ${label}`,
            product: { create: {} },
            variants: {
              create: { key: "default", name: "Default", isDefault: true },
            },
          },
          include: { product: true, variants: true },
        })
        itemIds.push(item.id)
        const product = item.product
        const variant = item.variants[0]
        if (!product || !variant) throw new Error("Incomplete closeout Product")
        const configuration = await db.unitConfigurationVersion.create({
          data: {
            productId: product.id,
            version: 1,
            status: "CURRENT",
            canonicalBalanceScale: 18,
            units: {
              create: [
                {
                  key: "base",
                  name: "unit",
                  factor: "1",
                  stockBehavior: "CANONICAL_SHARED",
                  transactionScale: 3,
                },
                {
                  key: "case",
                  name: "case",
                  factor: "12",
                  stockBehavior: "PACKAGED_STOCK",
                  transactionScale: 3,
                },
              ],
            },
          },
          include: { units: true },
        })
        const unit = configuration.units.find(
          (row) => row.key === (packaged ? "case" : "base"),
        )
        if (!unit) throw new Error("Missing closeout unit")
        await db.catalogProduct.update({
          where: { id: product.id },
          data: { currentUnitConfigurationVersionId: configuration.id },
        })
        const root = await db.stockBalanceSource.create({
          data: {
            tenantId: target.tenant.id,
            storeId: target.store.id,
            productId: product.id,
            variantId: variant.id,
            inventoryUnitId: unit.id,
            kind: packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
            onHandQuantity: initial,
          },
        })
        balanceIds.push(root.id)
        return { target, root, configuration, unit }
      }
      const shortage = await makeStock(known, "shortage", true)
      const gain = await makeStock(known, "gain", true)
      const unchanged = await makeStock(known, "unchanged", true)
      const shared = await makeStock(known, "shared", false)
      const legacy = await makeStock(known, "missing-opening", true)
      const firstGain = await makeStock(known, "first-gain", false)
      const noBook = await makeStock(physicalOnly, "physical", true, "4")
      async function receive(
        stock: typeof shortage,
        label: string,
        amountMinor: string,
      ) {
        await recordFinancePurchase(db, {
          tenantId: known.tenant.id,
          actorUserId: owner.id,
          bookId: book.id,
          clientCommandId: `receipt-${label}-${runId}`,
          supplierId: supplier.id,
          storeId: known.store.id,
          description: "QA original closeout cost",
          incurredAt: new Date("2026-09-15T12:00:00Z"),
          lines: [
            {
              balanceSourceId: stock.root.id,
              enteredInventoryUnitId: stock.unit.id,
              expectedConfigurationVersionId: stock.configuration.id,
              description: "QA cost",
              amountMinor,
              enteredQuantity: "4",
              expectedBalanceRevision: 0,
              categories: [{ name: `Closeout ${runId.slice(0, 8)}` }],
            },
          ],
        })
      }
      await receive(shortage, "shortage", "1001")
      await receive(gain, "gain", "1000")
      await receive(unchanged, "unchanged", "1000")
      await receive(shared, "shared", "101")
      const reference = `staff-${runId}`
      async function assign(
        stock: typeof shortage,
        label: string,
        custodyType: "staff" | "session" = "staff",
      ) {
        const current = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: stock.root.id },
        })
        await moveInventoryCustody(db, {
          tenantId: stock.target.tenant.id,
          actorUserId: manager.id,
          clientOperationId: `custody-${label}-${runId}`,
          sourceBalanceSourceId: stock.root.id,
          expectedSourceRevision: current.revision,
          quantity: "4",
          targetCustodyType: custodyType,
          targetCustodyReferenceId: reference,
          source: "manager_inventory_action",
          reason: "Approved QA custody",
          schemaVersion: 1,
        })
        const balance = await db.stockBalanceSource.findFirstOrThrow({
          where: {
            tenantId: stock.target.tenant.id,
            parentBalanceSourceId: stock.root.id,
            custodyReferenceId: reference,
          },
        })
        balanceIds.push(balance.id)
        return balance
      }
      const knownCustody = await assign(shortage, "shortage")
      const gainCustody = await assign(gain, "gain")
      const zeroCustody = await assign(unchanged, "unchanged")
      const sharedCustody = await assign(shared, "shared", "session")
      const noBookCustody = await assign(noBook, "no-book")
      async function seedCustody(stock: typeof shortage, quantity: string) {
        const balance = await db.stockBalanceSource.create({
          data: {
            tenantId: known.tenant.id,
            storeId: known.store.id,
            productId: stock.root.productId,
            variantId: stock.root.variantId,
            inventoryUnitId: stock.unit.id,
            kind: stock.root.kind,
            custodyType: "STAFF",
            custodyReferenceId: reference,
            parentBalanceSourceId: stock.root.id,
            onHandQuantity: quantity,
          },
        })
        balanceIds.push(balance.id)
        return balance
      }
      const legacyCustody = await seedCustody(legacy, "4")
      const openingCustody = await seedCustody(firstGain, "0")
      async function draft(
        label: string,
        declarations: Array<{ id: string; declared: string }>,
        target = known,
        custodyType: "staff" | "session" = "staff",
      ) {
        const lines = []
        for (const declaration of declarations) {
          const balance = await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: declaration.id },
          })
          lines.push({
            balanceSourceId: balance.id,
            declaredQuantity: declaration.declared,
            expectedRevision: balance.revision,
          })
        }
        return createInventoryCloseout(db, {
          tenantId: target.tenant.id,
          storeId: target.store.id,
          actorUserId: owner.id,
          clientOperationId: `draft-${label}-${runId}`,
          custodyType,
          custodyReferenceId: reference,
          declarations: lines,
          reason: "QA approved reconciliation",
          schemaVersion: 1,
        })
      }
      function command(
        closeoutId: string,
        label: string,
        tenantId = known.tenant.id,
      ) {
        return {
          tenantId,
          closeoutId,
          actorUserId: manager.id,
          clientOperationId: `final-${label}-${runId}`,
          reason: "Approved QA closeout",
          schemaVersion: 1 as const,
        }
      }
      async function events(operationId: string) {
        return db.financeInventoryValuationEvent.findMany({
          where: { stockOperationId: operationId },
          orderBy: { balanceSourceId: "asc" },
        })
      }
      async function shortages(operationId: string) {
        return db.financeJournalEntry.findMany({
          where: {
            bookId: book.id,
            sourceKind: "INVENTORY_CLOSEOUT_SHORTAGE",
            sourceId: {
              in: (await events(operationId)).map((row) => row.stockMovementId),
            },
          },
          include: { lines: { include: { account: true } } },
        })
      }
      console.info(
        `closeout-cost ${runId}: real multi-line shortage/gain/unknown/zero`,
      )
      const multi = await draft("multi", [
        { id: knownCustody.id, declared: "3" },
        { id: gainCustody.id, declared: "5" },
        { id: zeroCustody.id, declared: "4" },
        { id: legacyCustody.id, declared: "3" },
      ])
      const multiCommand = command(multi.id, "multi")
      const [first, concurrent] = await Promise.all([
        finalizeInventoryCloseout(db, multiCommand),
        finalizeInventoryCloseout(db, multiCommand),
      ])
      expect(concurrent.id).toBe(first.id)
      const finalized = await db.inventoryCloseout.findUniqueOrThrow({
        where: { id: multi.id },
      })
      expect(finalized.finalizedAt).toEqual(first.effectiveAt)
      expect(finalized.finalizedOperationId).toBe(first.id)
      expect(first.actorUserId).toBe(manager.id)
      expect(finalized.actorUserId).toBe(owner.id)
      const multiEvents = await events(first.id)
      expect(multiEvents).toHaveLength(3)
      const knownEvent = multiEvents.find(
        (row) => row.balanceSourceId === knownCustody.id,
      )
      const gainEvent = multiEvents.find(
        (row) => row.balanceSourceId === gainCustody.id,
      )
      const legacyEvent = multiEvents.find(
        (row) => row.balanceSourceId === legacyCustody.id,
      )
      expect(knownEvent?.sourceCostMinor).toBe(BigInt(250))
      expect(knownEvent?.valueAfterMinor).toBe(BigInt(751))
      expect(knownEvent?.canonicalEffect.toFixed()).toBe("-12")
      expect(gainEvent?.sourceCostMinor).toBeNull()
      expect(gainEvent?.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
      expect(legacyEvent?.sourceCostMinor).toBeNull()
      expect(legacyEvent?.unknownReason).toBe("MISSING_OPENING_COST")
      expect(
        multiEvents.every(
          (row) => row.effectiveAt.getTime() === first.effectiveAt.getTime(),
        ),
      ).toBe(true)
      expect(
        (
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: zeroCustody.id },
          })
        ).revision,
      ).toBe(zeroCustody.revision)
      const posted = await shortages(first.id)
      expect(posted).toHaveLength(1)
      expect(posted[0]?.sourceId).toBe(knownEvent?.stockMovementId)
      expect(posted[0]?.effectiveAt).toEqual(first.effectiveAt)
      expect(
        posted[0]?.lines.find((line) => line.account.code === "6000")
          ?.debitMinor,
      ).toBe(BigInt(250))
      expect(
        posted[0]?.lines.find((line) => line.account.code === "1300")
          ?.creditMinor,
      ).toBe(BigInt(250))
      expect(posted[0]?.lines).toHaveLength(2)
      expect(await finalizeInventoryCloseout(db, multiCommand)).toEqual(first)
      expect(await shortages(first.id)).toHaveLength(1)
      await expect(
        finalizeInventoryCloseout(db, { ...multiCommand, reason: "Changed" }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })

      const firstOpening = await draft("opening-gain", [
        { id: openingCustody.id, declared: "1" },
      ])
      const openingOperation = await finalizeInventoryCloseout(
        db,
        command(firstOpening.id, "opening-gain"),
      )
      const openingEvent = (await events(openingOperation.id))[0]
      expect(openingEvent?.valueBeforeMinor).toBe(BigInt(0))
      expect(openingEvent?.valueAfterMinor).toBeNull()
      expect(openingEvent?.sourceCostMinor).toBeNull()
      expect(await shortages(openingOperation.id)).toEqual([])

      console.info(
        `closeout-cost ${runId}: shared half-even and known zero cost`,
      )
      const sharedDraft = await draft(
        "shared-half",
        [{ id: sharedCustody.id, declared: "2" }],
        known,
        "session",
      )
      const sharedOperation = await finalizeInventoryCloseout(
        db,
        command(sharedDraft.id, "shared-half"),
      )
      expect((await events(sharedOperation.id))[0]?.sourceCostMinor).toBe(
        BigInt(50),
      )
      expect((await events(sharedOperation.id))[0]?.valueAfterMinor).toBe(
        BigInt(51),
      )
      expect(
        (await shortages(sharedOperation.id))[0]?.lines.find(
          (line) => line.account.code === "6000",
        )?.debitMinor,
      ).toBe(BigInt(50))
      const tiny = await draft(
        "known-zero",
        [{ id: sharedCustody.id, declared: "1.999" }],
        known,
        "session",
      )
      const tinyOperation = await finalizeInventoryCloseout(
        db,
        command(tiny.id, "known-zero"),
      )
      expect((await events(tinyOperation.id))[0]?.sourceCostMinor).toBe(
        BigInt(0),
      )
      expect(await shortages(tinyOperation.id)).toEqual([])

      console.info(
        `closeout-cost ${runId}: atomic period, chronology, account, limit and source rollback`,
      )
      const rejectionDraft = await draft("rollback", [
        { id: knownCustody.id, declared: "2" },
      ])
      async function snapshot() {
        const [
          source,
          balance,
          pool,
          operationCount,
          movementCount,
          eventCount,
          journalCount,
          financeCommands,
          currentBook,
        ] = await Promise.all([
          db.inventoryCloseout.findUnique({
            where: { id: rejectionDraft.id },
            include: { lines: true },
          }),
          db.stockBalanceSource.findUnique({ where: { id: knownCustody.id } }),
          db.financeInventoryPool.findUnique({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: knownCustody.id,
              },
            },
          }),
          db.stockOperation.count({ where: { tenantId: known.tenant.id } }),
          db.stockMovement.count({
            where: { operation: { tenantId: known.tenant.id } },
          }),
          db.financeInventoryValuationEvent.count({
            where: { bookId: book.id },
          }),
          db.financeJournalEntry.count({ where: { bookId: book.id } }),
          db.financeCommand.count({ where: { bookId: book.id } }),
          db.financeBook.findUnique({ where: { id: book.id } }),
        ])
        return {
          source,
          balance,
          pool,
          operationCount,
          movementCount,
          eventCount,
          journalCount,
          financeCommands,
          currentBook,
        }
      }
      async function rejectUnchanged(
        label: string,
        code: string,
        tenantId = known.tenant.id,
      ) {
        const before = await snapshot()
        await expect(
          finalizeInventoryCloseout(
            db,
            command(rejectionDraft.id, label, tenantId),
          ),
        ).rejects.toMatchObject({ code })
        expect(await snapshot()).toEqual(before)
      }

      // Force an actual line FK failure after physical stock, cost, journal entry
      // and Book sequence writes. All delegates except this QA fault use Neon.
      let reachedJournalLines = false
      const failedJournalDb = new Proxy(db, {
        get(target, key, receiver) {
          if (key !== "$transaction") return Reflect.get(target, key, receiver)
          return (
            work: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options: { maxWait?: number; timeout?: number },
          ) =>
            target.$transaction(async (tx) => {
              const failedLines = new Proxy(tx.financeJournalLine, {
                get(delegate, method, delegateReceiver) {
                  if (method !== "createMany")
                    return Reflect.get(delegate, method, delegateReceiver)
                  return (args: Prisma.FinanceJournalLineCreateManyArgs) => {
                    reachedJournalLines = true
                    const data = Array.isArray(args.data)
                      ? args.data
                      : [args.data]
                    return delegate.createMany({
                      ...args,
                      data: data.map((line) => ({
                        ...line,
                        accountId: `missing-account-${runId}`,
                      })),
                    })
                  }
                },
              })
              return work(
                new Proxy(tx, {
                  get(client, method, clientReceiver) {
                    return method === "financeJournalLine"
                      ? failedLines
                      : Reflect.get(client, method, clientReceiver)
                  },
                }),
              )
            }, options)
        },
      })
      const beforeLateFailure = await snapshot()
      await expect(
        finalizeInventoryCloseout(
          failedJournalDb,
          command(rejectionDraft.id, "late-journal-fk"),
        ),
      ).rejects.toMatchObject({ code: "P2003" })
      expect(reachedJournalLines).toBe(true)
      expect(await snapshot()).toEqual(beforeLateFailure)
      const future = new Date(Date.now() + 600_000)
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: future },
      })
      try {
        await rejectUnchanged("closed", "CLOSED_PERIOD")
        expect(await finalizeInventoryCloseout(db, multiCommand)).toEqual(first)
      } finally {
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: null },
        })
      }
      const pool = await db.financeInventoryPool.findUniqueOrThrow({
        where: {
          bookId_balanceSourceId: {
            bookId: book.id,
            balanceSourceId: knownCustody.id,
          },
        },
      })
      await db.financeInventoryPool.update({
        where: { id: pool.id },
        data: { latestEffectiveAt: future },
      })
      try {
        await rejectUnchanged("chronology", "INVALID_JOURNAL")
      } finally {
        await db.financeInventoryPool.update({
          where: { id: pool.id },
          data: { latestEffectiveAt: pool.latestEffectiveAt },
        })
      }
      await db.financeAccount.update({
        where: { bookId_code: { bookId: book.id, code: "6000" } },
        data: { archivedAt: new Date() },
      })
      try {
        await rejectUnchanged("account", "NOT_FOUND")
      } finally {
        await db.financeAccount.update({
          where: { bookId_code: { bookId: book.id, code: "6000" } },
          data: { archivedAt: null },
        })
      }
      await db.financeInventoryPool.update({
        where: { id: pool.id },
        data: { valueMinor: BigInt("9223372036854775807") },
      })
      try {
        await rejectUnchanged("money-limit", "INVALID_AMOUNT")
      } finally {
        await db.financeInventoryPool.update({
          where: { id: pool.id },
          data: { valueMinor: pool.valueMinor },
        })
      }
      await db.financeInventoryPool.update({
        where: { id: pool.id },
        data: { lastSequence: BigInt("9223372036854775807") },
      })
      try {
        await rejectUnchanged("sequence-limit", "CONFLICT")
      } finally {
        await db.financeInventoryPool.update({
          where: { id: pool.id },
          data: { lastSequence: pool.lastSequence },
        })
      }
      await rejectUnchanged(
        "foreign-tenant",
        "INVALID_STOCK_OPERATION",
        physicalOnly.tenant.id,
      )
      const rejectionLine = await db.inventoryCloseoutLine.findFirstOrThrow({
        where: { closeoutId: rejectionDraft.id },
      })
      await db.inventoryCloseoutLine.update({
        where: { id: rejectionLine.id },
        data: { balanceSourceId: noBookCustody.id },
      })
      try {
        await rejectUnchanged("foreign-balance", "INVALID_STOCK_OPERATION")
      } finally {
        await db.inventoryCloseoutLine.update({
          where: { id: rejectionLine.id },
          data: { balanceSourceId: knownCustody.id },
        })
      }
      await db.stockBalanceSource.update({
        where: { id: knownCustody.id },
        data: { reservedQuantity: "3" },
      })
      try {
        await rejectUnchanged("reserved-stock", "INSUFFICIENT_STOCK")
      } finally {
        await db.stockBalanceSource.update({
          where: { id: knownCustody.id },
          data: { reservedQuantity: "0" },
        })
      }
      await db.stockBalanceSource.update({
        where: { id: knownCustody.id },
        data: { revision: { increment: 1 } },
      })
      try {
        await rejectUnchanged("stale-revision", "REVISION_CONFLICT")
      } finally {
        await db.stockBalanceSource.update({
          where: { id: knownCustody.id },
          data: { revision: pool.lastStockRevision },
        })
      }

      const residual = await draft("residual", [
        { id: knownCustody.id, declared: "0" },
      ])
      const residualOperation = await finalizeInventoryCloseout(
        db,
        command(residual.id, "residual"),
      )
      expect((await events(residualOperation.id))[0]?.sourceCostMinor).toBe(
        BigInt(751),
      )
      expect((await events(residualOperation.id))[0]?.valueAfterMinor).toBe(
        BigInt(0),
      )
      expect(
        (await shortages(residualOperation.id))[0]?.lines.find(
          (line) => line.account.code === "6000",
        )?.debitMinor,
      ).toBe(BigInt(751))
      expect(await finalizeInventoryCloseout(db, multiCommand)).toEqual(first)
      expect(await shortages(first.id)).toHaveLength(1)
      if (!knownEvent) throw new Error("Missing original shortage event")
      const correctedBalance = await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: knownCustody.id },
      })
      const beforeCorrection = await snapshot()
      await expect(
        correctStockOperation(db, {
          tenantId: known.tenant.id,
          actorUserId: manager.id,
          clientOperationId: `correction-${runId}`,
          targetOperationId: first.id,
          source: "manager_inventory_action",
          reason: "Cannot bypass source",
          corrections: [
            {
              movementId: knownEvent.stockMovementId,
              correctedEnteredQuantity: "0.5",
              expectedBalanceRevision: correctedBalance.revision,
            },
          ],
          schemaVersion: 1,
        }),
      ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
      expect(await snapshot()).toEqual(beforeCorrection)

      console.info(
        `closeout-cost ${runId}: real no-Book identical and competing commands`,
      )
      const physicalDraft = await draft(
        "no-book",
        [{ id: noBookCustody.id, declared: "2" }],
        physicalOnly,
      )
      const physicalCommand = command(
        physicalDraft.id,
        "no-book",
        physicalOnly.tenant.id,
      )
      const [physical, physicalReplay] = await Promise.all([
        finalizeInventoryCloseout(db, physicalCommand),
        finalizeInventoryCloseout(db, physicalCommand),
      ])
      expect(physical.id).toBe(physicalReplay.id)
      expect(
        (
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: noBookCustody.id },
          })
        ).onHandQuantity.toFixed(),
      ).toBe("2")
      expect(await events(physical.id)).toEqual([])
      expect(
        (
          await db.inventoryCloseout.findUniqueOrThrow({
            where: { id: physicalDraft.id },
          })
        ).finalizedAt,
      ).toEqual(physical.effectiveAt)
      const physicalMovement = await db.stockMovement.findFirstOrThrow({
        where: { operationId: physical.id },
      })
      const beforePhysicalCorrection = await db.stockOperation.count({
        where: { tenantId: physicalOnly.tenant.id },
      })
      const physicalBalance = await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: noBookCustody.id },
      })
      await expect(
        correctStockOperation(db, {
          tenantId: physicalOnly.tenant.id,
          actorUserId: manager.id,
          clientOperationId: `physical-correction-${runId}`,
          targetOperationId: physical.id,
          source: "manager_inventory_action",
          reason: "No-Book owner protection",
          corrections: [
            {
              movementId: physicalMovement.id,
              correctedEnteredQuantity: "1",
              expectedBalanceRevision: physicalBalance.revision,
            },
          ],
          schemaVersion: 1,
        }),
      ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
      expect(
        await db.stockOperation.count({
          where: { tenantId: physicalOnly.tenant.id },
        }),
      ).toBe(beforePhysicalCorrection)
      const competingDraft = await draft(
        "competing",
        [{ id: noBookCustody.id, declared: "1" }],
        physicalOnly,
      )
      const competing = await Promise.allSettled([
        finalizeInventoryCloseout(
          db,
          command(competingDraft.id, "competing-a", physicalOnly.tenant.id),
        ),
        finalizeInventoryCloseout(
          db,
          command(competingDraft.id, "competing-b", physicalOnly.tenant.id),
        ),
      ])
      expect(
        competing.filter((row) => row.status === "fulfilled"),
      ).toHaveLength(1)
      const failed = competing.find((row) => row.status === "rejected")
      expect(
        failed?.status === "rejected" ? failed.reason : null,
      ).toMatchObject({ code: "INVALID_STOCK_OPERATION" })
      expect(
        (
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: noBookCustody.id },
          })
        ).onHandQuantity.toFixed(),
      ).toBe("1")
      expect(
        await db.stockOperation.count({
          where: {
            tenantId: physicalOnly.tenant.id,
            clientOperationId: {
              in: [`final-competing-a-${runId}`, `final-competing-b-${runId}`],
            },
          },
        }),
      ).toBe(1)
      const laterBook = await createFinanceBook(db, {
        tenantId: physicalOnly.tenant.id,
        actorUserId: owner.id,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      })
      bookIds.push(laterBook.id)
      expect(await finalizeInventoryCloseout(db, physicalCommand)).toEqual(
        physical,
      )
      expect(
        await db.financeInventoryValuationEvent.count({
          where: { bookId: laterBook.id },
        }),
      ).toBe(0)
      expect(
        await db.financeJournalEntry.count({ where: { bookId: laterBook.id } }),
      ).toBe(0)
      console.info(`closeout-cost ${runId}: operating matrix passed`)
    } finally {
      await db.$transaction(
        async (tx) => {
          const books = { bookId: { in: bookIds } }
          const tenants = { tenantId: { in: tenantIds } }
          await tx.financeInventoryValuationEvent.deleteMany({ where: books })
          await tx.financeInventoryPool.deleteMany({ where: books })
          await tx.financePurchaseReceiptLine.deleteMany({ where: books })
          await tx.financeSupplierEntry.deleteMany({ where: books })
          await tx.financeBillPayment.deleteMany({ where: books })
          await tx.financeBillLine.deleteMany({ where: books })
          await tx.financeBill.deleteMany({ where: books })
          await tx.inventoryCloseoutLine.deleteMany({
            where: { closeout: tenants },
          })
          await tx.inventoryCloseout.deleteMany({ where: tenants })
          await tx.stockReservation.deleteMany({ where: tenants })
          await tx.stockMovement.deleteMany({ where: { operation: tenants } })
          await tx.stockOperationCategory.deleteMany({
            where: { stockOperation: tenants },
          })
          await tx.stockOperation.deleteMany({ where: tenants })
          await tx.stockOperationCategoryName.deleteMany({ where: tenants })
          await tx.stockBalanceSource.updateMany({
            where: { ...tenants, parentBalanceSourceId: { not: null } },
            data: { parentBalanceSourceId: null },
          })
          await tx.stockBalanceSource.deleteMany({ where: tenants })
          await tx.financeSupplierAccount.deleteMany({ where: books })
          await tx.financeJournalLine.deleteMany({ where: books })
          await tx.financeJournalEntry.deleteMany({ where: books })
          await tx.financeCommand.deleteMany({ where: books })
          await tx.financeAccount.deleteMany({ where: books })
          await tx.financeBook.deleteMany({ where: { id: { in: bookIds } } })
          await tx.catalogItem.deleteMany({ where: { id: { in: itemIds } } })
          await tx.store.deleteMany({ where: { id: { in: storeIds } } })
          await tx.membership.deleteMany({ where: tenants })
          await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
          await tx.user.deleteMany({ where: { id: { in: userIds } } })
        },
        { maxWait: 10_000, timeout: 30_000 },
      )
      const tenants = { tenantId: { in: tenantIds } }
      const books = { bookId: { in: bookIds } }
      const remaining = await Promise.all([
        db.user.count({ where: { id: { in: userIds } } }),
        db.tenant.count({ where: { id: { in: tenantIds } } }),
        db.membership.count({ where: tenants }),
        db.store.count({ where: { id: { in: storeIds } } }),
        db.catalogItem.count({ where: { id: { in: itemIds } } }),
        db.stockBalanceSource.count({ where: { id: { in: balanceIds } } }),
        db.stockOperation.count({ where: tenants }),
        db.stockMovement.count({
          where: {
            balanceSourceId: { in: balanceIds },
          },
        }),
        db.inventoryCloseout.count({ where: tenants }),
        db.inventoryCloseoutLine.count({
          where: { balanceSourceId: { in: balanceIds } },
        }),
        db.financeInventoryValuationEvent.count({ where: tenants }),
        db.financeInventoryPool.count({ where: tenants }),
        db.financePurchaseReceiptLine.count({ where: books }),
        db.financeBill.count({ where: books }),
        db.financeSupplierAccount.count({ where: books }),
        db.financeJournalEntry.count({ where: books }),
        db.financeJournalLine.count({ where: books }),
        db.financeCommand.count({ where: books }),
        db.financeBook.count({ where: tenants }),
      ])
      for (const count of remaining) expect(count).toBe(0)
      console.info(
        `closeout-cost ${runId}: all ${remaining.length} cleanup checks clear`,
      )
    }
  })
})
