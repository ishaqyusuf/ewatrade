import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { capabilityForAction, capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { createFinanceBook } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

export async function verifySupplierCreation(original: GeneralContext, failingDb: GeneralContext["db"], conversationId: string) {
  const ctx = { ...original, requestHeaders: new Headers(original.requestHeaders) }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const db = ctx.db, tenantId = ctx.tenantContext.tenant.id
  if (process.env.RUN_GENERAL_SUPPLIER_CREATE !== "1" || !await db.tenant.findFirst({ where: { id: tenantId, dataClassification: "QA", slug: `general-${ctx.requestId}` }, select: { id: true } })) throw Error("Owned supplier QA fixture required")
  const capabilities = [capabilityForAction("supplier_create"), ...capabilityManifest.filter(c => ["finance.suppliers.read", "finance.supplier_statement.read"].includes(c.id))]
  const rollouts = capabilities.map(c => c.rollout)
  capabilities.forEach(c => Object.assign(c, { rollout: "source" }))
  let bookId: string | undefined
  try {
    const book = await createFinanceBook(db, { tenantId, actorUserId: ctx.session.user.id, startsAt: new Date("2026-01-01") })
    bookId = book.id
    const payload = { action: "supplier_create" as const, bookId: book.id, code: " qa-acme ", name: " QA ACME " }
    async function draft() {
      const created = await draftGeneralProposal(ctx, conversationId, payload)
      const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: created.proposalId } })
      const review = await generalProposalWithReview(ctx, row)
      expect(review.review?.join(" ")).toContain("QA ACME (QA-ACME)")
      expect(review.review?.join(" ")).toContain("no payable or advance")
      const app = generalProposalForApp(row)
      return { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" as const }
    }
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, bookId: randomUUID() })).rejects.toBeDefined()
    const stale = await draft(), command = await draft()
    console.info("Supplier acceptance: injected completion rollback")
    await expect(decideGeneralProposal({ ...ctx, db: failingDb }, command)).rejects.toThrow("Injected receipt failure")
    expect(await db.financeSupplierAccount.count({ where: { bookId } })).toBe(0)
    expect(await db.financeCommand.count({ where: { bookId } })).toBe(0)
    expect((await db.assistantActionProposal.findUniqueOrThrow({ where: { id: command.proposalId } })).status).toBe("PENDING")
    console.info("Supplier acceptance: concurrent confirmation and replay")
    const outcomes = await Promise.allSettled([decideGeneralProposal(ctx, command), decideGeneralProposal(ctx, command)])
    expect(outcomes.some(result => result.status === "fulfilled")).toBe(true)
    for (const result of outcomes) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "CONFLICT" })
    const completed = await decideGeneralProposal(ctx, command)
    expect(completed.receipt).toMatchObject({ kind: "finance_supplier", bookId })
    expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(completed.receipt)
    expect(await db.financeSupplierAccount.findMany({ where: { bookId }, select: { id: true, code: true, name: true } })).toEqual([{ id: completed.receipt!.recordId, code: "QA-ACME", name: "QA ACME" }])
    expect(await db.financeCommand.count({ where: { bookId } })).toBe(1)
    await expect(decideGeneralProposal(ctx, stale)).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(draftGeneralProposal(ctx, conversationId, payload)).rejects.toBeDefined()
    const tools = createGeneralTools(ctx, conversationId, () => { throw Error("Read created proposal") }, () => {})
    const search = tools.readSuppliers?.execute, statement = tools.readSupplierStatement?.execute
    if (!search || !statement) throw Error("Supplier tools missing")
    expect(await search({ bookId: book.id, query: "QA-ACME" }, { toolCallId: randomUUID(), messages: [] })).toMatchObject({ status: "available", data: { data: [expect.objectContaining({ id: completed.receipt!.recordId, code: "QA-ACME" })] } })
    expect(await statement({ bookId: book.id, supplierId: completed.receipt!.recordId }, { toolCallId: randomUUID(), messages: [] })).toMatchObject({ status: "available", data: { payableMinor: "0", advanceMinor: "0", data: [] } })
    expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(0)
    expect(await db.financeBill.count({ where: { bookId } })).toBe(0)
    console.info("Supplier acceptance: one identity, no financial postings verified")
  } finally {
    capabilities.forEach((c, index) => Object.assign(c, { rollout: rollouts[index] }))
    if (bookId) {
      await db.$transaction(async tx => {
        const owned = await tx.financeBook.findFirst({ where: { id: bookId, tenantId }, select: { id: true } })
        if (!owned) throw Error("Owned supplier Book missing")
        await tx.financeSupplierAccount.deleteMany({ where: { bookId: owned.id } })
        await tx.financeCommand.deleteMany({ where: { bookId: owned.id } })
        await tx.financeAccount.deleteMany({ where: { bookId: owned.id } })
        await tx.financeBook.delete({ where: { id: owned.id } })
      }, { maxWait: 10_000, timeout: 30_000 })
      expect(await db.financeBook.count({ where: { id: bookId } })).toBe(0)
      console.info("Supplier acceptance: owned financial cleanup verified")
    }
  }
}
