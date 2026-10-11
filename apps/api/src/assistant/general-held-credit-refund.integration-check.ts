import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { createFinanceBook, ensureCustomerLedgerAccount, recordCustomerLedgerReceipt } from "@ewatrade/db/queries"
import { withPerformanceTrace } from "@ewatrade/db/performance-tracing"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

/** Isolated test-process activation only; no merchant or runtime availability change. */
export async function verifyHeldCreditRefundComposition(original: GeneralContext, failingDb: GeneralContext["db"], conversationId: string) {
  const ctx = { ...original, requestHeaders: new Headers(original.requestHeaders) }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  if (ctx.tenantContext.tenant.dataClassification !== "QA" || process.env.RUN_GENERAL_HELD_CREDIT_REFUND !== "1") throw Error("Explicit owned QA refund test required")
  const owned = await db.tenant.findFirst({ where: { id: tenantId, dataClassification: "QA", slug: `general-${ctx.requestId}` }, select: { id: true } })
  if (!owned) throw Error("Owned refund fixture required")
  const capability = capabilityForAction("held_credit_refund")
  const rollout = capability.rollout
  Object.assign(capability, { rollout: "source" })
  const trace = <T>(stage: string, work: () => Promise<T>) => withPerformanceTrace("job", work, measurement => console.info(JSON.stringify({ stage, ...measurement })))
  try {
    const actor = { tenantId, actorUserId: ctx.session.user.id }
    console.info("Held refund acceptance: create Book and actual customer deposit")
    const book = await createFinanceBook(db, { ...actor, startsAt: new Date("2026-01-01") })
    const customer = await db.customer.create({ data: { tenantId, name: "Held refund QA customer" } })
    const account = await ensureCustomerLedgerAccount(db, { ...actor, customerId: customer.id, currencyCode: ctx.tenantContext.tenant.currencyCode })
    const money = await db.financeAccount.findFirstOrThrow({ where: { bookId: book.id, code: "1000" } })
    const deposit = await recordCustomerLedgerReceipt(db, {
      ...actor, bookId: book.id, accountId: account.id, moneyAccountId: money.id,
      method: "CASH", amountMinor: "1000", description: "QA unused customer deposit", clientCommandId: randomUUID(),
    })
    const receipt = await db.customerLedgerReceipt.findUniqueOrThrow({ where: { id: deposit.id } })
    const payload = { action: "held_credit_refund" as const, bookId: book.id, accountId: account.id,
      creditEntryId: receipt.entryId, moneyAccountId: money.id, method: "CASH" as const,
      amountMinor: "250", effectiveAt: new Date().toISOString(), reason: "Customer collected unused deposit", moneyAlreadyReturned: true as const }
    async function draft() {
      const result = await trace("held-refund-draft", () => draftGeneralProposal(ctx, conversationId, payload))
      const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: result.proposalId } })
      const reviewed = await generalProposalWithReview(ctx, row)
      expect(reviewed.review?.join(" ")).toContain("Held refund QA customer")
      expect(reviewed.review?.join(" ")).toContain("does not send money")
      const app = generalProposalForApp(row)
      return { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" as const }
    }
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, accountId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, amountMinor: "1001" })).rejects.toMatchObject({ code: "CONFLICT" })
    console.info("Held refund acceptance: stale account refuses confirmation")
    const stale = await draft()
    await db.customerLedgerAccount.update({ where: { id: account.id }, data: { revision: { increment: 1 } } })
    await expect(decideGeneralProposal(ctx, stale)).rejects.toMatchObject({ code: "CONFLICT" })
    const command = await draft()
    const before = await db.customerLedgerAccount.findUniqueOrThrow({ where: { id: account.id } })
    console.info("Held refund acceptance: injected receipt failure must roll back all effects")
    await expect(trace("held-refund-rollback", () => decideGeneralProposal({ ...ctx, db: failingDb }, command))).rejects.toThrow("Injected receipt failure")
    expect(await db.customerLedgerEntry.count({ where: { accountId: account.id, kind: "REFUND" } })).toBe(0)
    expect(await db.customerLedgerAllocation.count({ where: { accountId: account.id } })).toBe(0)
    expect(await db.financeJournalEntry.count({ where: { bookId: book.id, sourceKind: "CUSTOMER_HELD_CREDIT_REFUND" } })).toBe(0)
    expect((await db.customerLedgerAccount.findUniqueOrThrow({ where: { id: account.id } })).revision).toBe(before.revision)
    expect((await db.assistantActionProposal.findUniqueOrThrow({ where: { id: command.proposalId } })).status).toBe("PENDING")
    console.info("Held refund acceptance: confirm and replay exactly once")
    const completed = await trace("held-refund-confirm", () => decideGeneralProposal(ctx, command))
    expect(completed.receipt).toMatchObject({ kind: "customer", recordId: customer.id })
    expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(completed.receipt)
    const entries = await db.customerLedgerEntry.findMany({ where: { accountId: account.id, kind: "REFUND" } })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.amountMinor.toString()).toBe("250")
    const allocations = await db.customerLedgerAllocation.findMany({ where: { accountId: account.id } })
    expect(allocations).toHaveLength(1)
    expect(allocations[0]).toMatchObject({ creditEntryId: receipt.entryId, chargeEntryId: entries[0]?.id, amountMinor: 250n })
    const journals = await db.financeJournalEntry.findMany({ where: { bookId: book.id, sourceKind: "CUSTOMER_HELD_CREDIT_REFUND" }, include: { lines: { include: { account: true } } } })
    expect(journals).toHaveLength(1)
    expect(journals[0]?.lines).toHaveLength(2)
    expect(journals[0]?.lines.find(line => line.account.purpose === "CUSTOMER_ADVANCE")).toMatchObject({ debitMinor: 250n, creditMinor: 0n })
    expect(journals[0]?.lines.find(line => line.accountId === money.id)).toMatchObject({ debitMinor: 0n, creditMinor: 250n })
    expect((await db.customerLedgerAccount.findUniqueOrThrow({ where: { id: account.id } })).revision).toBe(before.revision + 1n)
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, amountMinor: "751" })).rejects.toMatchObject({ code: "CONFLICT" })
    console.info("Held refund acceptance: rollback, balanced posting, remaining-credit cap and replay passed")
  } finally {
    Object.assign(capability, { rollout })
    console.info("Held refund acceptance: cleanup owned financial fixtures")
    await db.$transaction(async tx => {
      const books = await tx.financeBook.findMany({ where: { tenantId }, select: { id: true } })
      const bookIds = books.map(book => book.id)
      await tx.customerLedgerCommand.deleteMany({ where: { tenantId } })
      await tx.customerLedgerAllocationRelease.deleteMany({ where: { allocation: { credit: { tenantId } } } })
      await tx.customerLedgerAllocation.deleteMany({ where: { credit: { tenantId } } })
      await tx.customerLedgerReceipt.deleteMany({ where: { entry: { tenantId } } })
      await tx.customerLedgerEntry.deleteMany({ where: { tenantId } })
      await tx.customerLedgerAccount.deleteMany({ where: { tenantId } })
      await tx.financeCommand.deleteMany({ where: { bookId: { in: bookIds } } })
      await tx.financeJournalLine.deleteMany({ where: { bookId: { in: bookIds } } })
      await tx.financeJournalEntry.deleteMany({ where: { bookId: { in: bookIds } } })
      await tx.financeAccount.deleteMany({ where: { bookId: { in: bookIds } } })
      await tx.financeBook.deleteMany({ where: { tenantId } })
    }, { maxWait: 10_000, timeout: 30_000 })
    expect(await db.financeBook.count({ where: { tenantId } })).toBe(0)
    expect(await db.customerLedgerAccount.count({ where: { tenantId } })).toBe(0)
    console.info("Held refund acceptance: financial cleanup verified")
  }
}
