import { verifyBillCorrectionComposition } from "./general-bill-correction.integration-check"
import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { capabilityForAction, capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { getFinanceBill } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

/** Runs within the owned expense fixture; outer finally owns all cleanup. */
export async function verifyBillPaymentComposition(ctx: GeneralContext, failingDb: GeneralContext["db"], conversationId: string, bookId: string, cashId: string) {
  if (ctx.tenantContext.tenant.dataClassification !== "QA" || process.env.RUN_GENERAL_BILL_PAYMENT !== "1") throw Error("Explicit owned QA bill-payment test required")
  const db = ctx.db, tenantId = ctx.tenantContext.tenant.id
  if (!await db.tenant.findFirst({ where: { id: tenantId, slug: `general-${ctx.requestId}`, dataClassification: "QA" } })) throw Error("Owned fixture required")
  const capabilities = [capabilityForAction("bill_payment"), ...capabilityManifest.filter(c => ["finance.bills.read", "finance.bill.read"].includes(c.id))]
  const rollouts = capabilities.map(c => c.rollout)
  capabilities.forEach(c => Object.assign(c, { rollout: "source" }))
  try {
    const actor = { tenantId, actorUserId: ctx.session.user.id }
    const bill = await db.financeBill.findFirstOrThrow({ where: { bookId, paidMinor: 0n, kind: "EXPENSE", voidedAt: null } })
    const tools = createGeneralTools(ctx, conversationId, () => { throw Error("Read created proposal") }, () => {})
    async function read(name: string, input: unknown) { const execute = tools[name]?.execute; if (!execute) throw Error(`Missing ${name}`); return execute(input, { toolCallId: randomUUID(), messages: [] }) }
    console.info("Bill payment acceptance: actual discovery tools")
    expect(await read("readExpenseBills", { bookId, status: "UNPAID" })).toMatchObject({ status: "available", data: { items: [expect.objectContaining({ id: bill.id, outstandingMinor: "1000" })] } })
    expect(await read("readExpenseBill", { bookId, billId: bill.id })).toMatchObject({ status: "available", data: { id: bill.id, paidMinor: "0", paymentCount: 0, paymentHistoryComplete: true } })
    expect(await read("readExpenseBill", { bookId, billId: randomUUID() })).toMatchObject({ status: "unavailable" })
    const payload: Extract<GeneralAction, { action: "bill_payment" }> = { action: "bill_payment", bookId, billId: bill.id, funding: "BUSINESS_ACCOUNT", accountId: cashId, amountMinor: "250", effectiveAt: "2026-10-02T12:00:00.123Z", paymentAlreadyMade: true }
    async function draft(input = payload) {
      const result = await draftGeneralProposal(ctx, conversationId, input)
      const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: result.proposalId } })
      const review = await generalProposalWithReview(ctx, row)
      expect(review.review?.join(" ")).toContain(bill.payeeName)
      expect(review.review?.join(" ")).toContain("does not send money or create another expense")
      const app = generalProposalForApp(row)
      return { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" as const }
    }
    const stale = await draft(), command = await draft()
    console.info("Bill payment acceptance: rollback and concurrent confirmations")
    await expect(decideGeneralProposal({ ...ctx, db: failingDb }, command)).rejects.toThrow("Injected receipt failure")
    expect((await db.financeBill.findUniqueOrThrow({ where: { id: bill.id } })).paidMinor).toBe(0n)
    expect(await db.financeBillPayment.count({ where: { billId: bill.id, bookId } })).toBe(0)
    expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(5)
    const attempts = await Promise.allSettled([decideGeneralProposal(ctx, command), decideGeneralProposal(ctx, command)])
    expect(attempts.some(result => result.status === "fulfilled")).toBe(true)
    for (const result of attempts) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "CONFLICT" })
    const recovered = await decideGeneralProposal(ctx, command)
    expect(recovered.receipt).toMatchObject({ kind: "finance_bill", recordId: bill.id, bookId })
    for (const result of attempts) if (result.status === "fulfilled") expect(result.value.receipt).toEqual(recovered.receipt)
    await expect(decideGeneralProposal(ctx, stale)).rejects.toMatchObject({ code: "CONFLICT" })
    expect(await db.financeBillPayment.count({ where: { billId: bill.id, bookId } })).toBe(1)
    expect((await getFinanceBill(db, { ...actor, bookId, billId: bill.id })).outstandingMinor).toBe("750")
    console.info("Bill payment acceptance: void and closed-period refusal")
    const periodDraft = await draft()
    await db.financeBook.update({ where: { id: bookId }, data: { closedThrough: new Date("2026-10-03") } })
    await expect(decideGeneralProposal(ctx, periodDraft)).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
    await db.financeBook.update({ where: { id: bookId }, data: { closedThrough: null } })
    await db.financeBill.update({ where: { id: bill.id }, data: { voidedAt: new Date() } })
    await expect(draftGeneralProposal(ctx, conversationId, payload)).rejects.toMatchObject({ code: "CONFLICT" })
    await db.financeBill.update({ where: { id: bill.id }, data: { voidedAt: null } })
    const { accountId: _account, ...ownerPayload } = payload
    const owner = await draft({ ...ownerPayload, funding: "OWNER_CAPITAL", amountMinor: "750" })
    await decideGeneralProposal(ctx, owner)
    const final = await getFinanceBill(db, { ...actor, bookId, billId: bill.id })
    expect(final).toMatchObject({ totalMinor: "1000", paidMinor: "1000", outstandingMinor: "0" })
    expect(final.payments).toHaveLength(2)
    expect(final.payments.find(payment => payment.funding === "OWNER_CAPITAL")?.amountMinor).toBe("750")
    expect(await read("readExpenseBill", { bookId, billId: bill.id })).toMatchObject({ status: "available", data: { paidMinor: "1000", outstandingMinor: "0", paymentCount: 2 } })
    expect(await db.financeBill.count({ where: { bookId } })).toBe(3)
    const journals = await db.financeJournalEntry.findMany({ where: { bookId }, include: { lines: true } })
    expect(journals).toHaveLength(7)
    for (const journal of journals) expect(journal.lines.reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0n)).toBe(0n)
    expect(journals.flatMap(j => j.lines).filter(line => line.accountId === cashId).reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0n)).toBe(-500n)
    if (process.env.RUN_GENERAL_BILL_CORRECTION === "1") await verifyBillCorrectionComposition(ctx, failingDb, conversationId, bookId, bill.id)
    console.info("Bill payment acceptance: one payment per confirmation, owner funding and no duplicate expense passed")
  } finally { capabilities.forEach((c, index) => Object.assign(c, { rollout: rollouts[index] })) }
}
