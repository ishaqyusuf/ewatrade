import { verifyBillPaymentComposition } from "./general-bill-payment.integration-check"
import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { capabilityForAction, capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { createFinanceBook, getFinanceBill } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

export async function verifyExpenseComposition(original: GeneralContext, failingDb: GeneralContext["db"], conversationId: string) {
  const ctx = { ...original, requestHeaders: new Headers(original.requestHeaders) }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const db = ctx.db, tenantId = ctx.tenantContext.tenant.id
  if (ctx.tenantContext.tenant.dataClassification !== "QA" || process.env.RUN_GENERAL_EXPENSE !== "1") throw Error("Explicit owned QA expense test required")
  if (!await db.tenant.findFirst({ where: { id: tenantId, dataClassification: "QA", slug: `general-${ctx.requestId}` }, select: { id: true } })) throw Error("Owned expense fixture required")
  const capabilities = [capabilityForAction("expense_record"), capabilityManifest.find(capability => capability.id === "finance.expense_categories.read")!]
  const rollouts = capabilities.map(capability => capability.rollout)
  capabilities.forEach(capability => Object.assign(capability, { rollout: "source" }))
  try {
    const actor = { tenantId, actorUserId: ctx.session.user.id }
    console.info("Expense acceptance: owned Book and actual category lookup")
    const book = await createFinanceBook(db, { ...actor, startsAt: new Date("2026-01-01") })
    const category = await db.financeAccount.findFirstOrThrow({ where: { bookId: book.id, purpose: "OPERATING_EXPENSE" } })
    const cash = await db.financeAccount.findFirstOrThrow({ where: { bookId: book.id, purpose: "CASH" } })
    const tools = createGeneralTools(ctx, conversationId, () => { throw Error("Read created proposal") }, () => {})
    const lookup = tools.readExpenseCategories?.execute
    if (!lookup) throw Error("Category tool missing")
    expect(await lookup({ bookId: book.id }, { toolCallId: randomUUID(), messages: [] })).toMatchObject({ status: "available", data: { book: { id: book.id }, accounts: [expect.objectContaining({ id: category.id, purpose: "OPERATING_EXPENSE" })] } })
    expect(await lookup({ bookId: randomUUID() }, { toolCallId: randomUUID(), messages: [] })).toMatchObject({ status: "unavailable" })
    const payload: Extract<GeneralAction, { action: "expense_record" }> = { action: "expense_record", bookId: book.id, payeeName: "QA landlord", description: "QA incurred rent", incurredAt: "2026-10-01T12:00:00.123Z", expenseAlreadyIncurred: true, lines: [{ accountId: category.id, description: "Rent", amountMinor: "1000" }], payment: { funding: "BUSINESS_ACCOUNT", accountId: cash.id, amountMinor: "250", effectiveAt: "2026-10-01T12:00:00.456Z", paymentAlreadyMade: true } }
    async function draft(input = payload) {
      const created = await draftGeneralProposal(ctx, conversationId, input)
      const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: created.proposalId } })
      const reviewed = await generalProposalWithReview(ctx, row)
      expect(reviewed.review?.join(" ")).toContain("Remaining payable")
      expect(reviewed.review?.join(" ")).toContain("does not send money")
      const app = generalProposalForApp(row)
      return { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" as const }
    }
    const stale = await draft()
    await db.financeAccount.update({ where: { id: category.id }, data: { name: "QA renamed category" } })
    await expect(decideGeneralProposal(ctx, stale)).rejects.toMatchObject({ code: "CONFLICT" })
    const command = await draft()
    console.info("Expense acceptance: rollback bill, payment and both journals")
    await expect(decideGeneralProposal({ ...ctx, db: failingDb }, command)).rejects.toThrow("Injected receipt failure")
    for (const count of [await db.financeBill.count({ where: { bookId: book.id } }), await db.financeBillPayment.count({ where: { bookId: book.id } }), await db.financeJournalEntry.count({ where: { bookId: book.id } }), await db.financeCommand.count({ where: { bookId: book.id } })]) expect(count).toBe(0)
    expect((await db.assistantActionProposal.findUniqueOrThrow({ where: { id: command.proposalId } })).status).toBe("PENDING")
    console.info("Expense acceptance: partial payment confirm/replay")
    const completed = await decideGeneralProposal(ctx, command)
    expect(completed.receipt).toMatchObject({ kind: "finance_bill", bookId: book.id })
    expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(completed.receipt)
    const bill = await getFinanceBill(db, { ...actor, bookId: book.id, billId: completed.receipt!.recordId })
    expect(bill).toMatchObject({ totalMinor: "1000", paidMinor: "250", outstandingMinor: "750" })
    expect(bill.payments).toHaveLength(1)
    expect(bill.payments[0]).toMatchObject({ amountMinor: "250", funding: "BUSINESS_ACCOUNT" })
    expect(bill.incurredAt.toISOString()).toBe(payload.incurredAt)
    expect(bill.payments[0]?.effectiveAt.toISOString()).toBe(payload.payment!.effectiveAt)
    console.info("Expense acceptance: unpaid and owner-funded expenses")
    for (const ownerFunded of [false, true]) {
      const input = { ...payload, description: ownerFunded ? "QA owner-funded expense" : "QA unpaid expense", payment: ownerFunded ? { funding: "OWNER_CAPITAL" as const, amountMinor: "1000", effectiveAt: payload.incurredAt, paymentAlreadyMade: true as const } : undefined }
      const result = await decideGeneralProposal(ctx, await draft(input))
      const saved = await getFinanceBill(db, { ...actor, bookId: book.id, billId: result.receipt!.recordId })
      expect(saved).toMatchObject({ paidMinor: ownerFunded ? "1000" : "0", outstandingMinor: ownerFunded ? "0" : "1000" })
      expect(saved.payments).toHaveLength(ownerFunded ? 1 : 0)
      if (ownerFunded) expect(saved.payments[0]?.funding).toBe("OWNER_CAPITAL")
    }
    const journals = await db.financeJournalEntry.findMany({ where: { bookId: book.id }, include: { lines: { include: { account: true } } } })
    expect(journals).toHaveLength(5)
    for (const journal of journals) expect(journal.lines.reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0n)).toBe(0n)
    const lines = journals.flatMap(journal => journal.lines)
    const net = (id: string) => lines.filter(line => line.accountId === id).reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0n).toString()
    expect(net(category.id)).toBe("3000")
    expect(net(cash.id)).toBe("-250")
    expect(await db.financeBill.count({ where: { bookId: book.id } })).toBe(3)
    expect(await db.financeBillPayment.count({ where: { bookId: book.id } })).toBe(2)
    console.info("Expense acceptance: balanced journals and exact payment ownership passed")
    if (process.env.RUN_GENERAL_BILL_PAYMENT === "1") await verifyBillPaymentComposition(ctx, failingDb, conversationId, book.id, cash.id)
  } finally {
    capabilities.forEach((capability, index) => Object.assign(capability, { rollout: rollouts[index] }))
    await db.$transaction(async tx => {
      const bookIds = (await tx.financeBook.findMany({ where: { tenantId }, select: { id: true } })).map(book => book.id)
      const where = { bookId: { in: bookIds } }
      await tx.financeBillPayment.deleteMany({ where })
      await tx.financeBillLine.deleteMany({ where })
      await tx.financeBill.deleteMany({ where })
      await tx.financeCommand.deleteMany({ where })
      await tx.financeJournalLine.deleteMany({ where })
      await tx.financeJournalEntry.deleteMany({ where: { ...where, reversalOfId: { not: null } } })
      await tx.financeJournalEntry.deleteMany({ where })
      await tx.financeAccount.deleteMany({ where })
      await tx.financeBook.deleteMany({ where: { tenantId } })
    }, { maxWait: 10_000, timeout: 30_000 })
    expect(await db.financeBook.count({ where: { tenantId } })).toBe(0)
    console.info("Expense acceptance: financial cleanup verified")
  }
}
