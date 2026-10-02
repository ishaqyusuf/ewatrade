import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createCatalogItem } from "../catalog"
import { lockFinanceBook } from "./access"
import { createFinanceBook } from "./accounts"
import { cleanupOpeningCostAcceptance } from "./opening-cost.integration-cleanup"
import { recordFinancePurchase } from "./purchases"
import { resolveReviewedCostPurchaseSourceInTransaction } from "./reviewed-cost-purchase"
import { createFinanceSupplier } from "./supplier-writes"

setDefaultTimeout(600_000)
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error("Reviewed purchase proof requires exact development.")
}

describeWithServiceCommerceDatabase("original purchase source proof", () => {
  test("proves a multi-line posted acquisition, preserves unknown carrying cost and rejects changed original money", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    console.info(`reviewed-purchase QA run ${runId}`)
    const tenantIds: string[] = []
    const userIds: string[] = []
    const bookIds: string[] = []
    try {
      const owner = await db.user.create({
        data: {
          name: "Purchase proof QA",
          email: `opening-cost-${runId}@example.invalid`,
        },
      })
      userIds.push(owner.id)
      const manager = await db.user.create({
        data: {
          name: "Purchase proof QA manager",
          email: `opening-cost-manager-${runId}@example.invalid`,
        },
      })
      userIds.push(manager.id)
      const tenant = await db.tenant.create({
        data: {
          name: "Purchase proof QA",
          slug: `opening-cost-purchase-proof-${runId}`,
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
      const actor = { tenantId: tenant.id, actorUserId: owner.id }
      const store = await db.store.create({
        data: {
          tenantId: tenant.id,
          name: "Private purchase proof QA",
          slug: `purchase-proof-${runId}`,
          countryCode: "NG",
          status: "ACTIVE",
        },
      })
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      })
      bookIds.push(book.id)
      const balances = []
      for (const label of ["unknown", "empty"]) {
        const item = await createCatalogItem(db, {
          ...actor,
          storeId: store.id,
          clientOperationId: `purchase-proof-${label}-${runId}`,
          kind: "product",
          name: `Private ${label} purchase proof`,
          unitConfiguration: {
            canonicalBalanceScale: 18,
            units: [
              {
                key: "base",
                name: "unit",
                factor: "1",
                stockBehavior: "canonical_shared",
                transactionScale: 3,
              },
            ],
          },
          variants: [
            {
              key: "default",
              name: "Default",
              isDefault: true,
              offerings: [
                {
                  key: "sell",
                  name: "Unit",
                  inventoryUnitKey: "base",
                  pricingPolicy: "fixed",
                  fixedPriceMinor: 100,
                },
              ],
              ...(label === "unknown" ? { openingStockQuantity: "4" } : {}),
            },
          ],
        })
        if (label === "empty") {
          const unit = await db.inventoryUnit.findFirstOrThrow({
            where: {
              key: "base",
              configurationVersion: {
                status: "CURRENT",
                product: { catalogItemId: item.id },
              },
            },
            include: { configurationVersion: true },
          })
          const variant = await db.sellableVariant.findFirstOrThrow({
            where: { catalogItemId: item.id, key: "default" },
          })
          await db.stockBalanceSource.create({
            data: {
              tenantId: tenant.id,
              storeId: store.id,
              productId: unit.configurationVersion.productId,
              variantId: variant.id,
              inventoryUnitId: unit.id,
              kind: "SHARED_POOL",
            },
          })
        }
        const balance = await db.stockBalanceSource.findFirstOrThrow({
          where: { tenantId: tenant.id, product: { catalogItemId: item.id } },
          include: { inventoryUnit: true },
        })
        balances.push(balance)
      }
      const [unknown, empty] = balances
      if (!unknown || !empty) throw new Error("Missing purchase proof balances")
      const supplier = await createFinanceSupplier(db, {
        ...actor,
        bookId: book.id,
        clientCommandId: `purchase-proof-supplier-${runId}`,
        code: `QA-${runId.slice(0, 8)}`,
        name: "Private source supplier",
      })
      const purchaseAt = new Date()
      const bill = await recordFinancePurchase(db, {
        ...actor,
        bookId: book.id,
        clientCommandId: `purchase-proof-document-${runId}`,
        supplierId: supplier.id,
        storeId: store.id,
        description: "Private original multi-line acquisition",
        incurredAt: purchaseAt,
        lines: balances.map((balance, index) => ({
          balanceSourceId: balance.id,
          description: "Private receipt",
          amountMinor: index === 0 ? "100" : "200",
          enteredQuantity: "2",
          enteredInventoryUnitId: balance.inventoryUnitId,
          expectedBalanceRevision: balance.revision,
          expectedConfigurationVersionId:
            balance.inventoryUnit.configurationVersionId,
          categories: [{ name: `Source proof ${runId.slice(0, 8)}` }],
        })),
      })
      const receipts = await db.financePurchaseReceiptLine.findMany({
        where: { bookId: book.id, billLine: { billId: bill.id } },
        include: { billLine: true, stockMovement: true },
      })
      const unknownReceipt = receipts.find(
        (row) => row.stockMovement.balanceSourceId === unknown.id,
      )
      const emptyReceipt = receipts.find(
        (row) => row.stockMovement.balanceSourceId === empty.id,
      )
      if (!unknownReceipt || !emptyReceipt)
        throw new Error("Missing original receipts")
      const input = {
        ...actor,
        bookId: book.id,
        receiptId: unknownReceipt.id,
        through: new Date(),
      }
      const options = { maxWait: 10_000, timeout: 30_000 }
      const read = (receiptId = input.receiptId) =>
        db.$transaction(
          (tx) =>
            resolveReviewedCostPurchaseSourceInTransaction(tx, {
              ...input,
              receiptId,
            }),
          options,
        )
      const proved = await read()
      expect(proved.sourceCostMinor).toBe(100n)
      expect(proved.semantics).toEqual({
        movementId: unknownReceipt.stockMovementId,
        kind: "ORIGIN",
      })
      expect(proved.snapshot.event?.valueAfterMinor).toBeNull()
      expect(proved.snapshot.event?.unknownReason).toBe("MISSING_OPENING_COST")
      expect(proved.snapshot.bill.lines).toHaveLength(2)
      expect(proved.snapshot.journal?.sequence).toBe(1n)
      expect(proved.snapshot.supplierEntry?.amountMinor).toBe(300n)
      expect(proved.requiresPhysicalHistoryProof).toBe(true)
      expect(proved.requiresCoordinatedSnapshotProof).toBe(true)
      expect(proved.requiresClassificationProof).toBe(true)
      expect(proved.requiresConfirmationProof).toBe(true)
      expect((await read()).sourceSnapshotHash).toBe(proved.sourceSnapshotHash)
      const known = await read(emptyReceipt.id)
      expect(known.sourceCostMinor).toBe(200n)
      expect(known.snapshot.event?.valueAfterMinor).toBe(200n)
      expect(known.originalJournalId).toBe(proved.originalJournalId)
      await expect(
        db.$transaction(
          (tx) =>
            resolveReviewedCostPurchaseSourceInTransaction(tx, {
              ...input,
              actorUserId: manager.id,
            }),
          options,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      const journal = proved.snapshot.journal
      const entry = proved.snapshot.supplierEntry
      const postingCommand = proved.snapshot.postingCommand
      if (!journal || !entry || !postingCommand)
        throw new Error("Missing proved original posting")
      const inventoryLine = journal.lines.find((row) => row.debitMinor === 300n)
      if (!inventoryLine) throw new Error("Missing Inventory debit")
      const mutations = [
        {
          label: "line cost",
          message: "bill total",
          mutate: (tx: Parameters<typeof lockFinanceBook>[0]) =>
            tx.financeBillLine.update({
              where: { id: emptyReceipt.billLineId },
              data: { amountMinor: 201n },
            }),
        },
        {
          label: "journal amount",
          message: "debit exact Inventory",
          mutate: (tx: Parameters<typeof lockFinanceBook>[0]) =>
            tx.financeJournalLine.update({
              where: { id: inventoryLine.id },
              data: { debitMinor: 299n },
            }),
        },
        {
          label: "supplier amount",
          message: "supplier/journal posting",
          mutate: (tx: Parameters<typeof lockFinanceBook>[0]) =>
            tx.financeSupplierEntry.update({
              where: { id: entry.id },
              data: { amountMinor: 299n },
            }),
        },
        {
          label: "posting command",
          message: "journal command/fingerprint",
          mutate: (tx: Parameters<typeof lockFinanceBook>[0]) =>
            tx.financeCommand.delete({ where: { id: postingCommand.id } }),
        },
        {
          label: "bill correction",
          message: "correction state",
          mutate: (tx: Parameters<typeof lockFinanceBook>[0]) =>
            tx.financeBill.update({
              where: { id: bill.id },
              data: { voidReason: "QA incomplete correction" },
            }),
        },
      ]
      for (const mutation of mutations) {
        await expect(
          db.$transaction(async (tx) => {
            await lockFinanceBook(tx, input)
            await mutation.mutate(tx)
            await resolveReviewedCostPurchaseSourceInTransaction(tx, input)
          }, options),
        ).rejects.toThrow(mutation.message)
        expect((await read()).sourceSnapshotHash).toBe(
          proved.sourceSnapshotHash,
        )
      }
      await expect(
        db.$transaction(
          (tx) =>
            resolveReviewedCostPurchaseSourceInTransaction(tx, {
              ...input,
              through: new Date(purchaseAt.getTime() - 1),
            }),
          options,
        ),
      ).rejects.toThrow("scope, ownership")
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: purchaseAt },
      })
      expect((await read()).sourceCostMinor).toBe(100n)
      expect(
        await db.financeJournalEntry.count({ where: { bookId: book.id } }),
      ).toBe(1)
      expect(
        await db.stockMovement.count({
          where: { balanceSource: { tenantId: tenant.id } },
        }),
      ).toBe(3)
      console.info(`reviewed-purchase checks complete ${runId}`)
    } finally {
      const remaining = await cleanupOpeningCostAcceptance(db, {
        runId,
        tenantIds,
        userIds,
        bookIds,
      })
      expect(remaining).toHaveLength(23)
      expect(remaining.every((count) => count === 0)).toBe(true)
      console.info(
        `reviewed-purchase cleanup complete ${runId}: 23 absence checks clear`,
      )
    }
  })
})
