import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "../finance/accounts"
import { getFinanceAccountBalances } from "../finance/reads"
import { getFinanceReports } from "../finance/reports"
import { financePayloadHash } from "../finance/rules"
import { ensureCustomerLedgerAccount } from "./accounts"
import { releaseCustomerLedgerAllocation } from "./allocation-releases"
import { applyCustomerLedgerCredit } from "./allocations"
import { getCustomerLedgerEntryDetail } from "./entry-reads"
import { recordCustomerLedgerOpening } from "./opening"
import { getCustomerLedgerStatement } from "./reads"
import { recordCustomerLedgerReceipt } from "./receipts"
import { refundCustomerLedgerCredit } from "./refunds"
import { reverseCustomerLedgerEntry } from "./reversals"

describeWithServiceCommerceDatabase("customer ledger full corrections", () => {
  test("reverses supported sources atomically and preserves prior controls", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const user = await db.user.create({
      data: {
        name: "Customer correction QA",
        email: `customer-correction-${runId}@example.invalid`,
      },
    })
    const member = await db.user.create({
      data: {
        name: "Customer correction member QA",
        email: `customer-correction-member-${runId}@example.invalid`,
      },
    })
    let cleanupTenantId: string | undefined
    let cleanupBookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          name: "Customer correction QA",
          slug: `customer-correction-${runId}`,
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          users: {
            create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      })
      const tenantId = tenant.id
      cleanupTenantId = tenant.id
      await db.membership.create({
        data: {
          tenantId,
          userId: member.id,
          role: "MANAGER",
          status: "ACTIVE",
        },
      })
      const actor = { tenantId, actorUserId: user.id }
      const startsAt = new Date("2026-01-01T00:00:00.000Z")
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt,
      })
      const bookId = book.id
      cleanupBookId = book.id
      const cash = await db.financeAccount.findFirstOrThrow({
        where: { bookId, purpose: "CASH" },
      })
      const statement = (accountId: string, snapshotSequence?: string) =>
        getCustomerLedgerStatement(db, {
          ...actor,
          accountId,
          snapshotSequence,
        })
      const accountFor = async (name: string) => {
        const customer = await db.customer.create({
          data: { tenantId, name },
        })
        return ensureCustomerLedgerAccount(db, {
          ...actor,
          customerId: customer.id,
          currencyCode: "NGN",
        })
      }
      const reverseInput = (
        accountId: string,
        entryId: string,
        expectedRevision: string,
        clientCommandId: string,
        effectiveAt = new Date(),
      ) => ({
        ...actor,
        bookId,
        accountId,
        entryId,
        expectedRevision,
        clientCommandId,
        reason: "Verified source correction",
        effectiveAt,
      })

      // A full opening-debt reversal removes receivable/equity controls and
      // leaves the original sequence available as an immutable snapshot.
      const debtAccount = await accountFor("Reversed opening debt")
      const openingDebt = await recordCustomerLedgerOpening(db, {
        ...actor,
        bookId,
        accountId: debtAccount.id,
        direction: "DEBT",
        amountMinor: "5000",
        reason: "Verified starting receivable",
        clientCommandId: `debt-opening-${runId}`,
      })
      const debtBefore = await statement(debtAccount.id)
      expect(debtBefore.snapshotSequence).toBe("1")
      expect(debtBefore.totals.outstandingDebtMinor).toBe("5000")
      const debtCorrection = reverseInput(
        debtAccount.id,
        openingDebt.id,
        "1",
        `debt-reversal-${runId}`,
      )
      await expect(
        reverseCustomerLedgerEntry(db, {
          ...debtCorrection,
          expectedRevision: "0",
          clientCommandId: `debt-stale-${runId}`,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        reverseCustomerLedgerEntry(db, {
          ...debtCorrection,
          effectiveAt: new Date(Date.now() + 60_000),
          clientCommandId: `debt-future-${runId}`,
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        reverseCustomerLedgerEntry(db, {
          ...debtCorrection,
          effectiveAt: new Date("2025-12-31T23:59:59.999Z"),
          clientCommandId: `debt-backdated-${runId}`,
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        reverseCustomerLedgerEntry(db, {
          ...debtCorrection,
          tenantId: "another-tenant",
          clientCommandId: `debt-other-tenant-${runId}`,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        reverseCustomerLedgerEntry(db, {
          ...debtCorrection,
          actorUserId: member.id,
          clientCommandId: `debt-non-manager-${runId}`,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await db.financeBook.update({
        where: { id: bookId },
        data: { closedThrough: new Date(Date.now() + 60_000) },
      })
      await expect(
        reverseCustomerLedgerEntry(db, debtCorrection),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect((await statement(debtAccount.id)).snapshotSequence).toBe("1")
      await db.financeBook.update({
        where: { id: bookId },
        data: { closedThrough: null },
      })
      const debtReversal = await reverseCustomerLedgerEntry(db, debtCorrection)
      const debtReversalEntry = await db.customerLedgerEntry.findUniqueOrThrow({
        where: { reversalOfId: openingDebt.id },
      })
      expect(debtReversalEntry.id).toBe(debtReversal.id)
      expect(debtReversalEntry.sequence).toBe(BigInt(2))
      expect(debtReversalEntry.kind).toBe("REVERSAL")
      expect(debtReversalEntry.side).toBe("CREDIT")
      expect(debtReversalEntry.amountMinor).toBe(BigInt(5000))
      const afterDebt = await statement(debtAccount.id)
      expect(afterDebt.totals).toMatchObject({
        debitMinor: "5000",
        creditMinor: "5000",
        allocatedMinor: "5000",
        outstandingDebtMinor: "0",
        availableCreditMinor: "0",
        netBalanceMinor: "0",
      })
      expect((await statement(debtAccount.id, "1")).totals).toEqual(
        debtBefore.totals,
      )
      await expect(
        reverseCustomerLedgerEntry(db, {
          ...debtCorrection,
          clientCommandId: `duplicate-debt-reversal-${runId}`,
          expectedRevision: "2",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(
        reverseCustomerLedgerEntry(
          db,
          reverseInput(
            debtAccount.id,
            debtReversal.id,
            "2",
            `reverse-reversal-${runId}`,
          ),
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      const openingDebtBalances = await getFinanceAccountBalances(db, {
        ...actor,
        bookId,
      })
      expect(
        openingDebtBalances.accounts.find((row) => row.purpose === "RECEIVABLE")
          ?.balanceMinor,
      ).toBe("0")
      expect(
        openingDebtBalances.accounts.find(
          (row) => row.purpose === "OPENING_EQUITY",
        )?.balanceMinor,
      ).toBe("0")

      // Retrying an already committed identity recovers before rechecking the
      // now-stale current revision or a subsequently closed period. The saved
      // command payload, including its reviewed revision, remains immutable.
      await recordCustomerLedgerReceipt(db, {
        ...actor,
        bookId,
        accountId: debtAccount.id,
        moneyAccountId: cash.id,
        method: "CASH",
        amountMinor: "100",
        description: "Post-reversal retry state",
        clientCommandId: `debt-followup-receipt-${runId}`,
      })
      await db.financeBook.update({
        where: { id: bookId },
        data: { closedThrough: new Date(Date.now() + 60_000) },
      })
      const replay = await reverseCustomerLedgerEntry(db, debtCorrection)
      expect(replay).toEqual(debtReversal)
      await expect(
        reverseCustomerLedgerEntry(db, {
          ...debtCorrection,
          reason: "Changed retry reason",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        reverseCustomerLedgerEntry(db, {
          ...debtCorrection,
          expectedRevision: "3",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await db.financeBook.update({
        where: { id: bookId },
        data: { closedThrough: null },
      })

      // A full opening-credit reversal zeros advance/equity controls without
      // a money movement.
      const creditAccount = await accountFor("Reversed opening credit")
      const openingCredit = await recordCustomerLedgerOpening(db, {
        ...actor,
        bookId,
        accountId: creditAccount.id,
        direction: "CREDIT",
        amountMinor: "3000",
        reason: "Verified held opening funds",
        clientCommandId: `credit-opening-${runId}`,
      })
      const creditBefore = await statement(creditAccount.id)
      const creditReversal = await reverseCustomerLedgerEntry(
        db,
        reverseInput(
          creditAccount.id,
          openingCredit.id,
          "1",
          `credit-reversal-${runId}`,
        ),
      )
      expect(
        (
          await db.customerLedgerEntry.findUniqueOrThrow({
            where: { id: creditReversal.id },
          })
        ).reversalOfId,
      ).toBe(openingCredit.id)
      const afterCredit = await statement(creditAccount.id)
      expect(afterCredit.snapshotSequence).toBe("2")
      expect(afterCredit.totals).toMatchObject({
        debitMinor: "3000",
        creditMinor: "3000",
        allocatedMinor: "3000",
        outstandingDebtMinor: "0",
        availableCreditMinor: "0",
        netBalanceMinor: "0",
      })
      expect((await statement(creditAccount.id, "1")).totals).toEqual(
        creditBefore.totals,
      )
      const openingCreditBalances = await getFinanceAccountBalances(db, {
        ...actor,
        bookId,
      })
      expect(
        openingCreditBalances.accounts.find(
          (row) => row.purpose === "CUSTOMER_ADVANCE",
        )?.balanceMinor,
      ).toBe("100")
      expect(
        openingCreditBalances.accounts.find(
          (row) => row.purpose === "OPENING_EQUITY",
        )?.balanceMinor,
      ).toBe("0")

      // A receipt cannot be reversed while it is actively allocated. Once a
      // manager explicitly releases the settlement, the exact full receipt
      // amount is reversed, without changing the original debt.
      const receiptAccount = await accountFor("Receipt reversal")
      const receiptDebt = await recordCustomerLedgerOpening(db, {
        ...actor,
        bookId,
        accountId: receiptAccount.id,
        direction: "DEBT",
        amountMinor: "5000",
        reason: "Verified debt to settle",
        clientCommandId: `receipt-debt-${runId}`,
      })
      const receipt = await recordCustomerLedgerReceipt(db, {
        ...actor,
        bookId,
        accountId: receiptAccount.id,
        moneyAccountId: cash.id,
        method: "CASH",
        amountMinor: "3000",
        description: "Receipt to correct",
        clientCommandId: `receipt-for-reversal-${runId}`,
      })
      const receiptRecord = await db.customerLedgerReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      })
      const allocation = await applyCustomerLedgerCredit(db, {
        ...actor,
        bookId,
        accountId: receiptAccount.id,
        clientCommandId: `receipt-allocation-${runId}`,
        expectedRevision: "2",
        creditEntryId: receiptRecord.entryId,
        chargeEntryId: receiptDebt.id,
        amountMinor: "1000",
      })
      const receiptCurrent = await db.customerLedgerAccount.findUniqueOrThrow({
        where: { id: receiptAccount.id },
        select: { revision: true },
      })
      const receiptReversalInput = reverseInput(
        receiptAccount.id,
        receiptRecord.entryId,
        receiptCurrent.revision.toString(),
        `receipt-reversal-${runId}`,
      )
      await expect(
        reverseCustomerLedgerEntry(db, receiptReversalInput),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const release = await releaseCustomerLedgerAllocation(db, {
        ...actor,
        bookId,
        accountId: receiptAccount.id,
        clientCommandId: `receipt-release-${runId}`,
        expectedRevision: receiptCurrent.revision.toString(),
        allocationId: allocation.id,
        amountMinor: "1000",
        reason: "Explicitly release before correcting receipt",
      })
      const receiptSourceEntry = await db.customerLedgerEntry.findUniqueOrThrow(
        {
          where: { id: receiptRecord.entryId },
        },
      )
      const releaseJournal = await db.financeJournalEntry.findUniqueOrThrow({
        where: {
          bookId_sourceKind_sourceId: {
            bookId,
            sourceKind: "CUSTOMER_ALLOCATION_RELEASE",
            sourceId: release.id,
          },
        },
      })
      const backdatedReleaseCorrection = new Date(
        releaseJournal.effectiveAt.getTime() - 1,
      )
      expect(backdatedReleaseCorrection.getTime()).toBeGreaterThanOrEqual(
        receiptSourceEntry.effectiveAt.getTime(),
      )
      const receiptAfterRelease =
        await db.customerLedgerAccount.findUniqueOrThrow({
          where: { id: receiptAccount.id },
          select: { revision: true },
        })
      await expect(
        reverseCustomerLedgerEntry(
          db,
          reverseInput(
            receiptAccount.id,
            receiptRecord.entryId,
            receiptAfterRelease.revision.toString(),
            `receipt-before-release-date-${runId}`,
            backdatedReleaseCorrection,
          ),
        ),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      const receiptPinned = await statement(receiptAccount.id)
      const receiptReversal = await reverseCustomerLedgerEntry(
        db,
        reverseInput(
          receiptAccount.id,
          receiptRecord.entryId,
          receiptAfterRelease.revision.toString(),
          `receipt-reversal-${runId}`,
        ),
      )
      const afterReceiptReverse = await statement(receiptAccount.id)
      expect(afterReceiptReverse.totals.outstandingDebtMinor).toBe("5000")
      expect(afterReceiptReverse.totals.availableCreditMinor).toBe("0")
      expect(
        (await statement(receiptAccount.id, receiptPinned.snapshotSequence))
          .totals,
      ).toEqual(receiptPinned.totals)
      expect(
        (
          await db.customerLedgerEntry.findUniqueOrThrow({
            where: { id: receiptReversal.id },
          })
        ).reversalOfId,
      ).toBe(receiptRecord.entryId)
      const receiptAfterReverseState =
        await db.customerLedgerAccount.findUniqueOrThrow({
          where: { id: receiptAccount.id },
          select: { revision: true },
        })
      const receiptCorrectionDetail = await getCustomerLedgerEntryDetail(db, {
        ...actor,
        accountId: receiptAccount.id,
        entryId: receiptRecord.entryId,
        expectedRevision: receiptAfterReverseState.revision.toString(),
      })
      expect(receiptCorrectionDetail.entry.sequence).toBe("2")
      expect(receiptCorrectionDetail.entry.amountMinor).toBe("3000")
      expect(receiptCorrectionDetail.receipt).toMatchObject({
        id: receipt.id,
        moneyAccountId: cash.id,
        method: "CASH",
      })
      expect(receiptCorrectionDetail.reversal?.id).toBe(receiptReversal.id)
      await expect(
        getCustomerLedgerEntryDetail(db, {
          ...actor,
          accountId: debtAccount.id,
          entryId: receiptRecord.entryId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })

      // Refund reversal releases the original settlement and bridges the new
      // credit to the refund debit at one sequence: debt stays fixed and held
      // credit rises by exactly the payout amount.
      const refundAccount = await accountFor("Held payout reversal")
      const refundReceipt = await recordCustomerLedgerReceipt(db, {
        ...actor,
        bookId,
        accountId: refundAccount.id,
        moneyAccountId: cash.id,
        method: "CASH",
        amountMinor: "3000",
        description: "Held funds for payout correction",
        clientCommandId: `refund-source-${runId}`,
      })
      const refundCredit = await db.customerLedgerReceipt.findUniqueOrThrow({
        where: { id: refundReceipt.id },
      })
      const refundInput = {
        ...actor,
        bookId,
        accountId: refundAccount.id,
        clientCommandId: `held-refund-${runId}`,
        expectedRevision: "1",
        creditEntryId: refundCredit.entryId,
        amountMinor: "1000",
        moneyAccountId: cash.id,
        method: "CASH" as const,
        reason: "Return held funds",
        effectiveAt: new Date(),
      }
      const refund = await refundCustomerLedgerCredit(db, refundInput)
      const refundBeforeEntry = await db.customerLedgerEntry.findUniqueOrThrow({
        where: { id: refund.id },
      })
      const refundBefore = await statement(refundAccount.id)
      expect(refundBefore.totals.outstandingDebtMinor).toBe("0")
      expect(refundBefore.totals.availableCreditMinor).toBe("2000")
      const refundDetailBefore = await getCustomerLedgerEntryDetail(db, {
        ...actor,
        accountId: refundAccount.id,
        entryId: refund.id,
        expectedRevision: "2",
      })
      expect(refundDetailBefore.entry.amountMinor).toBe("1000")
      expect(refundDetailBefore.entry.sequence).toBe("2")
      expect(refundDetailBefore.reversal).toBe(null)
      expect(refundDetailBefore.usedAmountMinor).toBe("1000")
      expect(refundDetailBefore.remainingAmountMinor).toBe("0")
      expect(refundDetailBefore.allocations).toHaveLength(1)
      await expect(
        getCustomerLedgerEntryDetail(db, {
          ...actor,
          accountId: refundAccount.id,
          entryId: refund.id,
          afterAllocationId: "a-cursor-without-reviewed-revision",
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      const refundCorrection = await reverseCustomerLedgerEntry(
        db,
        reverseInput(
          refundAccount.id,
          refund.id,
          "2",
          `refund-reversal-${runId}`,
        ),
      )
      const refundAfterEntry = await db.customerLedgerEntry.findUniqueOrThrow({
        where: { id: refund.id },
      })
      expect(refundAfterEntry).toEqual(refundBeforeEntry)
      const refundReversalEntry =
        await db.customerLedgerEntry.findUniqueOrThrow({
          where: { id: refundCorrection.id },
        })
      expect(refundReversalEntry.reversalOfId).toBe(refund.id)
      expect(refundReversalEntry.sequence).toBe(BigInt(3))
      const refundDetailAfter = await getCustomerLedgerEntryDetail(db, {
        ...actor,
        accountId: refundAccount.id,
        entryId: refund.id,
        expectedRevision: "3",
        limit: 1,
      })
      expect(refundDetailAfter.entry.sequence).toBe("2")
      expect(refundDetailAfter.entry.amountMinor).toBe("1000")
      expect(refundDetailAfter.reversal).toMatchObject({
        id: refundCorrection.id,
        sequence: "3",
        amountMinor: "1000",
        reversalOfId: refund.id,
      })
      expect(refundDetailAfter.usedAmountMinor).toBe("1000")
      expect(refundDetailAfter.remainingAmountMinor).toBe("0")
      expect(refundDetailAfter.reconciliationRequired).toBe(false)
      expect(refundDetailAfter.allocations).toHaveLength(1)
      expect(refundDetailAfter.nextCursor).not.toBe(null)
      const refundDetailPageTwo = await getCustomerLedgerEntryDetail(db, {
        ...actor,
        accountId: refundAccount.id,
        entryId: refund.id,
        expectedRevision: "3",
        afterAllocationId: refundDetailAfter.nextCursor ?? undefined,
        limit: 1,
      })
      expect(refundDetailPageTwo.allocations).toHaveLength(1)
      expect(refundDetailPageTwo.nextCursor).toBe(null)
      const refundDetailAllocations = [
        ...refundDetailAfter.allocations,
        ...refundDetailPageTwo.allocations,
      ]
      expect(
        refundDetailAllocations
          .map((row) => [
            row.amountMinor,
            row.releasedAmountMinor,
            row.remainingAmountMinor,
          ])
          .sort(),
      ).toEqual(
        [
          ["1000", "0", "1000"],
          ["1000", "1000", "0"],
        ].sort(),
      )
      await expect(
        getCustomerLedgerEntryDetail(db, {
          ...actor,
          accountId: refundAccount.id,
          entryId: refund.id,
          expectedRevision: "2",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const releasedRefundAllocation =
        await db.customerLedgerAllocationRelease.findFirstOrThrow({
          where: {
            allocation: {
              accountId: refundAccount.id,
              creditEntryId: refundCredit.entryId,
              chargeEntryId: refund.id,
            },
          },
        })
      const refundAllocations = await db.customerLedgerAllocation.findMany({
        where: {
          accountId: refundAccount.id,
          OR: [
            { creditEntryId: refundCredit.entryId, chargeEntryId: refund.id },
            { creditEntryId: refundCorrection.id, chargeEntryId: refund.id },
          ],
        },
      })
      expect(refundAllocations).toHaveLength(2)
      expect(
        refundAllocations.every((row) => row.amountMinor === BigInt(1000)),
      ).toBe(true)
      expect(
        refundAllocations.find(
          (row) => row.creditEntryId === refundCredit.entryId,
        )?.sequence,
      ).toBe(BigInt(2))
      expect(
        refundAllocations.find(
          (row) => row.creditEntryId === refundCorrection.id,
        )?.sequence,
      ).toBe(BigInt(3))
      expect(releasedRefundAllocation.sequence).toBe(BigInt(3))
      expect(releasedRefundAllocation.amountMinor).toBe(BigInt(1000))
      const refundAfter = await statement(refundAccount.id)
      expect(refundAfter.snapshotSequence).toBe("3")
      expect(refundAfter.totals).toMatchObject({
        debitMinor: "1000",
        creditMinor: "4000",
        allocatedMinor: "1000",
        outstandingDebtMinor: "0",
        availableCreditMinor: "3000",
        netBalanceMinor: "-3000",
      })
      expect((await statement(refundAccount.id, "2")).totals).toEqual(
        refundBefore.totals,
      )
      const refundBalances = await getFinanceAccountBalances(db, {
        ...actor,
        bookId,
      })
      expect(
        refundBalances.accounts.find((row) => row.purpose === "CASH")
          ?.balanceMinor,
      ).toBe("3100")
      expect(
        refundBalances.accounts.find(
          (row) => row.purpose === "CUSTOMER_ADVANCE",
        )?.balanceMinor,
      ).toBe("3100")
      const report = await getFinanceReports(db, {
        ...actor,
        bookId,
        from: new Date("2026-01-01T00:00:00.000Z"),
        through: new Date(Date.now() + 60_000),
      })
      expect(report.cashFlow.reconciled).toBe(true)
      expect(report.cashFlow.operatingMinor).toBe("3100")
      expect(
        report.cashFlow.groups.find(
          (row) => row.sourceKind === "CUSTOMER_HELD_CREDIT_REFUND",
        ),
      ).toMatchObject({ netMinor: "0", category: "OPERATING" })

      // The original receipt can now be reversed because the refund
      // correction released the refund's receipt allocation in its own
      // correction sequence. This removes the remaining receipt cash/advance
      // controls while the refund correction's historical snapshot stays put.
      const refundReceiptBeforeReverse =
        await db.customerLedgerEntry.findUniqueOrThrow({
          where: { id: refundCredit.entryId },
        })
      const refundAccountState =
        await db.customerLedgerAccount.findUniqueOrThrow({
          where: { id: refundAccount.id },
          select: { revision: true },
        })
      const refundReceiptReversal = await reverseCustomerLedgerEntry(
        db,
        reverseInput(
          refundAccount.id,
          refundCredit.entryId,
          refundAccountState.revision.toString(),
          `refund-receipt-reversal-${runId}`,
        ),
      )
      expect(
        await db.customerLedgerEntry.findUniqueOrThrow({
          where: { id: refundCredit.entryId },
        }),
      ).toEqual(refundReceiptBeforeReverse)
      const afterReceiptRefundChain = await statement(refundAccount.id)
      expect(afterReceiptRefundChain.snapshotSequence).toBe("4")
      expect(afterReceiptRefundChain.totals).toMatchObject({
        debitMinor: "4000",
        creditMinor: "4000",
        allocatedMinor: "4000",
        outstandingDebtMinor: "0",
        availableCreditMinor: "0",
        netBalanceMinor: "0",
      })
      expect((await statement(refundAccount.id, "3")).totals).toEqual(
        refundAfter.totals,
      )
      expect(
        (
          await db.customerLedgerEntry.findUniqueOrThrow({
            where: { id: refundReceiptReversal.id },
          })
        ).reversalOfId,
      ).toBe(refundCredit.entryId)
      const closedChainBalances = await getFinanceAccountBalances(db, {
        ...actor,
        bookId,
      })
      expect(
        closedChainBalances.accounts.find((row) => row.purpose === "CASH")
          ?.balanceMinor,
      ).toBe("100")
      expect(
        closedChainBalances.accounts.find(
          (row) => row.purpose === "CUSTOMER_ADVANCE",
        )?.balanceMinor,
      ).toBe("100")
      const finalReport = await getFinanceReports(db, {
        ...actor,
        bookId,
        from: new Date("2026-01-01T00:00:00.000Z"),
        through: new Date(Date.now() + 60_000),
      })
      expect(finalReport.cashFlow.reconciled).toBe(true)
      expect(finalReport.cashFlow.operatingMinor).toBe("100")
      expect(
        finalReport.cashFlow.groups.find(
          (row) => row.sourceKind === "CUSTOMER_RECEIPT",
        ),
      ).toMatchObject({ netMinor: "100", category: "OPERATING" })
      expect(
        finalReport.cashFlow.groups.find(
          (row) => row.sourceKind === "CUSTOMER_HELD_CREDIT_REFUND",
        ),
      ).toMatchObject({ netMinor: "0", category: "OPERATING" })

      // Both conflicting writers review the same revision. The account lock,
      // source reversal uniqueness and command identity permit one winner.
      const competingAccount = await accountFor("Competing reversal")
      const competingSource = await recordCustomerLedgerOpening(db, {
        ...actor,
        bookId,
        accountId: competingAccount.id,
        direction: "DEBT",
        amountMinor: "700",
        reason: "Competing correction source",
        clientCommandId: `competing-opening-${runId}`,
      })
      const competing = await Promise.allSettled(
        ["one", "two"].map((suffix) =>
          reverseCustomerLedgerEntry(
            db,
            reverseInput(
              competingAccount.id,
              competingSource.id,
              "1",
              `competing-reversal-${suffix}-${runId}`,
            ),
          ),
        ),
      )
      expect(
        competing.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1)
      expect(
        competing.filter((result) => result.status === "rejected"),
      ).toHaveLength(1)
      expect(
        await db.customerLedgerEntry.count({
          where: {
            accountId: competingAccount.id,
            reversalOfId: competingSource.id,
          },
        }),
      ).toBe(1)

      // Unsupported order charges, order-refund-shaped entries, and orphaned
      // or mismatched source journals are not reversible posting sources.
      const fakeOrderAccount = await accountFor("Unsupported order charge")
      await db.customerLedgerAccount.update({
        where: { id: fakeOrderAccount.id },
        data: { lastSequence: BigInt(1), revision: BigInt(1) },
      })
      const fakeOrderCharge = await db.customerLedgerEntry.create({
        data: {
          tenantId,
          accountId: fakeOrderAccount.id,
          sequence: BigInt(1),
          kind: "ORDER_CHARGE",
          side: "DEBIT",
          amountMinor: BigInt(500),
          sourceKind: "COMMERCIAL_ORDER_BILLED",
          sourceId: randomUUID(),
          actorUserId: user.id,
          effectiveAt: startsAt,
          description: "Unposted unsupported fixture",
        },
      })
      await expect(
        reverseCustomerLedgerEntry(
          db,
          reverseInput(
            fakeOrderAccount.id,
            fakeOrderCharge.id,
            "1",
            `unsupported-order-${runId}`,
          ),
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })

      const fakeOrderRefundAccount = await accountFor(
        "Order refund source mismatch",
      )
      await db.customerLedgerAccount.update({
        where: { id: fakeOrderRefundAccount.id },
        data: { lastSequence: BigInt(1), revision: BigInt(1) },
      })
      const fakeOrderRefund = await db.customerLedgerEntry.create({
        data: {
          tenantId,
          accountId: fakeOrderRefundAccount.id,
          sequence: BigInt(1),
          kind: "REFUND",
          side: "DEBIT",
          amountMinor: BigInt(500),
          sourceKind: "COMMERCIAL_ORDER_REFUND",
          sourceId: randomUUID(),
          actorUserId: user.id,
          effectiveAt: new Date(),
          description: "Unsupported commerce refund fixture",
        },
      })
      await expect(
        reverseCustomerLedgerEntry(
          db,
          reverseInput(
            fakeOrderRefundAccount.id,
            fakeOrderRefund.id,
            "1",
            `unsupported-order-refund-${runId}`,
          ),
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" })

      const orphanAccount = await accountFor("Orphan opening journal")
      await db.customerLedgerAccount.update({
        where: { id: orphanAccount.id },
        data: { lastSequence: BigInt(1), revision: BigInt(1) },
      })
      const orphanDebt = await db.customerLedgerEntry.create({
        data: {
          tenantId,
          accountId: orphanAccount.id,
          sequence: BigInt(1),
          kind: "OPENING_DEBT",
          side: "DEBIT",
          amountMinor: BigInt(500),
          sourceKind: "CUSTOMER_OPENING",
          sourceId: `${orphanAccount.id}:DEBT`,
          actorUserId: user.id,
          effectiveAt: startsAt,
          description: "Opening subledger without journal",
        },
      })
      await expect(
        reverseCustomerLedgerEntry(
          db,
          reverseInput(
            orphanAccount.id,
            orphanDebt.id,
            "1",
            `orphan-reversal-${runId}`,
          ),
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" })

      const mismatchAccount = await accountFor("Mismatched opening journal")
      const mismatchDebt = await recordCustomerLedgerOpening(db, {
        ...actor,
        bookId,
        accountId: mismatchAccount.id,
        direction: "DEBT",
        amountMinor: "500",
        reason: "Journal will be intentionally mismatched",
        clientCommandId: `mismatch-opening-${runId}`,
      })
      const sourceJournal = await db.financeJournalEntry.findUniqueOrThrow({
        where: {
          bookId_sourceKind_sourceId: {
            bookId,
            sourceKind: "CUSTOMER_LEDGER_OPENING",
            sourceId: mismatchDebt.id,
          },
        },
        include: { lines: true },
      })
      const receivableLine = await db.financeJournalLine.findFirstOrThrow({
        where: {
          bookId,
          entryId: sourceJournal.id,
          account: { purpose: "RECEIVABLE" },
        },
      })
      await db.financeJournalLine.update({
        where: { id: receivableLine.id },
        data: { debitMinor: { increment: BigInt(1) } },
      })
      await expect(
        reverseCustomerLedgerEntry(
          db,
          reverseInput(
            mismatchAccount.id,
            mismatchDebt.id,
            "1",
            `mismatched-source-reversal-${runId}`,
          ),
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(
        await db.customerLedgerEntry.count({
          where: {
            accountId: mismatchAccount.id,
            reversalOfId: mismatchDebt.id,
          },
        }),
      ).toBe(0)

      // Exercise unbounded settlement provenance with bulk run-owned facts:
      // 101 allocations and 101 releases, with the last release journal
      // initially absent. No external posting command is looped 100 times.
      const bulkAccount = await accountFor("Bulk settlement history")
      const bulkCredit = await recordCustomerLedgerOpening(db, {
        ...actor,
        bookId,
        accountId: bulkAccount.id,
        direction: "CREDIT",
        amountMinor: "101",
        reason: "Held funds with long released settlement history",
        clientCommandId: `bulk-opening-credit-${runId}`,
      })
      const bulkDebt = await recordCustomerLedgerOpening(db, {
        ...actor,
        bookId,
        accountId: bulkAccount.id,
        direction: "DEBT",
        amountMinor: "101",
        reason: "Verified charge settled by long allocation history",
        clientCommandId: `bulk-opening-debt-${runId}`,
      })
      const bulkBook = await db.financeBook.findUniqueOrThrow({
        where: { id: bookId },
        select: { lastSequence: true },
      })
      const bulkFinanceAccounts = await db.financeAccount.findMany({
        where: {
          bookId,
          purpose: { in: ["CUSTOMER_ADVANCE", "RECEIVABLE"] },
        },
        select: { id: true, purpose: true },
      })
      const bulkAdvance = bulkFinanceAccounts.find(
        (row) => row.purpose === "CUSTOMER_ADVANCE",
      )
      const bulkReceivable = bulkFinanceAccounts.find(
        (row) => row.purpose === "RECEIVABLE",
      )
      if (!bulkAdvance || !bulkReceivable)
        throw new Error("Customer control accounts are unavailable")
      const bulkCount = 101
      const allocationIds = Array.from({ length: bulkCount }, () =>
        randomUUID(),
      )
      const releaseIds = Array.from({ length: bulkCount }, () => randomUUID())
      const allocationRows = allocationIds.map((id, index) => ({
        id,
        accountId: bulkAccount.id,
        creditEntryId: bulkCredit.id,
        chargeEntryId: bulkDebt.id,
        sequence: BigInt(index + 3),
        amountMinor: BigInt(1),
        actorUserId: user.id,
      }))
      const releaseRows = releaseIds.map((id, index) => {
        const allocationId = allocationIds[index]
        if (!allocationId) throw new Error("Missing bulk allocation fixture")
        return {
          id,
          allocationId,
          sequence: BigInt(bulkCount + 3 + index),
          amountMinor: BigInt(1),
          reason: "Run-owned fully released allocation fixture",
          actorUserId: user.id,
        }
      })
      const firstActivityAt = new Date("2026-02-02T00:00:00.000Z")
      const allocationJournalRows = allocationIds.map((id, index) => ({
        id: randomUUID(),
        bookId,
        sequence: BigInt(bulkBook.lastSequence + BigInt(index + 1)),
        sourceKind: "CUSTOMER_CREDIT_ALLOCATION",
        sourceId: id,
        payloadHash: financePayloadHash({
          runId,
          sourceKind: "CUSTOMER_CREDIT_ALLOCATION",
          sourceId: id,
          amountMinor: "1",
        }),
        description: "Run-owned allocation posting fixture",
        actorUserId: user.id,
        effectiveAt: new Date(firstActivityAt.getTime() + index),
      }))
      const releaseJournalRows = releaseIds.map((id, index) => ({
        id: randomUUID(),
        bookId,
        sequence: BigInt(bulkBook.lastSequence + BigInt(bulkCount + index + 1)),
        sourceKind: "CUSTOMER_ALLOCATION_RELEASE",
        sourceId: id,
        payloadHash: financePayloadHash({
          runId,
          sourceKind: "CUSTOMER_ALLOCATION_RELEASE",
          sourceId: id,
          amountMinor: "1",
        }),
        description: "Run-owned allocation release posting fixture",
        actorUserId: user.id,
        effectiveAt: new Date(firstActivityAt.getTime() + bulkCount + index),
      }))
      const allocationLineRows = allocationJournalRows.flatMap((journal) => [
        {
          bookId,
          entryId: journal.id,
          accountId: bulkAdvance.id,
          debitMinor: BigInt(1),
          creditMinor: BigInt(0),
        },
        {
          bookId,
          entryId: journal.id,
          accountId: bulkReceivable.id,
          debitMinor: BigInt(0),
          creditMinor: BigInt(1),
        },
      ])
      const releaseLineRows = releaseJournalRows.flatMap((journal) => [
        {
          bookId,
          entryId: journal.id,
          accountId: bulkReceivable.id,
          debitMinor: BigInt(1),
          creditMinor: BigInt(0),
        },
        {
          bookId,
          entryId: journal.id,
          accountId: bulkAdvance.id,
          debitMinor: BigInt(0),
          creditMinor: BigInt(1),
        },
      ])
      const lastReleaseJournal = releaseJournalRows.at(-1)
      if (!lastReleaseJournal)
        throw new Error("Missing final QA release journal")
      const incompleteReleaseJournals = releaseJournalRows.slice(0, -1)
      const finalCustomerSequence = BigInt(bulkCount * 2 + 2)
      await db.$transaction(
        async (tx) => {
          await tx.customerLedgerAllocation.createMany({ data: allocationRows })
          await tx.customerLedgerAllocationRelease.createMany({
            data: releaseRows,
          })
          await tx.financeJournalEntry.createMany({
            data: [...allocationJournalRows, ...incompleteReleaseJournals],
          })
          await tx.financeJournalLine.createMany({
            data: [...allocationLineRows, ...releaseLineRows.slice(0, -2)],
          })
          await tx.customerLedgerAccount.update({
            where: { id: bulkAccount.id },
            data: {
              lastSequence: finalCustomerSequence,
              revision: finalCustomerSequence,
            },
          })
          await tx.financeBook.update({
            where: { id: bookId },
            data: {
              lastSequence: bulkBook.lastSequence + BigInt(bulkCount * 2 - 1),
            },
          })
        },
        { maxWait: 10_000, timeout: 30_000 },
      )
      expect(allocationRows).toHaveLength(101)
      expect(releaseRows).toHaveLength(101)
      expect(incompleteReleaseJournals).toHaveLength(100)
      expect(
        await db.customerLedgerAllocation.count({
          where: { accountId: bulkAccount.id, creditEntryId: bulkCredit.id },
        }),
      ).toBe(101)
      expect(
        await db.customerLedgerAllocationRelease.count({
          where: {
            allocation: {
              accountId: bulkAccount.id,
              creditEntryId: bulkCredit.id,
            },
          },
        }),
      ).toBe(101)
      expect(
        await db.financeJournalEntry.findUnique({
          where: {
            bookId_sourceKind_sourceId: {
              bookId,
              sourceKind: "CUSTOMER_ALLOCATION_RELEASE",
              sourceId: lastReleaseJournal.sourceId,
            },
          },
        }),
      ).toBe(null)
      const bulkBefore = await statement(bulkAccount.id)
      expect(bulkBefore.snapshotSequence).toBe(finalCustomerSequence.toString())
      expect(bulkBefore.totals.outstandingDebtMinor).toBe("101")
      expect(bulkBefore.totals.availableCreditMinor).toBe("101")
      const bulkCorrection = reverseInput(
        bulkAccount.id,
        bulkCredit.id,
        finalCustomerSequence.toString(),
        `bulk-reversal-${runId}`,
      )
      await expect(
        reverseCustomerLedgerEntry(db, bulkCorrection),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect((await statement(bulkAccount.id)).snapshotSequence).toBe(
        finalCustomerSequence.toString(),
      )
      expect(
        await db.customerLedgerEntry.count({
          where: { accountId: bulkAccount.id, reversalOfId: bulkCredit.id },
        }),
      ).toBe(0)

      const missingReleaseLineRows = releaseLineRows.slice(-2)
      await db.$transaction(
        async (tx) => {
          await tx.financeJournalEntry.create({ data: lastReleaseJournal })
          await tx.financeJournalLine.createMany({
            data: missingReleaseLineRows,
          })
          await tx.financeBook.update({
            where: { id: bookId },
            data: { lastSequence: { increment: BigInt(1) } },
          })
        },
        { maxWait: 10_000, timeout: 30_000 },
      )
      const restoredReleaseJournal =
        await db.financeJournalEntry.findUniqueOrThrow({
          where: {
            bookId_sourceKind_sourceId: {
              bookId,
              sourceKind: "CUSTOMER_ALLOCATION_RELEASE",
              sourceId: lastReleaseJournal.sourceId,
            },
          },
          include: { lines: true },
        })
      expect(restoredReleaseJournal.lines).toHaveLength(2)
      const bulkReversal = await reverseCustomerLedgerEntry(db, bulkCorrection)
      const bulkAfter = await statement(bulkAccount.id)
      expect(bulkAfter.snapshotSequence).toBe(
        (finalCustomerSequence + BigInt(1)).toString(),
      )
      expect(bulkAfter.totals).toMatchObject({
        debitMinor: "202",
        creditMinor: "101",
        allocatedMinor: "101",
        outstandingDebtMinor: "101",
        availableCreditMinor: "0",
        netBalanceMinor: "101",
      })
      expect(
        (await statement(bulkAccount.id, finalCustomerSequence.toString()))
          .totals,
      ).toEqual(bulkBefore.totals)
      expect(
        (
          await db.customerLedgerEntry.findUniqueOrThrow({
            where: { id: bulkReversal.id },
          })
        ).reversalOfId,
      ).toBe(bulkCredit.id)
    } finally {
      const tenantIdToDelete = cleanupTenantId
      const bookIdToDelete = cleanupBookId
      if (tenantIdToDelete)
        await db.$transaction(
          async (tx) => {
            await tx.customerLedgerCommand.deleteMany({
              where: { tenantId: tenantIdToDelete },
            })
            await tx.customerLedgerAllocationRelease.deleteMany({
              where: { allocation: { credit: { tenantId: tenantIdToDelete } } },
            })
            await tx.customerLedgerAllocation.deleteMany({
              where: { credit: { tenantId: tenantIdToDelete } },
            })
            await tx.customerLedgerReceipt.deleteMany({
              where: { entry: { tenantId: tenantIdToDelete } },
            })
            await tx.customerLedgerEntry.deleteMany({
              where: {
                tenantId: tenantIdToDelete,
                reversalOfId: { not: null },
              },
            })
            await tx.customerLedgerEntry.deleteMany({
              where: { tenantId: tenantIdToDelete },
            })
            await tx.customerLedgerAccount.deleteMany({
              where: { tenantId: tenantIdToDelete },
            })
            if (bookIdToDelete) {
              await tx.financeCommand.deleteMany({
                where: { bookId: bookIdToDelete },
              })
              await tx.financeJournalLine.deleteMany({
                where: { bookId: bookIdToDelete },
              })
              await tx.financeJournalEntry.deleteMany({
                where: { bookId: bookIdToDelete, reversalOfId: { not: null } },
              })
              await tx.financeJournalEntry.deleteMany({
                where: { bookId: bookIdToDelete },
              })
              await tx.financeAccount.deleteMany({
                where: { bookId: bookIdToDelete },
              })
              await tx.financeBook.delete({ where: { id: bookIdToDelete } })
            }
            await tx.tenant.delete({ where: { id: tenantIdToDelete } })
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
      await db.user.deleteMany({
        where: { id: { in: [user.id, member.id] } },
      })
    }
  }, 420_000)
})
