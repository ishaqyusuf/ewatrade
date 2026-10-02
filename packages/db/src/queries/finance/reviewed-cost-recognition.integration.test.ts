import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinancePurchaseRecognitionStage } from "../../../generated/prisma/enums"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import {
  recognizeFinancePurchase,
  registerFinancePurchase,
} from "./purchase-recognition"
import type { PurchaseCleanupScope } from "./purchase-recognition-cleanup-scope"
import { cleanupPurchaseRecognitionTest } from "./purchase-recognition-test-cleanup"
import { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import { resolveReviewedCostPurchaseSourceInTransaction } from "./reviewed-cost-purchase"
import { readReviewedCostSourceAssemblyInTransaction } from "./reviewed-cost-source-assembly"
import { createFinanceSupplier } from "./supplier-writes"

const day = (value: number) =>
  new Date(`2026-09-${String(value).padStart(2, "0")}T12:00:00Z`)
const options = { maxWait: 10_000, timeout: 30_000 }
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error(
      "Recognition cost-source acceptance requires exact development.",
    )
}

async function cleanupFixture(
  db: PrismaClient,
  input: PurchaseCleanupScope & { receiverUserId?: string },
) {
  // The reusable cleanup proves the agreement user, Tenant, Book and goods.
  // This fixture separately owns its additional receipt user, including on
  // a partial setup failure. No user from another Tenant can be deleted.
  if (input.receiverUserId) {
    const user = await db.user.findUnique({
      where: { id: input.receiverUserId },
      select: { email: true },
    })
    const foreign = await db.membership.count({
      where: {
        userId: input.receiverUserId,
        ...(input.tenantId ? { tenantId: { not: input.tenantId } } : {}),
      },
    })
    if (
      user?.email !==
        `supplier-recognition-receiver-${input.run}@example.invalid` ||
      foreign !== 0
    )
      throw new Error("Refusing foreign receipt-user cleanup")
  }
  await cleanupPurchaseRecognitionTest(db, input)
  if (input.receiverUserId) {
    await db.user.deleteMany({
      where: {
        id: input.receiverUserId,
        email: `supplier-recognition-receiver-${input.run}@example.invalid`,
        memberships: { none: {} },
      },
    })
    expect(await db.user.count({ where: { id: input.receiverUserId } })).toBe(0)
  }
}

describeWithServiceCommerceDatabase("recognized purchase cost source", () => {
  test("proves original dated receipt owners, composes their graph and rolls back changed money/goods/commands", async () => {
    const { prisma: db } = await import("../../client")
    const run = randomUUID()
    const began = Date.now()
    const stage = (label: string) =>
      console.info(`recognition-cost ${run}: ${label}, ${Date.now() - began}ms`)
    console.info(`recognition-cost QA run ${run}`)
    let tenantId: string | undefined
    let actorUserId: string | undefined
    let receiverUserId: string | undefined
    let bookId: string | undefined
    const items: string[] = []
    try {
      const owner = await db.user.create({
        data: {
          name: "Private recognition cost QA",
          email: `supplier-recognition-${run}@example.invalid`,
        },
      })
      actorUserId = owner.id
      const receiver = await db.user.create({
        data: {
          name: "Private recognition receipt QA",
          email: `supplier-recognition-receiver-${run}@example.invalid`,
        },
      })
      receiverUserId = receiver.id
      const tenant = await db.tenant.create({
        data: {
          name: "Private recognition cost QA",
          slug: `supplier-recognition-${run}`,
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          users: {
            create: [
              { userId: owner.id, role: "OWNER", status: "ACTIVE" },
              { userId: receiver.id, role: "ADMIN", status: "ACTIVE" },
            ],
          },
        },
      })
      tenantId = tenant.id
      const actor = { tenantId: tenant.id, actorUserId: owner.id }
      const store = await db.store.create({
        data: {
          tenantId: tenant.id,
          name: "Private recognition cost QA",
          slug: `recognition-cost-${run}`,
          status: "ACTIVE",
        },
      })
      const book = await createFinanceBook(db, { ...actor, startsAt: day(1) })
      bookId = book.id
      const context = { ...actor, bookId: book.id }
      const receiptActor = { ...context, actorUserId: receiver.id }
      const supplier = await createFinanceSupplier(db, {
        ...context,
        clientCommandId: `supplier-${run}`,
        code: "COST",
        name: "Private cost supplier",
      })

      async function goods(label: string, initial = "0") {
        const item = await db.catalogItem.create({
          data: {
            tenantId: tenant.id,
            slug: `recognition-cost-${run}-${label}`,
            kind: "PRODUCT",
            name: "Private source goods",
            product: { create: {} },
            variants: {
              create: { key: "default", name: "Default", isDefault: true },
            },
          },
          include: { product: true, variants: true },
        })
        items.push(item.id)
        const variant = item.variants[0]
        if (!item.product || !variant)
          throw new Error("Missing exact QA goods graph")
        const config = await db.unitConfigurationVersion.create({
          data: {
            productId: item.product.id,
            version: 1,
            status: "CURRENT",
            canonicalBalanceScale: 18,
            units: {
              create: {
                key: "unit",
                name: "unit",
                factor: "1",
                stockBehavior: "CANONICAL_SHARED",
                transactionScale: 0,
              },
            },
          },
          include: { units: true },
        })
        const unit = config.units[0]
        if (!unit) throw new Error("Missing QA unit")
        await db.catalogProduct.update({
          where: { id: item.product.id },
          data: { currentUnitConfigurationVersionId: config.id },
        })
        const balance = await db.stockBalanceSource.create({
          data: {
            tenantId: tenant.id,
            storeId: store.id,
            productId: item.product.id,
            variantId: variant.id,
            inventoryUnitId: unit.id,
            kind: "SHARED_POOL",
            onHandQuantity: initial,
          },
        })
        return {
          balanceSourceId: balance.id,
          enteredInventoryUnitId: unit.id,
          expectedConfigurationVersionId: config.id,
        }
      }
      const knownGoods = await goods("known")
      // Explicit unregistered baseline: direct receipt cost can be proved while
      // complete physical/monetary import authority stays unavailable.
      const unknownGoods = await goods("legacy-unknown", "4")
      const proved: Array<
        Awaited<
          ReturnType<typeof resolveReviewedCostPurchaseSourceInTransaction>
        >
      > = []
      const receipts: string[] = []
      stage("owned setup complete")

      async function original(
        label: string,
        amount: string,
        stages: Array<[FinancePurchaseRecognitionStage, number]>,
        selected = knownGoods,
      ) {
        const agreement = await registerFinancePurchase(db, {
          ...context,
          clientCommandId: `agreement-${label}-${run}`,
          supplierId: supplier.id,
          storeId: store.id,
          description: `Private ${label} acquisition`,
          agreedAt: day(1),
          lines: [
            {
              ...selected,
              description: "Agreed cost",
              amountMinor: amount,
              enteredQuantity: "2",
              categories: [{ name: "Purchase" }],
            },
          ],
        })
        const line = await db.financePurchaseRecognitionLine.findFirstOrThrow({
          where: { recognitionId: agreement.id },
        })
        for (const [kind, date] of stages) {
          const balance = await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: selected.balanceSourceId },
            select: { revision: true },
          })
          await recognizeFinancePurchase(db, {
            ...receiptActor,
            recognitionId: agreement.id,
            clientCommandId: `${label}-${kind}-${run}`,
            stage: kind,
            effectiveAt: day(date),
            reference: `Private ${label} ${kind}`,
            ...(kind === "INVOICE" ? { invoiceAmountMinor: amount } : {}),
            ...(kind === "RECEIPT"
              ? {
                  receipts: [
                    {
                      lineId: line.id,
                      expectedBalanceRevision: balance.revision,
                    },
                  ],
                }
              : {}),
          })
        }
        const receipt = await db.financePurchaseReceiptLine.findUniqueOrThrow({
          where: { billLineId: line.costBillLineId },
        })
        const result = await db.$transaction(
          (tx) =>
            resolveReviewedCostPurchaseSourceInTransaction(tx, {
              ...context,
              receiptId: receipt.id,
              through: day(10),
            }),
          options,
        )
        expect(result.sourceCostMinor.toString()).toBe(amount)
        expect(result.snapshot.bill.actorUserId).toBe(owner.id)
        expect(result.snapshot.operation.actorUserId).toBe(receiver.id)
        expect(result.snapshot.event?.actorUserId).toBe(receiver.id)
        expect(result.snapshot.supplierEntry).toBeNull()
        expect(result.snapshot.bill.kind).toBe("PURCHASE_ACCRUAL")
        expect(result.snapshot.journal?.sourceKind).toBe(
          "PURCHASE_RECEIPT_RECOGNITION",
        )
        return { result, receipt }
      }
      for (const [label, amount, path, credit] of [
        ["receipt-first", "100", [["RECEIPT", 2]], "2050"],
        [
          "invoice-first",
          "300",
          [
            ["INVOICE", 3],
            ["RECEIPT", 4],
          ],
          "1340",
        ],
        [
          "transit-first",
          "500",
          [
            ["OWNERSHIP", 5],
            ["RECEIPT", 6],
          ],
          "1310",
        ],
      ] satisfies Array<
        [
          string,
          string,
          Array<[FinancePurchaseRecognitionStage, number]>,
          string,
        ]
      >) {
        const { result, receipt } = await original(label, amount, path)
        expect(
          result.snapshot.journal?.lines.find((line) => line.creditMinor > 0n)
            ?.account.code,
        ).toBe(credit)
        expect(result.snapshot.event?.effectiveAt.toISOString()).toBe(
          day(path[path.length - 1]?.[1] ?? 0).toISOString(),
        )
        proved.push(result)
        receipts.push(receipt.id)
        stage(`${label} source accepted`)
      }
      const unknown = await original(
        "unknown-prior",
        "700",
        [["RECEIPT", 7]],
        unknownGoods,
      )
      expect(unknown.result.snapshot.event?.valueAfterMinor).toBeNull()
      expect(unknown.result.snapshot.event?.unknownReason).toBe(
        "MISSING_OPENING_COST",
      )
      expect(unknown.result.sourceCostMinor).toBe(700n)
      stage("unknown carrying value preserved")

      const graphInput = {
        ...context,
        balanceSourceIds: [knownGoods.balanceSourceId],
        through: day(10),
      }
      stage("first composed read starts")
      const graph = await db.$transaction(
        (tx) => readReviewedCostSourceAssemblyInTransaction(tx, graphInput),
        options,
      )
      expect(graph.canAssemble).toBe(true)
      expect(graph.blockers).toEqual([])
      expect(graph.assembly?.pools).toHaveLength(1)
      expect(graph.assembly?.nodes).toHaveLength(3)
      expect(
        graph.assembly?.nodes
          .map((node) => node.recordedCostMinor?.toString())
          .sort(),
      ).toEqual(["100", "300", "500"])
      expect(graph.requiresMonetaryProof).toBe(true)
      expect(graph.requiresConfirmationProof).toBe(true)
      stage("complete recognition graph accepted")

      const receiptId = receipts[0]
      if (!receiptId) throw new Error("Missing root receipt")
      // Freeze comparison after all valid commands have advanced Book sequence.
      const root = await db.$transaction(
        (tx) =>
          resolveReviewedCostPurchaseSourceInTransaction(tx, {
            ...context,
            receiptId,
            through: day(10),
          }),
        options,
      )
      const registration = root?.snapshot.recognition?.registrationCommand
      const goodsLine = root?.snapshot.recognition?.goods[0]
      const journalLine = root?.snapshot.journal?.lines.find(
        (line) => line.debitMinor > 0n,
      )
      const posting = root?.snapshot.postingCommand
      const valuation = root?.snapshot.event
      if (
        !root ||
        !receiptId ||
        !registration ||
        !goodsLine ||
        !journalLine ||
        !posting ||
        !valuation
      )
        throw new Error("Missing exact proved receipt source")
      const mutations: Array<
        [string, (tx: Prisma.TransactionClient) => Promise<unknown>]
      > = [
        [
          "missing registration",
          (tx) => tx.financeCommand.delete({ where: { id: registration.id } }),
        ],
        [
          "changed agreed goods",
          (tx) =>
            tx.financePurchaseRecognitionLine.update({
              where: { id: goodsLine.id },
              data: { enteredQuantity: "3" },
            }),
        ],
        [
          "changed receipt cost",
          (tx) =>
            tx.financeInventoryValuationEvent.update({
              where: { id: valuation.id },
              data: { sourceCostMinor: 101n },
            }),
        ],
        [
          "changed original journal",
          (tx) =>
            tx.financeJournalLine.update({
              where: { id: journalLine.id },
              data: { debitMinor: 99n },
            }),
        ],
        [
          "missing receipt posting command",
          (tx) => tx.financeCommand.delete({ where: { id: posting.id } }),
        ],
        [
          "changed receipt actor",
          (tx) =>
            tx.stockOperation.update({
              where: { id: root.snapshot.operation.id },
              data: { actorUserId: owner.id },
            }),
        ],
      ]
      for (const [label, mutate] of mutations) {
        await expect(
          db.$transaction(async (tx) => {
            const held = await ReviewedCostBookContext.acquire(tx, context)
            await mutate(tx)
            await resolveReviewedCostPurchaseSourceInTransaction(
              tx,
              { ...context, receiptId, through: day(10) },
              held,
            )
            throw new Error("Changed original source unexpectedly passed")
          }, options),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        const restored = await db.$transaction(
          (tx) =>
            resolveReviewedCostPurchaseSourceInTransaction(tx, {
              ...context,
              receiptId,
              through: day(10),
            }),
          options,
        )
        expect(restored.sourceSnapshotHash).toBe(root.sourceSnapshotHash)
        stage(`${label} refuses and rolls back`)
      }
      await expect(
        db.$transaction(
          (tx) =>
            resolveReviewedCostPurchaseSourceInTransaction(tx, {
              ...context,
              receiptId,
              through: day(1),
            }),
          options,
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const pool = await db.financeInventoryPool.findUniqueOrThrow({
        where: {
          bookId_balanceSourceId: {
            bookId: book.id,
            balanceSourceId: knownGoods.balanceSourceId,
          },
        },
      })
      expect(pool.quantity.toFixed()).toBe("6")
      expect(pool.valueMinor).toBe(900n)
      const journalLines = await db.financeJournalLine.findMany({
        where: { bookId: book.id },
        include: { account: { select: { code: true } } },
      })
      const controls: Record<string, bigint> = {}
      for (const line of journalLines)
        controls[line.account.code] =
          (controls[line.account.code] ?? 0n) +
          line.debitMinor -
          line.creditMinor
      expect(controls).toMatchObject({
        "1300": 1600n,
        "1310": 0n,
        "1340": 0n,
        "2050": -1300n,
        "2000": -300n,
      })
      expect(
        Object.values(controls).reduce((sum, value) => sum + value, 0n),
      ).toBe(0n)
      expect(
        await db.financeJournalEntry.count({ where: { bookId: book.id } }),
      ).toBe(6)
      expect(
        await db.financePurchaseReceiptLine.count({
          where: { bookId: book.id },
        }),
      ).toBe(4)
      expect(
        await db.stockMovement.count({
          where: { balanceSource: { tenantId: tenant.id } },
        }),
      ).toBe(4)
      stage("source, quantity, value and journal reconciliation complete")
    } finally {
      await cleanupFixture(db, {
        run,
        tenantId,
        actorUserId,
        bookId,
        items,
        receiverUserId,
      })
      stage("17 run-owned cleanup checks clear")
    }
  }, 900_000)
})
