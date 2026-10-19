import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  type GeneralAction,
  generalReceiptSchema,
  simpleExpenseAction,
  simpleMoneyInAction,
  simpleTransferAction,
} from "@ewatrade/assistant/general/contracts"
import {
  createFinanceBookInTransaction,
  createFinanceMoneyAccountInTransaction,
} from "@ewatrade/db/queries"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { generalProposalWithReview } from "./general-proposals"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-money-confirm")
let bookId = ""
let cashId = ""
let bankId = ""
let categoryId = ""

beforeAll(async () => {
  await fixture.setup()
  if (!enabled) return
  const { db, tenantId, userId } = fixture
  const seeded = await db.$transaction(async (tx) => {
    expect(await tx.financeBook.count({ where: { tenantId } })).toBe(0)
    const actor = { tenantId, actorUserId: userId }
    const book = await createFinanceBookInTransaction(tx, {
      ...actor,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    const bank = await createFinanceMoneyAccountInTransaction(tx, {
      ...actor,
      bookId: book.id,
      code: "WA_TEST_BANK",
      name: "Synthetic payment bank",
      purpose: "BANK",
    })
    const cash = await tx.financeAccount.findUniqueOrThrow({
      where: { bookId_code: { bookId: book.id, code: "1000" } },
    })
    const category = await tx.financeAccount.findUniqueOrThrow({
      where: { bookId_code: { bookId: book.id, code: "6000" } },
    })
    expect(cash).toMatchObject({ name: "Shop cash", purpose: "CASH" })
    expect(category).toMatchObject({
      name: "Operating expenses",
      kind: "EXPENSE",
    })
    return {
      bookId: book.id,
      cashId: cash.id,
      bankId: bank.id,
      categoryId: category.id,
    }
  })
  ;({ bookId, cashId, bankId, categoryId } = seeded)
}, 90_000)

async function moneySnapshot() {
  const { db, tenantId } = fixture
  return {
    books: await db.financeBook.count({ where: { tenantId } }),
    accounts: await db.financeAccount.count({ where: { bookId } }),
    entries: await db.financeJournalEntry.count({ where: { bookId } }),
    lines: await db.financeJournalLine.count({ where: { bookId } }),
    commands: await db.financeCommand.count({ where: { bookId } }),
    bills: await db.financeBill.count({ where: { bookId } }),
    billPayments: await db.financeBillPayment.count({ where: { bookId } }),
    orders: await db.commercialOrder.count({ where: { tenantId } }),
    orderPayments: await db.commercialOrderPayment.count({
      where: { tenantId },
    }),
  }
}

/** Actual canonical review, exact issued proof and quoted decision; only the model/HTTP are synthetic. */
async function confirmAndReplay(
  payload: GeneralAction,
  expectedFacts: string[],
  title: string,
) {
  const { db } = fixture
  const runsBefore = await db.assistantRun.count({
    where: { conversationId: fixture.conversationId },
  })
  const beforeDraft = await moneySnapshot()
  const review = await fixture.stagedProposal({
    text: `Record synthetic ${payload.action}`,
    payload,
    reply: "Review this exact saved bookkeeping draft.",
    expectedReviewText: expectedFacts[0] ?? title,
  })
  expect(await moneySnapshot()).toEqual(beforeDraft)
  const pending = await db.assistantActionProposal.findUniqueOrThrow({
    where: { id: review.source.proposalId },
  })
  const canonical = await generalProposalWithReview(
    await fixture.context(`${fixture.marker}-${payload.action}-review`),
    pending,
  )
  expect(canonical.presentation).toBeDefined()
  expect(canonical.question).toBeUndefined()
  expect(canonical.choices).toEqual([])
  expect(canonical.approvalToken).toBeTruthy()
  for (const fact of expectedFacts) expect(review.body).toContain(fact)
  const confirmed = await fixture.action(
    `Confirm ${review.confirmCode}`,
    review.providerMessageId,
  )
  expect(confirmed.inbox.content).toMatchObject({
    type: "action_result",
    resultRef: {
      proposalId: pending.id,
      revision: pending.revision,
      status: "COMPLETED",
      decision: "confirm",
    },
  })
  const completed = await db.assistantActionProposal.findUniqueOrThrow({
    where: { id: pending.id },
  })
  expect(completed.status).toBe("COMPLETED")
  const receipt = generalReceiptSchema.parse(completed.executedResult)
  expect(receipt.title).toBe(title)
  expect(confirmed.outbox.content).toContain(title)
  const afterConfirm = await moneySnapshot()
  expect(afterConfirm.orders).toBe(0)
  expect(afterConfirm.orderPayments).toBe(0)
  expect(afterConfirm.accounts).toBe(beforeDraft.accounts)
  expect(
    await db.assistantRun.count({
      where: { conversationId: fixture.conversationId },
    }),
  ).toBe(runsBefore + 1)
  const replay = await fixture.action(
    `Confirm ${review.confirmCode}`,
    review.providerMessageId,
  )
  expect(replay.inbox.id).not.toBe(confirmed.inbox.id)
  expect(replay.inbox.content).toEqual(confirmed.inbox.content)
  expect(replay.outbox.content).toBe(confirmed.outbox.content)
  expect(await moneySnapshot()).toEqual(afterConfirm)
  expect(
    await db.assistantRun.count({
      where: { conversationId: fixture.conversationId },
    }),
  ).toBe(runsBefore + 1)
  expect(
    await db.assistantWhatsAppActionReview.findUniqueOrThrow({
      where: { id: review.proof.id },
    }),
  ).toMatchObject({
    state: "CONSUMED",
    decision: "confirm",
    consumedByIngressId: confirmed.inbox.id,
  })
  await fixture.assertNoStoredDecisionCodes()
  return receipt
}

/** Guard all money ownership before deleting any dependent row or neutral fixture attribution. */
async function cleanupOwnedMoney() {
  const { db, tenantId, storeId, userId } = fixture
  await db.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant) {
        expect(await tx.financeBook.count({ where: { tenantId } })).toBe(0)
        return
      }
      expect(tenant).toMatchObject({
        slug: tenantId,
        dataClassification: "QA",
        qaSourceDomain: "assistant-action-confirmation.test",
      })
      const proposals = await tx.assistantActionProposal.findMany({
        where: { tenantId },
      })
      for (const proposal of proposals) {
        expect(proposal).toMatchObject({
          actorUserId: userId,
          storeId,
          conversationId: fixture.conversationId,
        })
        expect([
          "money_in_record",
          "expense_record_simple",
          "money_transfer_simple",
        ]).toContain(proposal.action)
      }
      // All three actions are bookkeeping-only, walk-in-free and photo-free.
      expect(await tx.commercialOrder.count({ where: { tenantId } })).toBe(0)
      expect(
        await tx.commercialOrderPayment.count({ where: { tenantId } }),
      ).toBe(0)
      expect(
        await tx.commercialOrderActivity.count({ where: { tenantId } }),
      ).toBe(0)
      expect(await tx.customerLedgerEntry.count({ where: { tenantId } })).toBe(
        0,
      )
      expect(
        await tx.customerLedgerAccount.count({ where: { tenantId } }),
      ).toBe(0)
      expect(await tx.assistantAttachment.count({ where: { tenantId } })).toBe(
        0,
      )
      const books = await tx.financeBook.findMany({ where: { tenantId } })
      expect(books.length).toBeLessThanOrEqual(1)
      for (const book of books) {
        expect(book).toMatchObject({ createdById: userId, currencyCode: "NGN" })
        if (bookId) expect(book.id).toBe(bookId)
      }
      const bookIds = books.map((book) => book.id)
      const bills = await tx.financeBill.findMany({
        where: { bookId: { in: bookIds } },
      })
      const savedBillIds = proposals.flatMap((proposal) => {
        const parsed = generalReceiptSchema.safeParse(proposal.executedResult)
        return parsed.success && parsed.data.kind === "finance_bill"
          ? [parsed.data.recordId]
          : []
      })
      for (const bill of bills) {
        expect(bill).toMatchObject({
          actorUserId: userId,
          storeId,
          kind: "EXPENSE",
        })
        expect(savedBillIds).toContain(bill.id)
      }
      const billIds = bills.map((bill) => bill.id)
      const payments = await tx.financeBillPayment.findMany({
        where: { bookId: { in: bookIds } },
      })
      for (const payment of payments) {
        expect(payment.actorUserId).toBe(userId)
        expect(billIds).toContain(payment.billId)
      }
      const commands = await tx.financeCommand.findMany({
        where: { bookId: { in: bookIds } },
      })
      for (const command of commands) expect(command.actorUserId).toBe(userId)
      const entries = await tx.financeJournalEntry.findMany({
        where: { bookId: { in: bookIds } },
      })
      for (const entry of entries) {
        expect(entry).toMatchObject({ actorUserId: userId, storeId })
        expect([
          "OWNER_CONTRIBUTION",
          "TRANSFER",
          "EXPENSE_BILL",
          "BILL_PAYMENT",
        ]).toContain(entry.sourceKind)
      }
      const events = await tx.businessActivityEvent.findMany({
        where: { tenantId },
      })
      for (const event of events) expect(event.actorUserId).toBe(userId)
      await tx.businessActivityEvent.deleteMany({
        where: { tenantId, id: { in: events.map((event) => event.id) } },
      })
      await tx.financeBillPayment.deleteMany({
        where: {
          bookId: { in: bookIds },
          id: { in: payments.map((payment) => payment.id) },
        },
      })
      await tx.financeBillLine.deleteMany({
        where: { bookId: { in: bookIds }, billId: { in: billIds } },
      })
      await tx.financeBill.deleteMany({
        where: { bookId: { in: bookIds }, id: { in: billIds } },
      })
      await tx.financeCommand.deleteMany({
        where: {
          bookId: { in: bookIds },
          id: { in: commands.map((command) => command.id) },
        },
      })
      await tx.financeJournalLine.deleteMany({
        where: {
          bookId: { in: bookIds },
          entryId: { in: entries.map((entry) => entry.id) },
        },
      })
      await tx.financeJournalEntry.deleteMany({
        where: {
          bookId: { in: bookIds },
          id: { in: entries.map((entry) => entry.id) },
        },
      })
      await tx.financeAccount.deleteMany({ where: { bookId: { in: bookIds } } })
      await tx.financeBook.deleteMany({
        where: { tenantId, id: { in: bookIds } },
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

afterAll(async () => {
  if (enabled && fixture.db) {
    try {
      await cleanupOwnedMoney()
    } catch (error) {
      await fixture.db.$disconnect()
      throw new Error(
        `Owned money cleanup failed; retained fixture ${fixture.tenantId}`,
        { cause: error },
      )
    }
  }
  await fixture.cleanup()
}, 90_000)

suite("native WhatsApp canonical money confirmations", () => {
  test("owner funds exact review posts the existing bank debit once and replays its receipt", async () => {
    const { db, userId, storeId } = fixture
    const receipt = await confirmAndReplay(
      simpleMoneyInAction.parse({
        action: "money_in_record",
        moneyAccountId: bankId,
        accountName: "Synthetic payment bank",
        amountMinor: 50000,
        description: "Synthetic owner contribution",
      }),
      [
        "Owner contribution · not sales income",
        "Synthetic payment bank",
        "Existing BANK account",
        "500.00",
      ],
      "Money recorded",
    )
    if (receipt.kind !== "finance_movement")
      throw Error("Expected owner-funds movement receipt")
    const entry = await db.financeJournalEntry.findUniqueOrThrow({
      where: { id: receipt.recordId },
      include: { lines: true },
    })
    expect(entry).toMatchObject({
      bookId,
      actorUserId: userId,
      storeId,
      sourceKind: "OWNER_CONTRIBUTION",
      description: "Synthetic owner contribution",
    })
    expect(
      entry.lines.find((line) => line.accountId === bankId)?.debitMinor,
    ).toBe(50000n)
    expect(
      entry.lines.reduce(
        (total, line) => total + line.debitMinor - line.creditMinor,
        0n,
      ),
    ).toBe(0n)
    expect(
      await db.financeJournalEntry.count({
        where: { bookId, sourceKind: "OWNER_CONTRIBUTION" },
      }),
    ).toBe(1)
  }, 240_000)

  test("paid expense exact review records default category and cash payment once and replays its receipt", async () => {
    const { db, userId, storeId } = fixture
    const receipt = await confirmAndReplay(
      simpleExpenseAction.parse({
        action: "expense_record_simple",
        amountMinor: 12500,
        paid: true,
        moneyAccountId: cashId,
        accountName: "Shop cash",
        expenseCategoryId: categoryId,
        categoryName: "Operating expenses",
        description: "Synthetic delivery expense",
        payeeName: "Synthetic courier",
      }),
      [
        "Already paid · business account",
        "Operating expenses",
        "Shop cash",
        "Synthetic courier",
        "125.00",
      ],
      "Expense recorded",
    )
    if (receipt.kind !== "finance_bill")
      throw Error("Expected paid expense bill receipt")
    const bill = await db.financeBill.findUniqueOrThrow({
      where: { id: receipt.recordId },
      include: { lines: true, payments: true },
    })
    expect(bill).toMatchObject({
      bookId,
      actorUserId: userId,
      storeId,
      kind: "EXPENSE",
      totalMinor: 12500n,
      paidMinor: 12500n,
      payeeName: "Synthetic courier",
      description: "Synthetic delivery expense",
    })
    expect(bill.lines).toHaveLength(1)
    expect(bill.lines[0]).toMatchObject({
      accountId: categoryId,
      amountMinor: 12500n,
    })
    expect(bill.payments).toHaveLength(1)
    expect(bill.payments[0]).toMatchObject({
      accountId: cashId,
      amountMinor: 12500n,
      actorUserId: userId,
    })
    const entries = await db.financeJournalEntry.findMany({
      where: { bookId, sourceKind: { in: ["EXPENSE_BILL", "BILL_PAYMENT"] } },
      include: { lines: true },
    })
    expect(entries.map((entry) => entry.sourceKind).sort()).toEqual([
      "BILL_PAYMENT",
      "EXPENSE_BILL",
    ])
    for (const entry of entries)
      expect(
        entry.lines.reduce(
          (total, line) => total + line.debitMinor - line.creditMinor,
          0n,
        ),
      ).toBe(0n)
    expect(
      entries
        .flatMap((entry) => entry.lines)
        .find((line) => line.accountId === cashId)?.creditMinor,
    ).toBe(12500n)
  }, 240_000)

  test("transfer exact review posts existing bank-to-cash balanced journal once and replays its receipt", async () => {
    const { db, userId, storeId } = fixture
    const receipt = await confirmAndReplay(
      simpleTransferAction.parse({
        action: "money_transfer_simple",
        amountMinor: 10000,
        fromMoneyAccountId: bankId,
        fromAccountName: "Synthetic payment bank",
        toMoneyAccountId: cashId,
        toAccountName: "Shop cash",
        note: "Synthetic transfer already made",
      }),
      [
        "already-made transfer",
        "Synthetic payment bank",
        "Shop cash",
        "Existing BANK account",
        "Existing CASH account",
        "100.00",
      ],
      "Transfer recorded",
    )
    if (receipt.kind !== "finance_movement")
      throw Error("Expected transfer movement receipt")
    const entry = await db.financeJournalEntry.findUniqueOrThrow({
      where: { id: receipt.recordId },
      include: { lines: true },
    })
    expect(entry).toMatchObject({
      bookId,
      actorUserId: userId,
      storeId,
      sourceKind: "TRANSFER",
      description: "Synthetic transfer already made",
    })
    expect(entry.lines).toHaveLength(2)
    expect(
      entry.lines.find((line) => line.accountId === bankId)?.creditMinor,
    ).toBe(10000n)
    expect(
      entry.lines.find((line) => line.accountId === cashId)?.debitMinor,
    ).toBe(10000n)
    expect(
      entry.lines.reduce(
        (total, line) => total + line.debitMinor - line.creditMinor,
        0n,
      ),
    ).toBe(0n)
    expect(
      await db.financeJournalEntry.count({
        where: { bookId, sourceKind: "TRANSFER" },
      }),
    ).toBe(1)
  }, 240_000)
})
