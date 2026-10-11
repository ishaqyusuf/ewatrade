import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { createFinanceBook, getFinanceMoneyMovement } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

export async function verifyMoneyMovementComposition(original: GeneralContext, failingDb: GeneralContext["db"], conversationId: string) {
  const ctx = { ...original, requestHeaders: new Headers(original.requestHeaders) }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const db = ctx.db, tenantId = ctx.tenantContext.tenant.id
  if (ctx.tenantContext.tenant.dataClassification !== "QA" || process.env.RUN_GENERAL_MONEY_MOVEMENT !== "1") throw Error("Explicit owned QA movement test required")
  const owned = await db.tenant.findFirst({ where: { id: tenantId, dataClassification: "QA", slug: `general-${ctx.requestId}` }, select: { id: true } })
  if (!owned) throw Error("Owned movement fixture required")
  const capability = capabilityForAction("money_movement"), rollout = capability.rollout
  Object.assign(capability, { rollout: "source" })
  try {
    const actor = { tenantId, actorUserId: ctx.session.user.id }
    console.info("Money movement acceptance: create owned Book")
    const book = await createFinanceBook(db, { ...actor, startsAt: new Date("2026-01-01") })
    const cash = await db.financeAccount.findFirstOrThrow({ where: { bookId: book.id, purpose: "CASH" } })
    const bank = await db.financeAccount.findFirstOrThrow({ where: { bookId: book.id, purpose: "BANK" } })
    const payload = { action: "money_movement" as const, kind: "TRANSFER" as const, bookId: book.id, accountId: cash.id, destinationAccountId: bank.id, amountMinor: "1000", description: "Completed QA cash deposit", effectiveAt: "2026-10-01T12:00:00.123Z", movementAlreadyCompleted: true as const }
    async function draft(input = payload) {
      const result = await draftGeneralProposal(ctx, conversationId, input)
      const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: result.proposalId } })
      const reviewed = await generalProposalWithReview(ctx, row)
      expect(reviewed.review?.join(" ")).toContain("does not transfer money")
      expect(reviewed.review?.join(" ")).toContain(cash.name)
      const app = generalProposalForApp(row)
      return { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" as const }
    }
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, bookId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, effectiveAt: "2025-01-01T00:00:00.000Z" })).rejects.toBeDefined()
    const stale = await draft()
    await db.financeAccount.update({ where: { id: bank.id }, data: { name: "Renamed QA bank" } })
    await expect(decideGeneralProposal(ctx, stale)).rejects.toMatchObject({ code: "CONFLICT" })
    const command = await draft()
    console.info("Money movement acceptance: completion failure rolls back journal")
    await expect(decideGeneralProposal({ ...ctx, db: failingDb }, command)).rejects.toThrow("Injected receipt failure")
    expect(await db.financeJournalEntry.count({ where: { bookId: book.id } })).toBe(0)
    expect(await db.financeCommand.count({ where: { bookId: book.id } })).toBe(0)
    expect((await db.assistantActionProposal.findUniqueOrThrow({ where: { id: command.proposalId } })).status).toBe("PENDING")
    console.info("Money movement acceptance: confirm and response-loss replay")
    const completed = await decideGeneralProposal(ctx, command)
    expect(completed.receipt).toMatchObject({ kind: "finance_movement", bookId: book.id })
    expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(completed.receipt)
    const entry = await getFinanceMoneyMovement(db, { ...actor, bookId: book.id, entryId: completed.receipt!.recordId })
    expect(entry.sourceKind).toBe("TRANSFER")
    expect(entry.effectiveAt.toISOString()).toBe(payload.effectiveAt)
    expect(entry.lines).toHaveLength(2)
    expect(entry.lines.find(line => line.accountId === cash.id)).toMatchObject({ debitMinor: "0", creditMinor: "1000" })
    expect(entry.lines.find(line => line.accountId === bank.id)).toMatchObject({ debitMinor: "1000", creditMinor: "0", accountName: "Renamed QA bank" })
    expect(await db.financeJournalEntry.count({ where: { bookId: book.id } })).toBe(1)
    expect(await db.financeCommand.count({ where: { bookId: book.id } })).toBe(1)
    expect(await db.customerLedgerReceipt.count({ where: { entry: { tenantId } } })).toBe(0)
    console.info("Money movement acceptance: one balanced journal and receipt read passed")
  } finally {
    Object.assign(capability, { rollout })
    console.info("Money movement acceptance: cleanup owned fixtures")
    await db.$transaction(async tx => {
      const books = await tx.financeBook.findMany({ where: { tenantId }, select: { id: true } })
      const bookIds = books.map(book => book.id)
      await tx.financeCommand.deleteMany({ where: { bookId: { in: bookIds } } })
      await tx.financeJournalLine.deleteMany({ where: { bookId: { in: bookIds } } })
      await tx.financeJournalEntry.deleteMany({ where: { bookId: { in: bookIds } } })
      await tx.financeAccount.deleteMany({ where: { bookId: { in: bookIds } } })
      await tx.financeBook.deleteMany({ where: { tenantId } })
    }, { maxWait: 10_000, timeout: 30_000 })
    expect(await db.financeBook.count({ where: { tenantId } })).toBe(0)
    console.info("Money movement acceptance: cleanup verified")
  }
}
