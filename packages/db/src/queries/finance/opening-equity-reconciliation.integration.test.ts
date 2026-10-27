import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { recordFinanceMoneyMovement } from "./money"
import { getFinanceOpeningEquityReconciliation } from "./opening-equity-reconciliation"
import type { PurchaseCleanupScope } from "./purchase-recognition-cleanup-scope"
import { cleanupPurchaseRecognitionTest } from "./purchase-recognition-test-cleanup"
import {
  createFinanceSupplier,
  recordFinanceSupplierOpening,
} from "./supplier-writes"

const startsAt = new Date("2026-01-01T00:00:00.000Z")

describeWithServiceCommerceDatabase("opening equity reconciliation", () => {
  test("each starting-balance source adds up to opening equity; unsupported families stay open", async () => {
    const { prisma: db } = await import("../../client")
    // The purchase cleanup helper owns this naming and deletion scope.
    const state: PurchaseCleanupScope = { run: randomUUID(), items: [] }
    try {
      const user = await db.user.create({
        data: {
          email: `supplier-recognition-${state.run}@example.invalid`,
          name: "Opening equity QA",
        },
      })
      state.actorUserId = user.id
      const tenant = await db.tenant.create({
        data: {
          slug: `supplier-recognition-${state.run}`,
          name: "Opening equity QA",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          currencyCode: "NGN",
          users: {
            create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      })
      state.tenantId = tenant.id
      const actor = { tenantId: tenant.id, actorUserId: user.id }
      const book = await createFinanceBook(db, { ...actor, startsAt })
      state.bookId = book.id
      const context = { ...actor, bookId: book.id }

      const empty = await getFinanceOpeningEquityReconciliation(db, context)
      expect(empty).toMatchObject({
        openingEquityMinor: "0",
        sources: [],
        status: "REVIEW_REQUIRED",
      })
      expect(empty.unsupportedFamilies).toContain("LOANS")

      const bank = await db.financeAccount.findFirstOrThrow({
        where: { bookId: book.id, purpose: "BANK" },
      })
      await recordFinanceMoneyMovement(db, {
        ...context,
        clientCommandId: `opening-bank-${state.run}`,
        kind: "OPENING_BALANCE",
        accountId: bank.id,
        amountMinor: "50000",
        description: "Opening bank",
        effectiveAt: startsAt,
      })
      const supplier = await createFinanceSupplier(db, {
        ...context,
        clientCommandId: `opening-supplier-${state.run}`,
        code: "OPEN",
        name: "Opening supplier",
      })
      for (const [kind, amountMinor] of [
        ["PAYABLE", "500"],
        ["ADVANCE", "400"],
      ] as const)
        await recordFinanceSupplierOpening(db, {
          ...context,
          clientCommandId: `opening-${kind}-${state.run}`,
          supplierId: supplier.id,
          kind,
          amountMinor,
          description: `Opening ${kind.toLowerCase()}`,
          effectiveAt: startsAt,
        })

      expect(
        await getFinanceOpeningEquityReconciliation(db, context),
      ).toMatchObject({
        openingEquityMinor: "49900",
        sources: [
          { sourceKind: "OPENING_BALANCE", netMinor: "50000", expected: true },
          {
            sourceKind: "SUPPLIER_OPENING_ADVANCE",
            netMinor: "400",
            expected: true,
          },
          {
            sourceKind: "SUPPLIER_OPENING_PAYABLE",
            netMinor: "-500",
            expected: true,
          },
        ],
        unexpectedSourceKinds: [],
        openingStock: { knownCount: 0, unknownCostCount: 0 },
        status: "REVIEW_REQUIRED",
      })
      const balance = await db.financeJournalLine.aggregate({
        where: { bookId: book.id, account: { purpose: "OPENING_EQUITY" } },
        _sum: { debitMinor: true, creditMinor: true },
      })
      expect(
        (
          (balance._sum.creditMinor ?? BigInt(0)) -
          (balance._sum.debitMinor ?? BigInt(0))
        ).toString(),
      ).toBe("49900")
    } finally {
      await cleanupPurchaseRecognitionTest(db, state)
    }
  }, 300000)
})
