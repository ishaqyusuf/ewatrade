import { createGeneralTools } from "./general-tools"
import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { capabilityForAction, capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { createFinanceBook, ensureCustomerLedgerAccount, recordCustomerLedgerOpening, getCustomerLedgerAccountDetail } from "@ewatrade/db/queries"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"
export async function verifyCustomerCreditComposition(original: GeneralContext, failingDb: GeneralContext["db"], conversationId: string) {
 const ctx = {...original, requestHeaders: new Headers(original.requestHeaders)}
 ctx.requestHeaders.set("x-assistant-client", "dashboard")
 const db = ctx.db, tenantId = ctx.tenantContext.tenant.id
 if (ctx.tenantContext.tenant.dataClassification !== "QA" || process.env.RUN_GENERAL_CUSTOMER_CREDIT !== "1") throw Error("Explicit owned QA credit test required")
 const owned = await db.tenant.findFirst({where:{id:tenantId,dataClassification:"QA",slug:`general-${ctx.requestId}`},select:{id:true}})
 if (!owned) throw Error("Owned credit fixture required")
 const caps = [capabilityForAction("customer_credit_apply"), capabilityForAction("customer_allocation_release"), ...capabilityManifest.filter(cap => cap.id === "customers.entry.read" || cap.id === "customers.allocation_history.read")]
 const rollouts = caps.map(cap => cap.rollout)
 for (const cap of caps) Object.assign(cap,{rollout:"source"})
 try {
  const actor = {tenantId, actorUserId:ctx.session.user.id}
  console.info("Customer credit acceptance: create Book and opening balances")
  const book = await createFinanceBook(db,{...actor,startsAt:new Date("2026-01-01")})
  const customer = await db.customer.create({data:{tenantId,name:"Customer allocation QA"}})
  const account = await ensureCustomerLedgerAccount(db,{...actor,customerId:customer.id,currencyCode:ctx.tenantContext.tenant.currencyCode})
  await recordCustomerLedgerOpening(db,{...actor,bookId:book.id,accountId:account.id,direction:"DEBT",amountMinor:"500",reason:"Existing debt",clientCommandId:randomUUID()})
  await recordCustomerLedgerOpening(db,{...actor,bookId:book.id,accountId:account.id,direction:"CREDIT",amountMinor:"1000",reason:"Existing credit",clientCommandId:randomUUID()})
  const credit = await db.customerLedgerEntry.findFirstOrThrow({where:{accountId:account.id,kind:"OPENING_CREDIT"}})
  const charge = await db.customerLedgerEntry.findFirstOrThrow({where:{accountId:account.id,kind:"OPENING_DEBT"}})
  const apply = {action:"customer_credit_apply" as const,bookId:book.id,accountId:account.id,creditEntryId:credit.id,chargeEntryId:charge.id,amountMinor:"300"}
  async function draft(payload: GeneralAction) {
   const result = await draftGeneralProposal(ctx,conversationId,payload)
   const row = await db.assistantActionProposal.findUniqueOrThrow({where:{id:result.proposalId}})
   const review = await generalProposalWithReview(ctx,row)
   expect(review.review?.join(" ")).toContain("Customer allocation QA")
   expect(review.review?.join(" ")).toContain(payload.action === "customer_credit_apply" ? "No money is collected" : "No money is refunded")
   const app = generalProposalForApp(row)
   return {proposalId:app.id,revision:app.revision,approvalToken:app.approvalToken,decision:"confirm" as const}
  }
  await expect(draftGeneralProposal(ctx,conversationId,{...apply,amountMinor:"501"})).rejects.toMatchObject({code:"CONFLICT"})
  await expect(draftGeneralProposal(ctx,conversationId,{...apply,creditEntryId:randomUUID()})).rejects.toMatchObject({code:"INVALID_JOURNAL"})
  const stale = await draft(apply)
  await db.customerLedgerAccount.update({where:{id:account.id},data:{revision:{increment:1}}})
  await expect(decideGeneralProposal(ctx,stale)).rejects.toMatchObject({code:"CONFLICT"})
  console.info("Customer credit acceptance: apply rollback and retry")
  const command = await draft(apply)
  await expect(decideGeneralProposal({...ctx,db:failingDb},command)).rejects.toThrow("Injected receipt failure")
  expect(await db.customerLedgerAllocation.count({where:{accountId:account.id}})).toBe(0)
  expect(await db.financeJournalEntry.count({where:{bookId:book.id,sourceKind:"CUSTOMER_CREDIT_ALLOCATION"}})).toBe(0)
  expect((await db.assistantActionProposal.findUniqueOrThrow({where:{id:command.proposalId}})).status).toBe("PENDING")
  const completed = await decideGeneralProposal(ctx,command)
  expect(completed.receipt).toMatchObject({kind:"customer",recordId:customer.id})
  expect((await decideGeneralProposal(ctx,command)).receipt).toEqual(completed.receipt)
  expect((await getCustomerLedgerAccountDetail(db,{...actor,accountId:account.id})).totals).toMatchObject({availableCreditMinor:"700",outstandingDebtMinor:"200"})
  const allocations = await db.customerLedgerAllocation.findMany({where:{accountId:account.id}})
  expect(allocations).toHaveLength(1)
  const allocation = allocations[0]!
  const release = {action:"customer_allocation_release" as const,bookId:book.id,accountId:account.id,allocationId:allocation.id,amountMinor:"100",reason:"Correct partial allocation"}
  await expect(draftGeneralProposal(ctx,conversationId,{...release,amountMinor:"301"})).rejects.toMatchObject({code:"CONFLICT"})
  console.info("Customer credit acceptance: release rollback and retry")
  const releaseCommand = await draft(release)
  await expect(decideGeneralProposal({...ctx,db:failingDb},releaseCommand)).rejects.toThrow("Injected receipt failure")
  expect(await db.customerLedgerAllocationRelease.count({where:{allocationId:allocation.id}})).toBe(0)
  expect(await db.financeJournalEntry.count({where:{bookId:book.id,sourceKind:"CUSTOMER_ALLOCATION_RELEASE"}})).toBe(0)
  const released = await decideGeneralProposal(ctx,releaseCommand)
  expect((await decideGeneralProposal(ctx,releaseCommand)).receipt).toEqual(released.receipt)
  expect(await db.customerLedgerAllocationRelease.count({where:{allocationId:allocation.id}})).toBe(1)
  expect((await getCustomerLedgerAccountDetail(db,{...actor,accountId:account.id})).totals).toMatchObject({availableCreditMinor:"800",outstandingDebtMinor:"300"})
  expect(await db.customerLedgerCommand.count({where:{accountId:account.id,kind:"ALLOCATE"}})).toBe(1)
  expect(await db.customerLedgerCommand.count({where:{accountId:account.id,kind:"RELEASE_ALLOCATION"}})).toBe(1)
  expect(await db.customerLedgerReceipt.count({where:{accountId:account.id}})).toBe(0)
  for (const [sourceKind, amount, debitPurpose] of [["CUSTOMER_CREDIT_ALLOCATION",300n,"CUSTOMER_ADVANCE"],["CUSTOMER_ALLOCATION_RELEASE",100n,"RECEIVABLE"]] as const) {
   const journals = await db.financeJournalEntry.findMany({where:{bookId:book.id,sourceKind},include:{lines:{include:{account:true}}}})
   expect(journals).toHaveLength(1)
   expect(journals[0]?.lines).toHaveLength(2)
   expect(journals[0]?.lines.find(line=>line.account.purpose===debitPurpose)).toMatchObject({debitMinor:amount,creditMinor:0n})
   expect(journals[0]?.lines.filter(line=>line.creditMinor===amount)).toHaveLength(1)
  }
  const revision = (await db.customerLedgerAccount.findUniqueOrThrow({where:{id:account.id}})).revision.toString()
  const tools = createGeneralTools(ctx,conversationId,()=>{throw Error("Read created proposal")},()=>{})
  async function execute(name: string,input: unknown) {
   const run = tools[name]?.execute
   if (!run) throw Error(`Missing read tool ${name}`)
   return run(input,{toolCallId:randomUUID(),messages:[]})
  }
  expect(await execute("readCustomerEntry",{accountId:account.id,entryId:credit.id,limit:10})).toMatchObject({status:"available",data:{currentRevision:revision,allocations:[{id:allocation.id,remainingAmountMinor:"200"}]}})
  expect(await execute("readCustomerAllocationHistory",{accountId:account.id,allocationId:allocation.id,expectedRevision:revision,limit:10})).toMatchObject({status:"available",data:{remainingAmountMinor:"200",releasedAmountMinor:"100",releases:[{amountMinor:"100"}]}})
  expect(await execute("readCustomerAllocationHistory",{accountId:account.id,allocationId:allocation.id,expectedRevision:"0",limit:10})).toMatchObject({status:"unavailable"})
  expect(await execute("readCustomerEntry",{accountId:account.id,entryId:randomUUID(),limit:10})).toMatchObject({status:"unavailable"})
  console.info("Customer credit acceptance: apply/release exact effects, actual read tools and replay passed")
 } finally {
  caps.forEach((cap,index)=>Object.assign(cap,{rollout:rollouts[index]}))
    console.info("Customer credit acceptance: cleanup owned financial fixtures")
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
    console.info("Customer credit acceptance: financial cleanup verified")
  }
}
