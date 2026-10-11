import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { createFinanceBook, ensureCustomerLedgerAccount, recordCustomerLedgerOpening, getCustomerLedgerAccountDetail } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

export async function verifyCustomerReceiptComposition(original: GeneralContext, failingDb: GeneralContext["db"], conversationId: string) {
  const ctx = { ...original, requestHeaders: new Headers(original.requestHeaders) }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const db = ctx.db, tenantId = ctx.tenantContext.tenant.id
  if (ctx.tenantContext.tenant.dataClassification !== "QA" || process.env.RUN_GENERAL_CUSTOMER_RECEIPT !== "1") throw Error("Explicit owned QA receipt test required")
  const owned = await db.tenant.findFirst({ where: { id: tenantId, dataClassification: "QA", slug: `general-${ctx.requestId}` }, select: { id: true } })
  if (!owned) throw Error("Owned receipt fixture required")
  const capability = capabilityForAction("customer_receipt"), rollout = capability.rollout
  Object.assign(capability, { rollout: "source" })
  try {
    const actor = { tenantId, actorUserId: ctx.session.user.id }
    console.info("Customer receipt acceptance: create Book and existing opening debt")
    const book = await createFinanceBook(db, { ...actor, startsAt: new Date("2026-01-01") })
    const customer = await db.customer.create({ data: { tenantId, name: "Customer receipt QA customer" } })
    const account = await ensureCustomerLedgerAccount(db, { ...actor, customerId: customer.id, currencyCode: ctx.tenantContext.tenant.currencyCode })
    const money = await db.financeAccount.findFirstOrThrow({ where: { bookId: book.id, code: "1000" } })
    await recordCustomerLedgerOpening(db, { ...actor, bookId: book.id, accountId: account.id, direction: "DEBT", amountMinor: "500", reason: "Existing opening debt", clientCommandId: randomUUID() })
    const payload = { action: "customer_receipt" as const, bookId: book.id, accountId: account.id,
      moneyAccountId: money.id, method: "CASH" as const, amountMinor: "1000",
      description: "New customer deposit received", moneyAlreadyReceived: true as const }
    async function draft() {
      const result = await draftGeneralProposal(ctx, conversationId, payload)
      const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: result.proposalId } })
      const reviewed = await generalProposalWithReview(ctx, row)
      expect(reviewed.review?.join(" ")).toContain("Customer receipt QA customer")
      expect(reviewed.review?.join(" ")).toContain("does not apply credit to orders")
      const app = generalProposalForApp(row)
      return { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" as const }
    }
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, accountId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, method: "BANK_TRANSFER" })).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
    console.info("Customer receipt acceptance: stale review refuses confirmation")
    const stale = await draft()
    await db.customerLedgerAccount.update({ where: { id: account.id }, data: { revision: { increment: 1 } } })
    await expect(decideGeneralProposal(ctx, stale)).rejects.toMatchObject({ code: "CONFLICT" })
    const command = await draft()
    const before = await db.customerLedgerAccount.findUniqueOrThrow({ where: { id: account.id } })
    console.info("Customer receipt acceptance: injected receipt failure rolls back new funds")
    await expect(decideGeneralProposal({ ...ctx, db: failingDb }, command)).rejects.toThrow("Injected receipt failure")
    expect(await db.customerLedgerEntry.count({ where: { accountId: account.id, kind: "RECEIPT" } })).toBe(0)
    expect(await db.customerLedgerReceipt.count({ where: { accountId: account.id } })).toBe(0)
    expect(await db.financeJournalEntry.count({ where: { bookId: book.id, sourceKind: "CUSTOMER_RECEIPT" } })).toBe(0)
    expect((await db.customerLedgerAccount.findUniqueOrThrow({ where: { id: account.id } })).revision).toBe(before.revision)
    expect((await db.assistantActionProposal.findUniqueOrThrow({ where: { id: command.proposalId } })).status).toBe("PENDING")
    console.info("Customer receipt acceptance: confirm and replay without debt settlement")
    const confirmedAfter = new Date()
    const completed = await decideGeneralProposal(ctx, command)
    expect(completed.receipt).toMatchObject({ kind: "customer", recordId: customer.id })
    expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(completed.receipt)
    const entries = await db.customerLedgerEntry.findMany({ where: { accountId: account.id, kind: "RECEIPT" } })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.amountMinor.toString()).toBe("1000")
    expect(entries[0]?.effectiveAt.getTime()).toBeGreaterThanOrEqual(confirmedAfter.getTime())
    expect(await db.customerLedgerReceipt.count({ where: { accountId: account.id } })).toBe(1)
    expect(await db.customerLedgerCommand.count({ where: { accountId: account.id, kind: "RECEIPT" } })).toBe(1)
    expect(await db.customerLedgerAllocation.count({ where: { accountId: account.id } })).toBe(0)
    const detail = await getCustomerLedgerAccountDetail(db, { ...actor, accountId: account.id })
    expect(detail.totals).toMatchObject({ outstandingDebtMinor: "500", availableCreditMinor: "1000" })
    const journals = await db.financeJournalEntry.findMany({ where: { bookId: book.id, sourceKind: "CUSTOMER_RECEIPT" }, include: { lines: { include: { account: true } } } })
    expect(journals).toHaveLength(1)
    expect(journals[0]?.lines).toHaveLength(2)
    expect(journals[0]?.lines.find(line => line.account.purpose === "CUSTOMER_ADVANCE")).toMatchObject({ debitMinor: 0n, creditMinor: 1000n })
    expect(journals[0]?.lines.find(line => line.accountId === money.id)).toMatchObject({ debitMinor: 1000n, creditMinor: 0n })
    expect((await db.customerLedgerAccount.findUniqueOrThrow({ where: { id: account.id } })).revision).toBe(before.revision + 1n)
    console.info("Customer receipt acceptance: atomic new funds, one balanced journal, unchanged debt and replay passed")
  } finally {
    Object.assign(capability, { rollout })
    console.info("Customer receipt acceptance: cleanup owned financial fixtures")
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
    console.info("Customer receipt acceptance: financial cleanup verified")
  }
}
