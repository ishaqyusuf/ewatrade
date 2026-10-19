import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import {
  generalActionSchema,
  generalMoney,
  generalReceiptSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import { appendAssistantMessage } from "@ewatrade/db/assistant"
import {
  settleAssistantWhatsAppInbox,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import {
  changeFinancePeriod,
  createFinanceBook,
  getFinanceBill,
} from "@ewatrade/db/queries"
import type { Prisma } from "@ewatrade/db/types"
import { z } from "zod"
import { financePostingCommandId } from "../../../../packages/db/src/queries/finance/commands"
import { assistantRouter } from "../trpc/routers/assistant"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import {
  isLinkedAssistantIdentity,
  lockLinkedAssistantIdentity,
} from "./channel-principal"
import { generalPersistentParts } from "./general-persistence"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  editGeneralProposal,
  generalProposalWithReview,
} from "./general-proposals"
import { createGeneralTools } from "./general-tools"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-finance-handoff")
const foreignTenantId = `${fixture.marker}-foreign`
const foreignSourceDomain = "assistant-finance-handoff.test"
const appOrigin = "https://dashboard.example.test"
const previousOrigin = process.env.DASHBOARD_URL
const closeCommandId = `${fixture.marker}-close`
const incurredAt = "2026-10-01T12:00:00.123Z"
const paidAt = "2026-10-01T12:00:00.456Z"
const totalMinor = "12345678901234"
const paidMinor = "4567890123"
const outstandingMinor = (BigInt(totalMinor) - BigInt(paidMinor)).toString()
let bookId = ""
let foreignBookId = ""
let categoryId = ""
let cashId = ""
let foreignCategoryId = ""
let foreignCashId = ""

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  process.env.DASHBOARD_URL = appOrigin
  const { db, tenantId, userId } = fixture
  await db.tenant.create({
    data: {
      id: foreignTenantId,
      slug: foreignTenantId,
      name: "Synthetic foreign finance business",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      currencyCode: "NGN",
      metadata: { retailOps: { subscription: { planId: "pro" } } },
      dataClassification: "QA",
      qaMarkedAt: new Date(),
      qaSourceDomain: foreignSourceDomain,
      users: { create: { userId, role: "OWNER", status: "ACTIVE" } },
    },
  })
  for (const selectedTenantId of [tenantId, foreignTenantId]) {
    const book = await createFinanceBook(db, {
      tenantId: selectedTenantId,
      actorUserId: userId,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    const category = await db.financeAccount.findFirstOrThrow({
      where: { bookId: book.id, purpose: "OPERATING_EXPENSE" },
    })
    const cash = await db.financeAccount.findFirstOrThrow({
      where: { bookId: book.id, purpose: "CASH" },
    })
    if (selectedTenantId === tenantId) {
      bookId = book.id
      categoryId = category.id
      cashId = cash.id
    } else {
      foreignBookId = book.id
      foreignCategoryId = category.id
      foreignCashId = cash.id
    }
  }
}, 120_000)

/** Only the explicit selected chat and the exact empty canonical link bootstrap may exist. */
async function assertOwnedChats(
  db: Pick<
    Prisma.TransactionClient,
    "assistantWhatsAppLink" | "assistantConversation"
  >,
) {
  const { tenantId, storeId, userId, membershipId, conversationId, principal } =
    fixture
  const links = await db.assistantWhatsAppLink.findMany({
    where: {
      tenantId,
      storeId,
      userId,
      membershipId,
      confirmedAt: { not: null },
    },
    select: { id: true, phoneNumberId: true, claimedSenderId: true },
  })
  expect(links).toHaveLength(1)
  const link = links[0]
  if (!link) throw Error("The exact confirmed owned link is required")
  expect(link).toMatchObject({
    phoneNumberId: principal.phoneNumberId,
    claimedSenderId: principal.senderId,
  })
  const bootstrapId = `wa-linked_${link.id}`
  const chats = await db.assistantConversation.findMany({
    where: { tenantId },
    include: {
      setupDraft: true,
      _count: { select: { messages: true, runs: true, proposals: true } },
    },
    orderBy: { id: "asc" },
  })
  const ids = chats.map((chat) => chat.id)
  expect(ids).toEqual([conversationId, bootstrapId].sort())
  for (const chat of chats) {
    expect(chat).toMatchObject({
      tenantId,
      storeId,
      ownerUserId: userId,
      purpose: "GENERAL",
      status: "ACTIVE",
      workflowContext: null,
      setupDraft: null,
    })
    if (chat.id === bootstrapId)
      expect(chat).toMatchObject({
        lastSequence: 0,
        _count: { messages: 0, runs: 0, proposals: 0 },
      })
  }
  return ids
}

async function cleanupOwnedFinance() {
  const { db, tenantId, storeId, userId, conversationId } = fixture
  await db.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant) return
      expect(tenant).toMatchObject({
        slug: tenantId,
        dataClassification: "QA",
        qaSourceDomain: "assistant-action-confirmation.test",
      })
      const foreign = await tx.tenant.findUnique({
        where: { id: foreignTenantId },
      })
      if (foreign)
        expect(foreign).toMatchObject({
          slug: foreignTenantId,
          dataClassification: "QA",
          qaSourceDomain: foreignSourceDomain,
        })
      await assertOwnedChats(tx)
      const books = await tx.financeBook.findMany({
        where: { tenantId: { in: [tenantId, foreignTenantId] } },
      })
      for (const book of books)
        expect(book).toMatchObject({
          id: book.tenantId === tenantId ? bookId : foreignBookId,
          createdById: userId,
          currencyCode: "NGN",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
        })
      const bookIds = books.map((book) => book.id)
      const proposals = await tx.assistantActionProposal.findMany({
        where: { tenantId },
      })
      expect(proposals.length).toBeLessThanOrEqual(1)
      for (const proposal of proposals)
        expect(proposal).toMatchObject({
          actorUserId: userId,
          conversationId,
          storeId,
          action: "expense_record",
          targetRecordId: bookId,
        })
      const allowedKeys = new Set([closeCommandId])
      for (const proposal of proposals) {
        const key = proposal.idempotencyKey
        const paymentKey = financePostingCommandId(key, "initial-payment")
        for (const command of [
          key,
          paymentKey,
          financePostingCommandId(key, "expense"),
          financePostingCommandId(paymentKey, "bill-payment"),
        ])
          allowedKeys.add(command)
      }
      const where = { bookId: { in: bookIds } }
      const bills = await tx.financeBill.findMany({ where })
      expect(bills.length).toBeLessThanOrEqual(1)
      for (const bill of bills)
        expect(bill).toMatchObject({
          bookId,
          storeId,
          actorUserId: userId,
          kind: "EXPENSE",
          totalMinor: BigInt(totalMinor),
          paidMinor: BigInt(paidMinor),
          incurredAt: new Date(incurredAt),
          payeeName: "Synthetic landlord",
          description: "Synthetic incurred rent",
          voidedAt: null,
        })
      const payments = await tx.financeBillPayment.findMany({ where })
      expect(payments.length).toBeLessThanOrEqual(1)
      for (const payment of payments) {
        expect(payment).toMatchObject({
          bookId,
          accountId: cashId,
          actorUserId: userId,
          amountMinor: BigInt(paidMinor),
          effectiveAt: new Date(paidAt),
          reversedAt: null,
        })
        expect(bills.some((bill) => bill.id === payment.billId)).toBe(true)
      }
      const lines = await tx.financeBillLine.findMany({ where })
      expect(lines.length).toBeLessThanOrEqual(1)
      for (const line of lines) {
        expect(line).toMatchObject({
          bookId,
          accountId: categoryId,
          amountMinor: BigInt(totalMinor),
          description: "Synthetic rent",
          position: 0,
        })
        expect(bills.some((bill) => bill.id === line.billId)).toBe(true)
      }
      const entries = await tx.financeJournalEntry.findMany({
        where,
        include: { lines: true },
      })
      expect(entries.length).toBeLessThanOrEqual(2)
      for (const entry of entries) {
        expect(entry).toMatchObject({
          bookId,
          storeId,
          actorUserId: userId,
          reversalOfId: null,
        })
        expect(
          entry.sourceKind === "EXPENSE_BILL"
            ? bills.some((bill) => bill.id === entry.sourceId)
            : entry.sourceKind === "BILL_PAYMENT" &&
                payments.some((payment) => payment.id === entry.sourceId),
        ).toBe(true)
        expect(entry.lines).toHaveLength(2)
        expect(
          entry.lines.reduce(
            (net, line) => net + line.debitMinor - line.creditMinor,
            0n,
          ),
        ).toBe(0n)
      }
      const commands = await tx.financeCommand.findMany({ where })
      expect(commands.length).toBeLessThanOrEqual(5)
      for (const command of commands) {
        expect(command).toMatchObject({ bookId, actorUserId: userId })
        expect(allowedKeys.has(command.clientCommandId)).toBe(true)
        expect([
          "PERIOD_CLOSE",
          "RECORD_EXPENSE",
          "PAY_BILL",
          "POST_JOURNAL",
        ]).toContain(command.kind)
      }
      const periods = await tx.financePeriod.findMany({ where })
      expect(periods.length).toBeLessThanOrEqual(1)
      for (const period of periods)
        expect(period).toMatchObject({
          bookId,
          closedById: userId,
          endsAt: new Date("2026-09-30T23:59:59.999Z"),
          reopenedAt: null,
        })
      const forbidden = await Promise.all([
        tx.catalogItem.count({
          where: { tenantId: { in: [tenantId, foreignTenantId] } },
        }),
        tx.customer.count({
          where: { tenantId: { in: [tenantId, foreignTenantId] } },
        }),
        tx.commercialOrder.count({ where: { tenantId } }),
        tx.stockOperation.count({ where: { tenantId } }),
        tx.assistantAttachment.count({ where: { tenantId } }),
        tx.assistantUsageEvent.count({ where: { tenantId } }),
        tx.financeSupplierAccount.count({ where }),
        tx.financeReconciliation.count({ where }),
        tx.businessActivityEvent.count({ where: { tenantId } }),
      ])
      for (const count of forbidden) expect(count).toBe(0)
      await tx.financeBillPayment.deleteMany({ where })
      await tx.financeBillLine.deleteMany({ where })
      await tx.financeBill.deleteMany({ where })
      await tx.financeJournalLine.deleteMany({ where })
      await tx.financeJournalEntry.deleteMany({ where })
      await tx.financeCommand.deleteMany({ where })
      await tx.financePeriod.deleteMany({ where })
      await tx.financeAccount.deleteMany({ where })
      await tx.financeBook.deleteMany({ where: { id: { in: bookIds } } })
      if (foreign) await tx.tenant.delete({ where: { id: foreignTenantId } })
      expect(
        await tx.financeBook.count({ where: { id: { in: bookIds } } }),
      ).toBe(0)
      expect(await tx.tenant.count({ where: { id: foreignTenantId } })).toBe(0)
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      try {
        await cleanupOwnedFinance()
      } catch (cause) {
        await fixture.db.$disconnect()
        throw new Error(
          `Finance handoff cleanup unverified; retained fixture ${fixture.tenantId} and ${foreignTenantId}`,
          { cause },
        )
      }
    }
    await fixture.cleanup()
  } finally {
    if (previousOrigin === undefined)
      Reflect.deleteProperty(process.env, "DASHBOARD_URL")
    else process.env.DASHBOARD_URL = previousOrigin
  }
}, 90_000)

/** Actual linked tool and durable transport. Only the model completion and Meta HTTP outcome are synthetic. */
async function handoff(action: "expense_record", text: string) {
  const { db, conversationId, tenantId, storeId, userId } = fixture
  const inbox = await fixture.incoming(text)
  const claimed = await fixture.claim(inbox.id)
  const ctx = await fixture.context(inbox.requestId, claimed.lease)
  expect(ctx.session.session).toBeNull()
  const proposalCount = await db.assistantActionProposal.count({
    where: { tenantId },
  })
  const answers: GeneralAnswer[] = []
  const tools = createGeneralTools(
    ctx,
    conversationId,
    () => {
      throw Error("Handoff cannot draft")
    },
    (answer) => answers.push(answer),
  )
  const execute = tools.handoffAction?.execute
  if (!execute) throw Error("Expected current canonical Finance app handoff")
  expect(
    await execute(
      { action },
      { toolCallId: `handoff-${action}`, messages: [] },
    ),
  ).toMatchObject({
    status: "available",
    data: { status: "app_review", action },
  })
  expect(answers).toHaveLength(1)
  expect(answers[0]?.handoff).toMatchObject({
    action,
    reason: "complete_app_review",
    conversation: {
      conversationId,
      purpose: "GENERAL",
      origin: { tenantId, storeId },
    },
  })
  const parts = z
    .array(z.json())
    .parse(
      generalPersistentParts(
        answers.map((data) => ({ type: "data-general-answer", data })),
      ),
    )
  await db.$transaction(async (tx) => {
    if (!isLinkedAssistantIdentity(ctx.session))
      throw Error("Real linked identity required")
    const resolved = await lockLinkedAssistantIdentity(tx, ctx.session)
    await stampAssistantWhatsAppExecution(tx, claimed.lease, resolved)
    expect(
      await appendAssistantMessage(tx, {
        conversationId,
        message: {
          id: inbox.userMessageId,
          role: "user",
          parts: [{ type: "text", text }],
        },
      }),
    ).toBe(true)
    const messageId = randomUUID()
    expect(
      await appendAssistantMessage(tx, {
        conversationId,
        message: { id: messageId, role: "assistant", parts },
      }),
    ).toBe(true)
    const run = await tx.assistantRun.create({
      data: {
        conversationId,
        actorUserId: userId,
        requestId: inbox.requestId,
        provider: "ewatrade-rehearsal",
        model: "synthetic-no-model",
        promptVersion: "synthetic-exact-handoff-output",
        status: "COMPLETED",
        completedAt: new Date(),
        assistantMessageId: messageId,
      },
    })
    await tx.assistantWhatsAppInbox.update({
      where: { id: inbox.id },
      data: { runId: run.id },
    })
  })
  expect(
    await settleAssistantWhatsAppInbox(db, claimed.lease, {
      permittedUserIds: [userId],
    }),
  ).toEqual({ state: "COMPLETED" })
  expect(await db.assistantActionProposal.count({ where: { tenantId } })).toBe(
    proposalCount,
  )
  expect(
    await db.assistantWhatsAppActionReview.count({
      where: { bindingId: fixture.principal.bindingId },
    }),
  ).toBe(0)
  const output = await db.assistantWhatsAppOutbox.findFirstOrThrow({
    where: { inboxId: inbox.id },
  })
  expect(output.renderKind).toBe("reply")
  const delivered = await fixture.fakeAcceptedDelivery(output.id)
  expect(delivered.body).toContain(
    `${appOrigin}/assistant/c/${encodeURIComponent(conversationId)}`,
  )
  expect(delivered.body).toContain("No draft or business change was created")
  const saved = await db.assistantMessage.findFirstOrThrow({
    where: {
      conversationId,
      role: "assistant",
      completedRun: { requestId: inbox.requestId },
    },
  })
  const persisted = z.array(generalStoredPartSchema).parse(saved.parts)
  expect(
    persisted.some(
      (part) =>
        part.type === "data-general-answer" &&
        part.data.handoff?.action === action,
    ),
  ).toBe(true)
  const browser = await fixture.browserContext()
  expect(browser.session.session?.id).toBe(fixture.sessionId)
  expect(browser.assistantConversationId).toBeUndefined()
  expect(browser.tenantContext.tenant.id).toBe(tenantId)
  expect(browser.tenantContext.activeStore?.id).toBe(storeId)
  // Exercise the app's real protected conversation RPC, not a direct transcript read.
  const existingChatIds = await assertOwnedChats(db)
  const resumed = await assistantRouter
    .createCaller(browser)
    .conversation({ conversationId })
  expect(resumed.conversation).toMatchObject({
    id: conversationId,
    tenantId,
    storeId,
    ownerUserId: userId,
    purpose: "GENERAL",
    status: "ACTIVE",
  })
  expect(
    resumed.messages.find((message) => message.id === inbox.userMessageId),
  ).toMatchObject({
    role: "user",
    parts: [{ type: "text", text }],
  })
  const appReply = resumed.messages.find((message) => message.id === saved.id)
  if (!appReply)
    throw Error(
      "The same app chat must contain the exact emitted handoff message",
    )
  const appParts = z.array(generalStoredPartSchema).parse(appReply.parts)
  expect(
    appParts.some(
      (part) =>
        part.type === "data-general-answer" &&
        part.data.handoff?.action === action &&
        part.data.handoff.conversation.conversationId === conversationId,
    ),
  ).toBe(true)
  expect(await assertOwnedChats(db)).toEqual(existingChatIds)
  expect(
    await db.assistantMessage.count({
      where: { conversationId, id: inbox.userMessageId, role: "user" },
    }),
  ).toBe(1)
  return browser
}

suite("incurred expense WhatsApp app-review crossover", () => {
  test("the original signed chat resumes with the same real Session scope, a changed Book refuses old approval, and the exact bill/payment receipt replays once", async () => {
    const { db, tenantId, storeId, userId, conversationId } = fixture
    const browser = await handoff(
      "expense_record",
      "Record the rent already incurred on October first, partly paid from Shop cash. Open this exact saved chat for app review; do not send money.",
    )
    const toolAnswers: GeneralAnswer[] = []
    const tools = createGeneralTools(
      browser,
      conversationId,
      () => {
        throw Error("Read cannot draft")
      },
      (answer) => toolAnswers.push(answer),
    )
    const categories = tools.readExpenseCategories?.execute
    const accounts = tools.readMoneyAccounts?.execute
    if (!categories || !accounts)
      throw Error(
        "Current authorized category and money-account reads required",
      )
    expect(
      await categories({}, { toolCallId: "category-discovery", messages: [] }),
    ).toMatchObject({
      status: "available",
      data: {
        book: { id: bookId },
        accounts: [expect.objectContaining({ id: categoryId })],
      },
    })
    expect(
      await accounts(
        { bookId },
        { toolCallId: "cash-discovery", messages: [] },
      ),
    ).toMatchObject({
      status: "available",
      data: {
        book: { id: bookId },
        accounts: expect.arrayContaining([
          expect.objectContaining({ id: cashId }),
        ]),
      },
    })
    expect(toolAnswers.length).toBeGreaterThan(0)
    const payload = generalActionSchema.parse({
      action: "expense_record",
      bookId,
      payeeName: "Synthetic landlord",
      description: "Synthetic incurred rent",
      incurredAt,
      expenseAlreadyIncurred: true,
      lines: [
        {
          accountId: categoryId,
          description: "Synthetic rent",
          amountMinor: totalMinor,
        },
      ],
      payment: {
        funding: "BUSINESS_ACCOUNT",
        accountId: cashId,
        amountMinor: paidMinor,
        effectiveAt: paidAt,
        paymentAlreadyMade: true,
      },
    })
    if (payload.action !== "expense_record")
      throw Error("Exact canonical expense payload required")
    await expect(
      draftGeneralProposal(browser, conversationId, {
        ...payload,
        bookId: foreignBookId,
      }),
    ).rejects.toThrow()
    await expect(
      draftGeneralProposal(browser, conversationId, {
        ...payload,
        lines: [
          {
            accountId: foreignCategoryId,
            description: "Foreign category must refuse",
            amountMinor: totalMinor,
          },
        ],
      }),
    ).rejects.toThrow()
    await expect(
      draftGeneralProposal(browser, conversationId, {
        ...payload,
        payment: {
          funding: "BUSINESS_ACCOUNT",
          accountId: foreignCashId,
          amountMinor: paidMinor,
          effectiveAt: paidAt,
          paymentAlreadyMade: true,
        },
      }),
    ).rejects.toThrow()
    expect(
      await db.assistantActionProposal.count({ where: { tenantId } }),
    ).toBe(0)
    const draft = await draftGeneralProposal(browser, conversationId, payload)
    const pending = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: draft.proposalId },
    })
    expect(pending).toMatchObject({
      tenantId,
      storeId,
      conversationId,
      actorUserId: userId,
      action: "expense_record",
      targetRecordId: bookId,
      status: "PENDING",
    })
    const review = await generalProposalWithReview(browser, pending)
    if (!review.review)
      throw Error("Expected the complete canonical expense review")
    const reviewText = review.review.join("\n")
    for (const exact of [
      generalMoney(totalMinor, "NGN"),
      generalMoney(paidMinor, "NGN"),
      generalMoney(outstandingMinor, "NGN"),
      incurredAt,
      paidAt,
      "Remaining payable",
      "does not send money",
    ])
      expect(reviewText).toContain(exact)
    const oldDecision = {
      proposalId: pending.id,
      revision: pending.revision,
      approvalToken: review.approvalToken,
      decision: "confirm" as const,
    }
    // An independent canonical Book control changes the exact reviewed posting snapshot.
    const book = await db.financeBook.findUniqueOrThrow({
      where: { id: bookId },
    })
    expect(book).toMatchObject({
      tenantId,
      createdById: userId,
      currencyCode: "NGN",
      closedThrough: null,
      lastSequence: 0n,
    })
    await changeFinancePeriod(db, {
      tenantId,
      actorUserId: userId,
      bookId,
      clientCommandId: closeCommandId,
      action: "CLOSE",
      through: new Date("2026-09-30T23:59:59.999Z"),
      expectedSnapshotSequence: book.lastSequence.toString(),
      reason: "Synthetic independent September close",
    })
    await expect(
      decideGeneralProposal(browser, oldDecision),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(await db.financeBill.count({ where: { bookId } })).toBe(0)
    expect(await db.financeBillPayment.count({ where: { bookId } })).toBe(0)
    expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(0)
    const edited = await editGeneralProposal(browser, {
      proposalId: pending.id,
      revision: pending.revision,
      payload,
    })
    expect(edited.revision).toBe(pending.revision + 1)
    const freshRow = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: pending.id },
    })
    expect(freshRow.targetRevision).not.toBe(pending.targetRevision)
    const fresh = await generalProposalWithReview(browser, freshRow)
    const decision = {
      proposalId: freshRow.id,
      revision: freshRow.revision,
      approvalToken: fresh.approvalToken,
      decision: "confirm" as const,
    }
    const result = await decideGeneralProposal(browser, decision)
    expect(result.status).toBe("COMPLETED")
    const receipt = generalReceiptSchema.parse(result.receipt)
    expect(receipt).toMatchObject({
      kind: "finance_bill",
      bookId,
      title: "Expense recorded",
    })
    const saved = await getFinanceBill(db, {
      tenantId,
      actorUserId: userId,
      bookId,
      billId: receipt.recordId,
    })
    expect(saved).toMatchObject({
      id: receipt.recordId,
      bookId,
      storeId,
      totalMinor,
      paidMinor,
      outstandingMinor,
      incurredAt: new Date(incurredAt),
    })
    expect(saved.payments).toHaveLength(1)
    expect(saved.payments[0]).toMatchObject({
      accountId: cashId,
      amountMinor: paidMinor,
      funding: "BUSINESS_ACCOUNT",
      effectiveAt: new Date(paidAt),
    })
    const counts = async () =>
      Promise.all([
        db.financeBill.count({ where: { bookId } }),
        db.financeBillPayment.count({ where: { bookId } }),
        db.financeJournalEntry.count({ where: { bookId } }),
        db.financeCommand.count({ where: { bookId } }),
      ])
    expect(await counts()).toEqual([1, 1, 2, 5])
    expect((await decideGeneralProposal(browser, decision)).receipt).toEqual(
      result.receipt,
    )
    expect(await counts()).toEqual([1, 1, 2, 5])
    const entries = await db.financeJournalEntry.findMany({
      where: { bookId },
      include: { lines: true },
    })
    const allLines = entries.flatMap((entry) => entry.lines)
    for (const entry of entries) {
      expect(entry).toMatchObject({
        actorUserId: userId,
        storeId,
        reversalOfId: null,
      })
      expect(
        entry.lines.reduce(
          (net, line) => net + line.debitMinor - line.creditMinor,
          0n,
        ),
      ).toBe(0n)
    }
    const net = (accountId: string) =>
      allLines
        .filter((line) => line.accountId === accountId)
        .reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0n)
        .toString()
    expect(net(categoryId)).toBe(totalMinor)
    expect(net(cashId)).toBe(`-${paidMinor}`)
    const payable = await db.financeAccount.findUniqueOrThrow({
      where: { bookId_code: { bookId, code: "2000" } },
    })
    expect(net(payable.id)).toBe(`-${outstandingMinor}`)
    expect(
      await db.financeCommand.count({ where: { bookId: foreignBookId } }),
    ).toBe(0)
    expect(
      await db.financeJournalEntry.count({ where: { bookId: foreignBookId } }),
    ).toBe(0)
    const app = await assistantRouter
      .createCaller(browser)
      .conversation({ conversationId })
    expect(app.conversation.id).toBe(conversationId)
    expect(
      app.proposals.find((proposal) => proposal.id === pending.id),
    ).toMatchObject({
      status: "COMPLETED",
      revision: freshRow.revision,
      receipt: result.receipt,
    })
    expect(
      await db.assistantWhatsAppActionReview.count({
        where: { bindingId: fixture.principal.bindingId },
      }),
    ).toBe(0)
  }, 360_000)
})
