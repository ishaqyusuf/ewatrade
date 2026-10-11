import { expect } from "bun:test"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

/** Reuses the explicitly owned bill-payment fixture and its cleanup. */
export async function verifyBillCorrectionComposition(ctx: GeneralContext, failingDb: GeneralContext["db"], conversationId: string, bookId: string, billId: string) {
  const db = ctx.db, tenantId = ctx.tenantContext.tenant.id
  if (process.env.RUN_GENERAL_BILL_CORRECTION !== "1" || !await db.tenant.findFirst({ where: { id: tenantId, slug: `general-${ctx.requestId}`, dataClassification: "QA" } })) throw Error("Owned correction QA fixture required")
  const capabilities = [capabilityForAction("expense_void"), capabilityForAction("bill_payment_reverse")]
  const rollouts = capabilities.map(c => c.rollout)
  capabilities.forEach(c => Object.assign(c, { rollout: "source" }))
  try {
    const payments = await db.financeBillPayment.findMany({ where: { bookId, billId, reversedAt: null }, orderBy: { amountMinor: "asc" } })
    expect(payments.map(p => p.amountMinor)).toEqual([250n, 750n])
    const common = { bookId, effectiveAt: "2026-10-04T12:00:00.123Z", reason: "Duplicate bookkeeping entry", bookkeepingOnly: true as const }
    const voidPayload: GeneralAction = { ...common, action: "expense_void", billId }
    async function draft(payload: GeneralAction) {
      const result = await draftGeneralProposal(ctx, conversationId, payload)
      const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: result.proposalId } })
      const review = await generalProposalWithReview(ctx, row)
      expect(review.review?.join(" ")).toContain("does not refund, recover or transfer money")
      expect(review.review?.join(" ")).toContain("Remaining payable")
      const app = generalProposalForApp(row)
      return { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" as const }
    }
    console.info("Bill correction acceptance: paid void refusal and atomic reversal")
    await expect(draftGeneralProposal(ctx, conversationId, voidPayload)).rejects.toMatchObject({ code: "CONFLICT" })
    const first: GeneralAction = { ...common, action: "bill_payment_reverse", paymentId: payments[0]!.id }
    const stale = await draft(first), command = await draft(first)
    const before = await db.financeJournalEntry.count({ where: { bookId } })
    await expect(decideGeneralProposal({ ...ctx, db: failingDb }, command)).rejects.toThrow("Injected receipt failure")
    expect((await db.financeBill.findUniqueOrThrow({ where: { id: billId } })).paidMinor).toBe(1000n)
    expect((await db.financeBillPayment.findUniqueOrThrow({ where: { id: payments[0]!.id } })).reversedAt).toBeNull()
    expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(before)
    const saved = await decideGeneralProposal(ctx, command)
    expect(saved.receipt).toMatchObject({ kind: "finance_bill", recordId: billId, bookId })
    expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(saved.receipt)
    await expect(decideGeneralProposal(ctx, stale)).rejects.toMatchObject({ code: "CONFLICT" })
    expect((await db.financeBill.findUniqueOrThrow({ where: { id: billId } })).paidMinor).toBe(750n)
    expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(before + 1)
    await expect(draftGeneralProposal(ctx, conversationId, voidPayload)).rejects.toMatchObject({ code: "CONFLICT" })
    console.info("Bill correction acceptance: owner reversal then expense void")
    await decideGeneralProposal(ctx, await draft({ ...common, action: "bill_payment_reverse", paymentId: payments[1]!.id }))
    expect((await db.financeBill.findUniqueOrThrow({ where: { id: billId } })).paidMinor).toBe(0n)
    const voidCommand = await draft(voidPayload)
    await expect(decideGeneralProposal({ ...ctx, db: failingDb }, voidCommand)).rejects.toThrow("Injected receipt failure")
    expect((await db.financeBill.findUniqueOrThrow({ where: { id: billId } })).voidedAt).toBeNull()
    expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(before + 2)
    const voided = await decideGeneralProposal(ctx, voidCommand)
    expect((await decideGeneralProposal(ctx, voidCommand)).receipt).toEqual(voided.receipt)
    expect((await db.financeBill.findUniqueOrThrow({ where: { id: billId } })).voidedAt).not.toBeNull()
    expect(await db.financeBillPayment.count({ where: { bookId, billId } })).toBe(2)
    expect(await db.financeBillPayment.count({ where: { bookId, billId, reversedAt: null } })).toBe(0)
    const journals = await db.financeJournalEntry.findMany({ where: { bookId }, include: { lines: true } })
    expect(journals).toHaveLength(before + 3)
    for (const journal of journals) expect(journal.lines.reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0n)).toBe(0n)
    console.info("Bill correction acceptance: rollback/replay, retained history and balanced reversals passed")
  } finally { capabilities.forEach((c, index) => Object.assign(c, { rollout: rollouts[index] })) }
}
