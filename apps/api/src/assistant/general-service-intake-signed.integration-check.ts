import { randomUUID } from "node:crypto"
import { createSimpleCatalogItemInTransaction } from "@ewatrade/db/queries"
import { readServiceIntakeReceiptInTransaction } from "@ewatrade/db/service-intake-receipt"
import { reviewServiceIntakeInTransaction } from "@ewatrade/db/service-intake-review"
import type { Prisma } from "@ewatrade/db/types"
import { TRPCError } from "@trpc/server"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal } from "./general-proposals"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"

function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(message)
}
/** One real root transaction per signed case; all fixtures, receipts and effects roll back. */
export async function verifyServiceIntakeSignedRollback(
  ctx: GeneralContext,
  conversationId: string,
) {
  const db = ctx.db
  const tenantId = "cmuzedcda000hbw9kd6e50z8u"
  const storeId = "cmuzedcow000jbw9kluarpxfs"
  const actorUserId = "cmuzedc7e000gbw9ky1dioc9f"
  check(
    process.env.RUN_D04_QA_ROLLBACK === "1" &&
      process.env.NODE_ENV === "development" &&
      process.env.APP_ENV === "local",
    "Coordinator-scheduled local rollback required",
  )
  check(
    ctx.session.user.id === actorUserId &&
      ctx.tenantContext.tenant.id === tenantId &&
      ctx.tenantContext.activeStore?.id === storeId,
    "Exact QA scope required",
  )
  check(
    (
      await db.$queryRaw<
        Array<{ name: string }>
      >`SELECT current_database() AS name`
    )[0]?.name === "ewatrade_qa_v1",
    "Exact QA database required",
  )
  await db.assistantConversation.findFirstOrThrow({
    where: {
      id: conversationId,
      tenantId,
      storeId,
      ownerUserId: actorUserId,
      purpose: "GENERAL",
    },
    select: { id: true },
  })
  const facts = async () =>
    (
      await db.$queryRaw<Array<{ hash: string }>>`SELECT md5(jsonb_build_object(
    'tenant',(SELECT to_jsonb(t) FROM "Tenant" t WHERE t.id=${tenantId}),
    'ledgerAccounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "CustomerLedgerAccount" a WHERE a."tenantId"=${tenantId}),
    'ledgerEntries',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "CustomerLedgerEntry" e WHERE e."tenantId"=${tenantId}),
    'ledgerCommands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "CustomerLedgerCommand" c WHERE c."tenantId"=${tenantId}),
    'ledgerAllocations',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM "CustomerLedgerAllocation" l JOIN "CustomerLedgerAccount" a ON a.id=l."accountId" WHERE a."tenantId"=${tenantId}),
    'ledgerReleases',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "CustomerLedgerAllocationRelease" r JOIN "CustomerLedgerAllocation" l ON l.id=r."allocationId" JOIN "CustomerLedgerAccount" a ON a.id=l."accountId" WHERE a."tenantId"=${tenantId}),
    'ledgerReceipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "CustomerLedgerReceipt" r JOIN "CustomerLedgerAccount" a ON a.id=r."accountId" WHERE a."tenantId"=${tenantId}),
    'financeBooks',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM "FinanceBook" b WHERE b."tenantId"=${tenantId}),
    'financeAccounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "FinanceAccount" a JOIN "FinanceBook" b ON b.id=a."bookId" WHERE b."tenantId"=${tenantId}),
    'financeCommands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "FinanceCommand" c JOIN "FinanceBook" b ON b.id=c."bookId" WHERE b."tenantId"=${tenantId}),
    'financeJournals',(SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM "FinanceJournalEntry" j JOIN "FinanceBook" b ON b.id=j."bookId" WHERE b."tenantId"=${tenantId}),
    'financeJournalLines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM "FinanceJournalLine" l JOIN "FinanceBook" b ON b.id=l."bookId" WHERE b."tenantId"=${tenantId}),
    'financePeriods',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "FinancePeriod" p JOIN "FinanceBook" b ON b.id=p."bookId" WHERE b."tenantId"=${tenantId}),
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "Membership" m WHERE m."tenantId"=${tenantId}),
    'catalog',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "CatalogItem" c WHERE c."tenantId"=${tenantId}),
    'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM "CommercialOrder" o WHERE o."tenantId"=${tenantId}),
    'intakes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM "ServiceIntake" i WHERE i."tenantId"=${tenantId}),
    'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM "ServiceJob" j WHERE j."tenantId"=${tenantId}),
    'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "CommercialOrderPayment" p WHERE p."tenantId"=${tenantId}),
    'proposals',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "AssistantActionProposal" p WHERE p."tenantId"=${tenantId}),
    'chats',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "AssistantConversation" c WHERE c."tenantId"=${tenantId}),
    'messages',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "AssistantMessage" m WHERE m."conversationId"=${conversationId})
  )::text) AS hash`
    )[0]?.hash
  const before = await facts()
  const results: Array<{ mode: string; proved: boolean }> = []
  for (const mode of [
    "completion-replay",
    "changed-token",
    "stale-price",
    "revoked",
    "receipt-failure",
  ] as const) {
    const id = randomUUID()
    const decision = {
      proposalId: id,
      revision: 1,
      decision: "confirm" as const,
      approvalToken: "",
    }
    const rollback = new Error(`D04_SIGNED_ROLLBACK:${mode}`)
    let proved = false
    const scopedDb = new Proxy(db, {
      get(owner, key) {
        if (key !== "$transaction") {
          const value = Reflect.get(owner, key)
          return typeof value === "function" ? value.bind(owner) : value
        }
        return (
          operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: {
            maxWait?: number
            timeout?: number
            isolationLevel?: string
          },
        ) => {
          check(
            options.maxWait === 10_000 &&
              options.timeout === 30_000 &&
              options.isolationLevel === "Serializable",
            "Signed transaction bounds changed",
          )
          return db.$transaction(
            async (tx) => {
              const item = await createSimpleCatalogItemInTransaction(tx, {
                tenantId,
                storeId,
                actorUserId,
                kind: "service",
                clientOperationId: `${id}:catalog`,
                name: `D04 signed ${id}`,
                priceMinor: 1000,
                workPolicy: "tracked",
                authorizationPolicy: "after_required_payment",
                quantityScale: 0,
              })
              const offering = item.variants[0]?.offerings[0]
              check(offering, "Exact canonical Offering required")
              const payload = {
                action: "service_intake" as const,
                customerName: `D04 signed ${id}`,
                lines: [{ offeringId: offering.id, quantity: "2" }],
                instructions: "Original instructions",
                dueCommitmentAt: "2026-10-15T10:00:00.123Z",
              }
              const { action: _action, ...fields } = payload
              const reviewed = await reviewServiceIntakeInTransaction(tx, {
                ...fields,
                tenantId,
                storeId,
                actorUserId,
                dueCommitmentAt: new Date(payload.dueCommitmentAt),
              })
              const binding = {
                id,
                expiresAt: new Date(Date.now() + 900_000),
                payloadHash: proposalDigest(payload),
                tenantId,
                storeId,
                actorUserId,
                revision: 1,
              }
              const approvalToken = proposalApprovalToken(
                binding,
                process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
              )
              decision.approvalToken =
                mode === "changed-token"
                  ? `${approvalToken}changed`
                  : approvalToken
              await tx.assistantActionProposal.create({
                data: {
                  ...binding,
                  conversationId,
                  action: "service_intake",
                  payload,
                  roleSnapshot: "OWNER",
                  approvalTokenHash: proposalDigest(approvalToken),
                  idempotencyKey: `assistant_${id}`,
                  targetRecordId: storeId,
                  targetRevision: reviewed.revision,
                },
              })
              if (mode === "stale-price")
                await tx.sellableOffering.update({
                  where: { id: offering.id },
                  data: { fixedPriceMinor: 2000 },
                })
              if (mode === "revoked")
                await tx.membership.update({
                  where: { id: ctx.tenantContext.membership.id },
                  data: { status: "SUSPENDED" },
                })
              let injected = false
              const executionTx =
                mode === "receipt-failure"
                  ? new Proxy(tx, {
                      get(target, field) {
                        if (field !== "assistantActionProposal")
                          return Reflect.get(target, field)
                        return new Proxy(target.assistantActionProposal, {
                          get(delegate, method) {
                            if (method !== "update") {
                              const value = Reflect.get(delegate, method)
                              return typeof value === "function"
                                ? value.bind(delegate)
                                : value
                            }
                            return async (args: {
                              data: { status?: string }
                            }) => {
                              if (args.data.status === "COMPLETED") {
                                injected = true
                                throw Error("Injected D04 receipt failure")
                              }
                              return delegate.update(
                                args as Parameters<typeof delegate.update>[0],
                              )
                            }
                          },
                        })
                      },
                    })
                  : tx
              try {
                const app = (await operation(executionTx)) as {
                  status: string
                  receipt: { kind: string; recordId: string; orderId?: string }
                }
                check(
                  mode === "completion-replay" &&
                    app.status === "COMPLETED" &&
                    app.receipt.kind === "service_intake",
                  "Invalid signed command executed",
                )
                const receipt = await readServiceIntakeReceiptInTransaction(
                  tx,
                  {
                    tenantId,
                    storeId,
                    actorUserId,
                    intakeId: app.receipt.recordId,
                  },
                )
                check(
                  receipt.orderId === app.receipt.orderId &&
                    receipt.totalMinor === 2000 &&
                    receipt.jobs.length === 1 &&
                    receipt.jobs[0]?.lines[0]?.authorizationStatus ===
                      "PENDING_PAYMENT",
                  "Canonical signed receipt graph differs",
                )
                const replay = await operation(tx)
                check(
                  JSON.stringify(app) === JSON.stringify(replay),
                  "Completed signed replay changed its receipt",
                )
                check(
                  (await tx.serviceIntake.count({
                    where: { tenantId, clientIntakeId: `assistant_${id}` },
                  })) === 1,
                  "Signed replay created duplicate intake",
                )
                proved = true
              } catch (error) {
                if (mode === "completion-replay") throw error
                if (mode === "receipt-failure")
                  check(
                    injected &&
                      error instanceof Error &&
                      error.message.includes("receipt failure"),
                    "Receipt injection did not occur after domain execution",
                  )
                else {
                  check(
                    error instanceof TRPCError &&
                      error.code ===
                        (mode === "revoked" ? "FORBIDDEN" : "CONFLICT"),
                    "Unexpected signed failure",
                  )
                  check(
                    (await tx.serviceIntake.count({
                      where: { tenantId, clientIntakeId: `assistant_${id}` },
                    })) === 0,
                    "Rejected command wrote an Intake",
                  )
                }
                proved = true
              }
              throw rollback
            },
            {
              isolationLevel: "Serializable",
              maxWait: 10_000,
              timeout: 30_000,
            },
          )
        }
      },
    })
    try {
      await decideGeneralProposal({ ...ctx, db: scopedDb }, decision)
    } catch (error) {
      check(
        error === rollback,
        `Signed ${mode} did not end with the owned rollback`,
      )
    }
    check(proved, `Signed ${mode} was not proved`)
    results.push({ mode, proved })
  }
  const after = await facts()
  check(
    before && before === after,
    "Signed suite changed saved source/chat state",
  )
  return {
    version: 1,
    results,
    savedStatePreserved: true,
    persistentAvailabilityChanged: false,
  }
}
