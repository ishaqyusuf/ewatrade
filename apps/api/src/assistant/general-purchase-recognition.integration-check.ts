import { expect } from "bun:test"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

/** Runs inside the registration suite's owned two-line QA agreement and Book. */
export async function verifyPurchaseRecognitionProposals(
  ctx: GeneralContext,
  failingDb: GeneralContext["db"],
  conversationId: string,
  bookId: string,
  recognitionId: string,
) {
  const db = ctx.db
  const invoice = {
    action: "purchase_recognize" as const, bookId, recognitionId, stage: "INVOICE" as const,
    effectiveAt: "2026-10-02T12:00:00.123Z", reference: "QA-INVOICE",
    factConfirmed: true as const, invoiceAmountMinor: "1100",
  }
  const ownership = {
    action: "purchase_recognize" as const, bookId, recognitionId, stage: "OWNERSHIP" as const,
    effectiveAt: "2026-10-03T12:00:00.123Z", reference: "QA-OWNERSHIP", factConfirmed: true as const,
  }
  async function draft(payload: typeof invoice | typeof ownership) {
    const created = await draftGeneralProposal(ctx, conversationId, payload)
    const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: created.proposalId } })
    const review = await generalProposalWithReview(ctx, row)
    const lines = review.review?.join(" ") ?? ""
    expect(lines).toContain("2.125 bag")
    expect(lines).toContain(payload.effectiveAt)
    expect(lines).toContain("No money is sent")
    expect(lines).toContain(payload.reference)
    const app = generalProposalForApp(row)
    return { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" as const }
  }
  await expect(draftGeneralProposal(ctx, conversationId, { ...invoice, invoiceAmountMinor: "1000" })).rejects.toBeDefined()
  await expect(draftGeneralProposal(ctx, conversationId, { ...invoice, bookId: "other-book" })).rejects.toBeDefined()
  const staleOwnership = await draft(ownership)
  const command = await draft(invoice)
  console.info("Recognition proposal acceptance: invoice completion rollback")
  await expect(decideGeneralProposal({ ...ctx, db: failingDb }, command)).rejects.toThrow("Injected receipt failure")
  expect(await db.financePurchaseRecognitionEvent.count({ where: { bookId } })).toBe(0)
  expect(await db.financeBill.count({ where: { bookId, kind: "PURCHASE" } })).toBe(0)
  expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(0)
  expect(await db.financeAccount.count({ where: { bookId, code: "1340" } })).toBe(0)
  expect((await db.assistantActionProposal.findUniqueOrThrow({ where: { id: command.proposalId } })).status).toBe("PENDING")
  console.info("Recognition proposal acceptance: concurrent invoice confirmation and recovery")
  const outcomes = await Promise.allSettled([decideGeneralProposal(ctx, command), decideGeneralProposal(ctx, command)])
  expect(outcomes.some(result => result.status === "fulfilled")).toBe(true)
  for (const result of outcomes) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "CONFLICT" })
  const completed = await decideGeneralProposal(ctx, command)
  expect(completed.receipt).toMatchObject({ kind: "finance_purchase_registration", recordId: recognitionId, bookId, title: "Purchase invoice recognized" })
  expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(completed.receipt)
  expect(await db.financeBill.count({ where: { bookId, kind: "PURCHASE" } })).toBe(1)
  expect(await db.financeSupplierEntry.findMany({ where: { bookId }, select: { kind: true, side: true, amountMinor: true } })).toEqual([{ kind: "PURCHASE_BILL", side: "CREDIT", amountMinor: 1100n }])
  await expect(decideGeneralProposal(ctx, staleOwnership)).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(draftGeneralProposal(ctx, conversationId, invoice)).rejects.toBeDefined()
  console.info("Recognition proposal acceptance: fresh ownership review and exact journals")
  const ownershipCommand = await draft(ownership)
  const owned = await decideGeneralProposal(ctx, ownershipCommand)
  expect(owned.receipt).toMatchObject({ recordId: recognitionId, bookId, title: "Purchase ownership recognized" })
  expect((await decideGeneralProposal(ctx, ownershipCommand)).receipt).toEqual(owned.receipt)
  expect(await db.financePurchaseRecognitionEvent.findMany({ where: { bookId }, orderBy: { effectiveAt: "asc" }, select: { stage: true, effectiveAt: true, reference: true } })).toEqual([
    { stage: "INVOICE", effectiveAt: new Date(invoice.effectiveAt), reference: invoice.reference },
    { stage: "OWNERSHIP", effectiveAt: new Date(ownership.effectiveAt), reference: ownership.reference },
  ])
  const journals = await db.financeJournalEntry.findMany({ where: { bookId }, orderBy: { sequence: "asc" }, include: { lines: { include: { account: true } } } })
  expect(journals).toHaveLength(2)
  expect(journals.map(j => j.lines.map(l => ({ code: l.account.code, debit: l.debitMinor, credit: l.creditMinor })).sort((a,b) => a.code.localeCompare(b.code)))).toEqual([
    [{ code: "1340", debit: 1100n, credit: 0n }, { code: "2000", debit: 0n, credit: 1100n }],
    [{ code: "1310", debit: 1100n, credit: 0n }, { code: "1340", debit: 0n, credit: 1100n }],
  ])
  expect(await db.financePurchaseReceiptLine.count({ where: { bookId } })).toBe(0)
  expect(await db.stockOperation.count({ where: { tenantId: ctx.tenantContext.tenant.id } })).toBe(0)
  expect(await db.financeBill.count({ where: { bookId, kind: "PURCHASE" } })).toBe(1)
  await db.membership.updateMany({ where: { tenantId: ctx.tenantContext.tenant.id, userId: ctx.session.user.id }, data: { role: "CASHIER" } })
  await expect(decideGeneralProposal(ctx, command)).rejects.toMatchObject({ code: "FORBIDDEN" })
}
