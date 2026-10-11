import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { capabilityForAction, capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { createFinanceBook, createFinanceSupplier } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

/** Uses the outer suite's owned QA tenant; only this helper owns its Finance Book. */
export async function verifyPurchaseRegistration(original: GeneralContext, failingDb: GeneralContext["db"], conversationId: string) {
  const ctx = { ...original, requestHeaders: new Headers(original.requestHeaders) }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const db = ctx.db, tenantId = ctx.tenantContext.tenant.id
  if (process.env.RUN_GENERAL_PURCHASE_REGISTER !== "1" || !await db.tenant.findFirst({ where: { id: tenantId, dataClassification: "QA", slug: `general-${ctx.requestId}` }, select: { id: true } })) throw Error("Owned registration QA fixture required")
  const capabilities = [capabilityForAction("purchase_register"), ...capabilityManifest.filter(c => ["finance.purchase_registrations.read", "finance.purchase_recognition.read", "finance.purchases.read"].includes(c.id))]
  const rollouts = capabilities.map(c => c.rollout)
  capabilities.forEach(c => Object.assign(c, { rollout: "source" }))
  let bookId: string | undefined
  try {
    const actor = { tenantId, actorUserId: ctx.session.user.id }
    const book = await createFinanceBook(db, { ...actor, startsAt: new Date("2026-01-01") })
    bookId = book.id
    const supplier = await createFinanceSupplier(db, { ...actor, bookId, clientCommandId: `supplier-${ctx.requestId}`, code: "AGREEMENT", name: "QA agreement supplier" })
    async function goods(label: string) {
      const item = await db.catalogItem.create({ data: { tenantId, slug: `agreement-${ctx.requestId}-${label}`, kind: "PRODUCT", name: `QA ${label}`, product: { create: {} }, variants: { create: { key: "default", name: "Default", isDefault: true } } }, include: { product: true, variants: true } })
      const variant = item.variants[0]
      if (!item.product || !variant) throw Error("QA product graph missing")
      const config = await db.unitConfigurationVersion.create({ data: { productId: item.product.id, version: 1, status: "CURRENT", canonicalBalanceScale: 18, units: { create: { key: "bag", name: "bag", factor: "1", stockBehavior: "CANONICAL_SHARED", transactionScale: 3 } } }, include: { units: true } })
      const unit = config.units[0]
      if (!unit) throw Error("QA unit missing")
      await db.catalogProduct.update({ where: { id: item.product.id }, data: { currentUnitConfigurationVersionId: config.id } })
      const source = await db.stockBalanceSource.create({ data: { tenantId, storeId: ctx.activeStoreId!, productId: item.product.id, variantId: variant.id, inventoryUnitId: unit.id, kind: "SHARED_POOL" } })
      return { balanceSourceId: source.id, enteredInventoryUnitId: unit.id, expectedConfigurationVersionId: config.id }
    }
    const [first, second] = await Promise.all([goods("flour"), goods("sugar")])
    const payload = { action: "purchase_register" as const, bookId, supplierId: supplier.id, description: "QA agreed goods", agreedAt: "2026-10-01T12:00:00.123Z", agreementOnly: true as const,
      lines: [{ ...first, enteredQuantity: "2.125", amountMinor: "1000", description: "Flour", categories: [{ name: "Purchase" }] }, { ...second, enteredQuantity: "1", amountMinor: "100", description: "Sugar", categories: [{ name: "Purchase" }] }] }
    async function draft() {
      const created = await draftGeneralProposal(ctx, conversationId, payload)
      const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: created.proposalId } })
      const review = await generalProposalWithReview(ctx, row)
      expect(review.review?.join(" ")).toContain("2.125 bag")
      expect(review.review?.join(" ")).toContain(payload.agreedAt)
      expect(review.review?.join(" ")).toContain("No payable or stock is created")
      const app = generalProposalForApp(row)
      return { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" as const }
    }
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, supplierId: randomUUID() })).rejects.toBeDefined()
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, lines: [{ ...payload.lines[0]!, expectedConfigurationVersionId: randomUUID() }] })).rejects.toBeDefined()
    const command = await draft()
    console.info("Registration acceptance: injected completion rollback")
    await expect(decideGeneralProposal({ ...ctx, db: failingDb }, command)).rejects.toThrow("Injected receipt failure")
    expect(await db.financePurchaseRecognition.count({ where: { bookId } })).toBe(0)
    expect(await db.financeBill.count({ where: { bookId } })).toBe(0)
    expect(await db.financeCommand.count({ where: { bookId } })).toBe(1)
    expect((await db.assistantActionProposal.findUniqueOrThrow({ where: { id: command.proposalId } })).status).toBe("PENDING")
    console.info("Registration acceptance: concurrent confirmation and replay")
    const outcomes = await Promise.allSettled([decideGeneralProposal(ctx, command), decideGeneralProposal(ctx, command)])
    expect(outcomes.some(result => result.status === "fulfilled")).toBe(true)
    for (const result of outcomes) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "CONFLICT" })
    const completed = await decideGeneralProposal(ctx, command)
    expect(completed.receipt).toMatchObject({ kind: "finance_purchase_registration", bookId })
    expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(completed.receipt)
    const recognitionId = completed.receipt!.recordId
    expect(await db.financePurchaseRecognition.count({ where: { bookId } })).toBe(1)
    expect(await db.financePurchaseRecognitionLine.count({ where: { bookId } })).toBe(2)
    expect(await db.financeBill.findMany({ where: { bookId }, select: { kind: true, totalMinor: true } })).toEqual([{ kind: "PURCHASE_ACCRUAL", totalMinor: 1100n }])
    expect(await db.financeCommand.count({ where: { bookId } })).toBe(2)
    const tools = createGeneralTools(ctx, conversationId, () => { throw Error("Read created proposal") }, () => {})
    const list = tools.readPurchaseRegistrations?.execute, detail = tools.readPurchaseRecognition?.execute, bills = tools.readPurchaseBills?.execute
    if (!list || !detail || !bills) throw Error("Purchase read tools missing")
    const options = { toolCallId: randomUUID(), messages: [] }
    expect(await list({ bookId, supplierId: supplier.id }, options)).toMatchObject({ status: "available", data: { items: [{ id: recognitionId, amountMinor: "1100", description: payload.description }], nextCursor: null } })
    expect(await detail({ bookId, recognitionId }, options)).toMatchObject({ status: "available", data: { id: recognitionId, currencyCode: "NGN", supplierName: "QA agreement supplier", amountMinor: "1100", agreedAt: new Date(payload.agreedAt), invoiceBillId: null, events: [], lines: [expect.objectContaining({ enteredQuantity: "2.125", enteredUnitName: "bag", receiptId: null }), expect.objectContaining({ enteredQuantity: "1", enteredUnitName: "bag", receiptId: null })] } })
    expect(await bills({ bookId, supplierId: supplier.id }, options)).toMatchObject({ status: "available", data: { items: [], count: 0 } })
    expect(await db.financePurchaseRecognitionEvent.count({ where: { bookId } })).toBe(0)
    expect(await db.financePurchaseReceiptLine.count({ where: { bookId } })).toBe(0)
    expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(0)
    expect(await db.stockOperation.count({ where: { tenantId } })).toBe(0)
    console.info("Registration acceptance: fresh supplier and authority guards")
    const changed = await draft()
    await db.financeSupplierAccount.update({ where: { id: supplier.id }, data: { name: "Changed supplier" } })
    await expect(decideGeneralProposal(ctx, changed)).rejects.toMatchObject({ code: "CONFLICT" })
    const revoked = await draft()
    await db.membership.updateMany({ where: { tenantId, userId: actor.actorUserId }, data: { role: "CASHIER" } })
    await expect(decideGeneralProposal(ctx, revoked)).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(await db.financePurchaseRecognition.count({ where: { bookId } })).toBe(1)
  } finally {
    capabilities.forEach((c, index) => Object.assign(c, { rollout: rollouts[index] }))
    if (bookId) {
      await db.$transaction(async tx => {
        const owned = await tx.financeBook.findFirst({ where: { id: bookId, tenantId, tenant: { dataClassification: "QA", slug: `general-${ctx.requestId}` } }, select: { id: true } })
        if (!owned) throw Error("Owned registration Book missing")
        const scope = { bookId: owned.id }
        await tx.financePurchaseRecognitionLine.deleteMany({ where: scope })
        await tx.financePurchaseRecognition.deleteMany({ where: scope })
        await tx.financeBillLine.deleteMany({ where: scope })
        await tx.financeBill.deleteMany({ where: scope })
        await tx.financeSupplierAccount.deleteMany({ where: scope })
        await tx.financeCommand.deleteMany({ where: scope })
        await tx.financeAccount.deleteMany({ where: scope })
        await tx.financeBook.delete({ where: { id: owned.id } })
      }, { maxWait: 10_000, timeout: 30_000 })
      const counts = await Promise.all([db.financeBook.count({ where: { id: bookId } }), db.financePurchaseRecognition.count({ where: { bookId } }), db.financeBill.count({ where: { bookId } }), db.financeCommand.count({ where: { bookId } })])
      expect(counts).toEqual([0, 0, 0, 0])
      console.info("Registration acceptance: four independent financial cleanup checks clear")
    }
  }
}
