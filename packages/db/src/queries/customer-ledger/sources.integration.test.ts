import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "../finance/accounts"
import { postCommerceFinanceJournalInTransaction } from "../finance/posting"
import { ensureCustomerLedgerAccount } from "./accounts"
import { releaseCustomerLedgerAllocation } from "./allocation-releases"
import { applyCustomerLedgerCredit } from "./allocations"
import { recordCustomerLedgerOpening } from "./opening"
import { getCustomerLedgerStatement } from "./reads"
import { recordCustomerLedgerReceipt } from "./receipts"
import { listCustomerLedgerSources } from "./sources"

describeWithServiceCommerceDatabase("customer finance source choices", () => {
  test("choices use actual remaining funds, source provenance and current Order state", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const user = await db.user.create({
      data: {
        email: `customer-sources-${runId}@example.invalid`,
        name: "Source choices QA",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `customer-sources-${runId}`,
          name: "Source choices QA",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          users: {
            create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      })
      tenantId = tenant.id
      const actor = { tenantId, actorUserId: user.id }
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: new Date("2026-01-01"),
      })
      bookId = book.id
      const customer = await db.customer.create({
        data: { tenantId, name: "Source choices customer" },
      })
      const account = await ensureCustomerLedgerAccount(db, {
        ...actor,
        customerId: customer.id,
        currencyCode: "NGN",
      })
      const base = { ...actor, bookId, accountId: account.id }
      const cash = await db.financeAccount.findFirstOrThrow({
        where: { bookId, purpose: "CASH" },
      })
      const debt = await recordCustomerLedgerOpening(db, {
        ...base,
        clientCommandId: "debt",
        direction: "DEBT",
        amountMinor: "10000",
        reason: "Verified opening",
      })
      const credit = await recordCustomerLedgerOpening(db, {
        ...base,
        clientCommandId: "credit",
        direction: "CREDIT",
        amountMinor: "3000",
        reason: "Verified held credit",
      })
      const receipt = await recordCustomerLedgerReceipt(db, {
        ...base,
        clientCommandId: "receipt",
        moneyAccountId: cash.id,
        method: "CASH",
        amountMinor: "5000",
        description: "Actual deposit",
      })
      const receiptSource = await db.customerLedgerReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      })
      const allocation = await applyCustomerLedgerCredit(db, {
        ...base,
        clientCommandId: "allocate",
        expectedRevision: "3",
        creditEntryId: receiptSource.entryId,
        chargeEntryId: debt.id,
        amountMinor: "4000",
      })
      await releaseCustomerLedgerAllocation(db, {
        ...base,
        clientCommandId: "release",
        expectedRevision: "4",
        allocationId: allocation.id,
        amountMinor: "1500",
        reason: "Reduce settlement",
      })
      const sourceInput = { ...actor, accountId: account.id }
      const first = await listCustomerLedgerSources(db, {
        ...sourceInput,
        side: "CREDIT",
        limit: 1,
      })
      expect(first.currentRevision).toBe("5")
      expect(
        first.sources.map((source) => [source.id, source.remainingAmountMinor]),
      ).toEqual([[credit.id, "3000"]])
      expect(first.nextCursor).toBe("2")
      const next = await listCustomerLedgerSources(db, {
        ...sourceInput,
        side: "CREDIT",
        limit: 1,
        afterSequence: first.nextCursor ?? undefined,
        expectedRevision: first.currentRevision,
      })
      expect(
        next.sources.map((source) => [
          source.id,
          source.usedAmountMinor,
          source.remainingAmountMinor,
        ]),
      ).toEqual([[receiptSource.entryId, "2500", "2500"]])
      expect(next.nextCursor).toBe(null)
      expect(
        (await listCustomerLedgerSources(db, { ...sourceInput, side: "DEBIT" }))
          .sources[0]?.remainingAmountMinor,
      ).toBe("7500")
      await expect(
        listCustomerLedgerSources(db, {
          ...sourceInput,
          side: "CREDIT",
          afterSequence: "2",
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        getCustomerLedgerStatement(db, { ...sourceInput, afterSequence: "1" }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      const pinned = await getCustomerLedgerStatement(db, {
        ...sourceInput,
        snapshotSequence: "5",
        limit: 1,
      })
      expect(pinned.entries[0]?.actorUserId).toBe(user.id)
      expect(pinned.entries[0]?.reversalOfId).toBe(null)
      await applyCustomerLedgerCredit(db, {
        ...base,
        clientCommandId: "exhaust-credit",
        expectedRevision: "5",
        creditEntryId: credit.id,
        chargeEntryId: debt.id,
        amountMinor: "3000",
      })
      await expect(
        listCustomerLedgerSources(db, {
          ...sourceInput,
          side: "CREDIT",
          afterSequence: "2",
          expectedRevision: "5",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(
        (
          await listCustomerLedgerSources(db, {
            ...sourceInput,
            side: "CREDIT",
          })
        ).sources.map((source) => source.id),
      ).toEqual([receiptSource.entryId])
      // Synthetic orphan entry proves a ledger row alone cannot authorize returning money.
      await db.$transaction(async (tx) => {
        const current = await tx.customerLedgerAccount.update({
          where: { id: account.id },
          data: { revision: { increment: 1 }, lastSequence: { increment: 1 } },
        })
        await tx.customerLedgerEntry.create({
          data: {
            tenantId: tenant.id,
            accountId: account.id,
            sequence: current.lastSequence,
            kind: "RECEIPT",
            side: "CREDIT",
            amountMinor: BigInt(99),
            sourceKind: "CUSTOMER_RECEIPT",
            sourceId: `unbacked-${runId}`,
            effectiveAt: new Date(),
            actorUserId: user.id,
            description: "Synthetic missing source",
          },
        })
      })
      expect(
        (
          await listCustomerLedgerSources(db, {
            ...sourceInput,
            side: "CREDIT",
          })
        ).sources.map((source) => source.id),
      ).toEqual([receiptSource.entryId])
      const store = await db.store.create({
        data: {
          tenantId,
          name: "Source choices Store",
          slug: "source-choices",
          status: "ACTIVE",
        },
      })
      const order = await db.commercialOrder.create({
        data: {
          tenantId,
          customerId: customer.id,
          storeId: store.id,
          clientOrderId: runId,
          payloadHash: "source-choice-fixture",
          orderNumber: "QA-SOURCES",
          currencyCode: "NGN",
          subtotalMinor: 9000,
          totalMinor: 9000,
          createdByUserId: user.id,
        },
      })
      await db.$transaction((tx) =>
        postCommerceFinanceJournalInTransaction(tx, {
          tenantId: tenant.id,
          orderId: order.id,
          event: "BILLED",
        }),
      )
      const choices = await listCustomerLedgerSources(db, {
        ...sourceInput,
        side: "DEBIT",
      })
      expect(
        choices.sources.find((source) => source.order?.id === order.id)
          ?.remainingAmountMinor,
      ).toBe("9000")
      expect(
        choices.sources.find((source) => source.order?.id === order.id)?.order
          ?.status,
      ).toBe("CONFIRMED")
      await db.commercialOrder.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      })
      expect(
        (
          await listCustomerLedgerSources(db, { ...sourceInput, side: "DEBIT" })
        ).sources.some((source) => source.order?.id === order.id),
      ).toBe(false)
      expect(
        (
          await getCustomerLedgerStatement(db, {
            ...sourceInput,
            snapshotSequence: "5",
          })
        ).totals,
      ).toEqual(pinned.totals)
    } finally {
      if (tenantId) {
        await db.$transaction(async (tx) => {
          await tx.customerLedgerAllocationRelease.deleteMany({
            where: { allocation: { credit: { tenantId } } },
          })
          await tx.customerLedgerAllocation.deleteMany({
            where: { credit: { tenantId } },
          })
          await tx.customerLedgerReceipt.deleteMany({
            where: { entry: { tenantId } },
          })
          await tx.customerLedgerCommand.deleteMany({ where: { tenantId } })
          await tx.customerLedgerEntry.deleteMany({ where: { tenantId } })
          await tx.customerLedgerAccount.deleteMany({ where: { tenantId } })
          if (bookId) {
            await tx.financeCommand.deleteMany({ where: { bookId } })
            await tx.financeJournalLine.deleteMany({ where: { bookId } })
            await tx.financeJournalEntry.deleteMany({ where: { bookId } })
            await tx.financeAccount.deleteMany({ where: { bookId } })
            await tx.financeBook.delete({ where: { id: bookId } })
          }
          await tx.commercialOrder.deleteMany({ where: { tenantId } })
          await tx.tenant.delete({ where: { id: tenantId } })
        })
      }
      await db.user.delete({ where: { id: user.id } })
    }
  }, 180_000)
})
