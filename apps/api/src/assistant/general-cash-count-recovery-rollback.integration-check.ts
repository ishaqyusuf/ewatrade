import { randomUUID } from "node:crypto"
import { cashCountAction } from "@ewatrade/assistant/general/contracts"
import type { Prisma } from "@ewatrade/db"
import { getFinanceCashCountInTransaction } from "@ewatrade/db/queries"
import { cashCountRecord } from "./general-cash-count"
import { cashCountReceiptFault } from "./general-cash-count-receipt-fault"
import {
  assertG02FactsUnchanged,
  changedG02FactTables,
  g02RollbackFacts,
  verifyG02FinanceInventory,
} from "./general-cash-count-signed-rollback-facts"
import {
  assertG02RollbackEnvironment,
  assertG02RollbackScope,
  assertG02RollbackTransactionOptions,
  rollbackCheck as check,
  g02RollbackScope,
} from "./general-cash-count-signed-rollback-guards"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal } from "./general-proposals"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"

/** Additional proof only: fault rollback, same-key retry, and fresh session/member scope. */
export async function verifyG02RecoveryRollback(
  ctx: GeneralContext,
  conversationId: string,
  recordEvidence?: (proof: {
    case: string
    before: Awaited<ReturnType<typeof g02RollbackFacts>>
    after: Awaited<ReturnType<typeof g02RollbackFacts>>
    changedTables: string[]
    checks: string[]
    forcedRollbackReached: boolean
  }) => Promise<void>,
) {
  assertG02RollbackEnvironment(process.env)
  check(
    process.env.RUN_G02_RECOVERY_ROLLBACK === "1",
    "Separate coordinator-scheduled recovery rollback required",
  )
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const actorUserId = ctx.session.user.id
  const storeId = ctx.tenantContext.activeStore?.id ?? ""
  const [identity] = await db.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`
  assertG02RollbackScope({
    database: identity?.database ?? "",
    tenantId,
    storeId,
    userId: actorUserId,
    conversationId,
  })
  await db.membership.findFirstOrThrow({
    where: {
      tenantId,
      userId: actorUserId,
      status: "ACTIVE",
      role: "OWNER",
      user: { email: g02RollbackScope.email },
      tenant: { isActive: true, dataClassification: "QA" },
    },
  })
  await db.store.findFirstOrThrow({
    where: { id: storeId, tenantId, status: "ACTIVE" },
  })
  await db.assistantConversation.findFirstOrThrow({
    where: {
      id: conversationId,
      tenantId,
      storeId,
      ownerUserId: actorUserId,
      purpose: "GENERAL",
    },
  })
  await verifyG02FinanceInventory(db)
  // Prisma defines no Store relation on proposal.storeId; fail closed on database drift.
  const [storeFence] = await db.$queryRaw<Array<{ constraints: number }>>`
    SELECT count(*)::int AS constraints
    FROM information_schema.key_column_usage k
    JOIN information_schema.table_constraints c
      ON c.constraint_catalog = k.constraint_catalog
      AND c.constraint_schema = k.constraint_schema
      AND c.constraint_name = k.constraint_name
      AND c.table_schema = k.table_schema AND c.table_name = k.table_name
    WHERE c.constraint_type = 'FOREIGN KEY'
      AND k.table_schema = current_schema()
      AND k.table_name = 'AssistantActionProposal' AND k.column_name = 'storeId'`
  check(
    storeFence?.constraints === 0,
    "Proposal Store relation changed; do not create a foreign Store fixture",
  )
  const foreignStoreId = `qa-g02-foreign-${randomUUID()}`
  check(
    (await db.store.count({ where: { id: foreignStoreId } })) === 0,
    "Foreign Store marker must not name an owning Store",
  )
  const book = await db.financeBook.findFirstOrThrow({
    where: { tenantId },
    orderBy: { startsAt: "desc" },
  })
  const account = await db.financeAccount.findFirstOrThrow({
    where: {
      bookId: book.id,
      kind: "ASSET",
      purpose: "CASH",
      archivedAt: null,
    },
    orderBy: { id: "asc" },
  })
  const id = randomUUID()
  const key = `assistant_${id}`
  const asOf = new Date(Date.now() - 1000)
  check(
    asOf >= book.startsAt && (!book.closedThrough || asOf > book.closedThrough),
    "Existing open posting interval required; no fixture setup permitted",
  )
  const payload = cashCountAction.parse({
    action: "cash_count_record",
    bookId: book.id,
    accountId: account.id,
    asOf: asOf.toISOString(),
    observedBalanceMinor: "0",
    reference: `QA G02 recovery rollback ${id}`,
    cashPhysicallyCounted: true,
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
  const token = proposalApprovalToken(
    binding,
    process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
  )
  const before = await g02RollbackFacts(db, tenantId)
  const results: Array<{
    case: string
    elapsedMs: number
    before: typeof before
    after: typeof before
    checks: string[]
  }> = []
  for (const mode of [
    "receipt-write-failure",
    "same-key-recovery",
    "expired-session",
    "suspended-membership",
    "foreign-proposal-store",
  ] as const) {
    const rollback = Error("G02_RECOVERY_FORCED_ROLLBACK")
    const fault = Error("G02_INJECTED_ORIGINAL_RECEIPT_FAILURE")
    const start = performance.now()
    const checks: string[] = []
    let proved = false
    let transactions = 0
    const scopedDb = new Proxy(db, {
      get(owner, property) {
        if (property !== "$transaction") {
          const value = Reflect.get(owner, property)
          return typeof value === "function" ? value.bind(owner) : value
        }
        return (
          operation: (
            tx: Prisma.TransactionClient,
          ) => Promise<Awaited<ReturnType<typeof decideGeneralProposal>>>,
          options: {
            maxWait?: number
            timeout?: number
            isolationLevel?: Prisma.TransactionIsolationLevel
          },
        ) => {
          assertG02RollbackTransactionOptions(options)
          check(++transactions === 1, "Unexpected root transaction or retry")
          return db.$transaction(async (tx) => {
            const prepared = await cashCountRecord.review(
              { ...ctx, db: tx },
              payload,
            )
            await tx.assistantActionProposal.create({
              data: {
                ...binding,
                conversationId,
                action: payload.action,
                payload,
                roleSnapshot: "OWNER",
                approvalTokenHash: proposalDigest(token),
                idempotencyKey: key,
                targetRecordId: prepared.target.id,
                targetRevision: prepared.target.revision,
              },
            })
            if (mode === "expired-session")
              await tx.session.update({
                where: { id: ctx.session.session.id },
                data: { expiresAt: new Date(0) },
              })
            if (mode === "suspended-membership")
              await tx.membership.update({
                where: { id: ctx.tenantContext.membership.id },
                data: { status: "SUSPENDED" },
              })
            if (mode === "foreign-proposal-store")
              await tx.assistantActionProposal.update({
                where: { id },
                data: { storeId: foreignStoreId },
              })
            const seeded = await g02RollbackFacts(tx, tenantId)
            if (mode === "receipt-write-failure") {
              let attemptedReceipt: unknown
              let failed = false
              try {
                await operation(
                  cashCountReceiptFault(tx, id, fault, (receipt) => {
                    attemptedReceipt = receipt
                  }),
                )
              } catch (error) {
                if (error !== fault) throw error
                failed = true
              }
              check(
                failed &&
                  attemptedReceipt &&
                  typeof attemptedReceipt === "object" &&
                  "kind" in attemptedReceipt &&
                  attemptedReceipt.kind === "finance_cash_count" &&
                  "recordId" in attemptedReceipt &&
                  typeof attemptedReceipt.recordId === "string",
                "Original receipt failure was not reached",
              )
              const native = await getFinanceCashCountInTransaction(tx, {
                tenantId,
                actorUserId,
                bookId: book.id,
                countId: attemptedReceipt.recordId,
              })
              const pending =
                await tx.assistantActionProposal.findUniqueOrThrow({
                  where: { id },
                })
              check(
                native.reference === payload.reference &&
                  pending.status === "EXECUTING" &&
                  pending.executedResult === null,
                "Injected receipt failure did not follow native execution",
              )
              check(
                (await tx.financeCommand.count({
                  where: { bookId: book.id, clientCommandId: key },
                })) === 1,
                "Receipt failure has wrong native command cardinality",
              )
              proved = true
              checks.push(
                "native-count-executed-before-receipt-failure",
                "real-confirmation-transaction-aborted",
              )
              // Propagate the actual injected failure out of the real root transaction.
              throw fault
            }
            if (mode === "same-key-recovery") {
              const app = await operation(tx)
              check(
                app.status === "COMPLETED" &&
                  app.receipt?.kind === "finance_cash_count",
                "Same reviewed proposal/key did not recover",
              )
              const original = await getFinanceCashCountInTransaction(tx, {
                tenantId,
                actorUserId,
                bookId: book.id,
                countId: app.receipt.recordId,
              })
              check(
                original.reference === payload.reference &&
                  original.observedBalanceMinor === "0",
                "Recovery changed the reviewed observation",
              )
              const completed = await g02RollbackFacts(tx, tenantId)
              const replay = await operation(tx)
              check(
                proposalDigest(replay.receipt) === proposalDigest(app.receipt),
                "Recovered receipt replay differs",
              )
              assertG02FactsUnchanged(
                completed,
                await g02RollbackFacts(tx, tenantId),
              )
              assertG02FactsUnchanged(seeded, completed, [
                "FinanceCommand",
                "FinanceReconciliation",
                "AssistantActionProposal",
              ])
              check(
                (await tx.financeCommand.count({
                  where: { bookId: book.id, clientCommandId: key },
                })) === 1,
                "Same-key recovery duplicated native command",
              )
              let foreignBookRefused = false
              try {
                await getFinanceCashCountInTransaction(tx, {
                  tenantId,
                  actorUserId,
                  bookId: `qa-foreign-${randomUUID()}`,
                  countId: original.id,
                })
              } catch (error) {
                if (
                  !(
                    error &&
                    typeof error === "object" &&
                    "code" in error &&
                    error.code === "NOT_FOUND"
                  )
                )
                  throw error
                foreignBookRefused = true
              }
              check(foreignBookRefused, "Original count crossed its Book fence")
              assertG02FactsUnchanged(
                completed,
                await g02RollbackFacts(tx, tenantId),
              )
              checks.push(
                "same-reviewed-proposal-and-command-key",
                "single-original-count-and-receipt",
                "completed-replay-no-write",
                "original-count-wrong-book-refused",
              )
            } else {
              const expected =
                mode === "expired-session"
                  ? "UNAUTHORIZED"
                  : mode === "suspended-membership"
                    ? "FORBIDDEN"
                    : "NOT_FOUND"
              let refused = false
              try {
                await operation(tx)
              } catch (error) {
                if (
                  !(
                    error &&
                    typeof error === "object" &&
                    "code" in error &&
                    error.code === expected
                  )
                )
                  throw error
                refused = true
              }
              check(refused, "Fresh access/scope change was accepted")
              assertG02FactsUnchanged(
                seeded,
                await g02RollbackFacts(tx, tenantId),
              )
              checks.push(
                `fresh-${expected.toLowerCase()}-refusal`,
                "pending-proposal-and-native-facts-unchanged",
              )
            }
            proved = true
            throw rollback
          }, options)
        }
      },
    })
    let unexpected: { error: unknown } | undefined
    try {
      await decideGeneralProposal(
        { ...ctx, db: scopedDb },
        {
          proposalId: id,
          revision: 1,
          decision: "confirm",
          approvalToken: token,
        },
      )
      throw Error("Rollback did not escape")
    } catch (error) {
      if (error !== (mode === "receipt-write-failure" ? fault : rollback))
        unexpected = { error }
    }
    const after = await g02RollbackFacts(db, tenantId)
    await recordEvidence?.({
      case: mode,
      before,
      after,
      changedTables: changedG02FactTables(before, after),
      checks,
      forcedRollbackReached: proved && !unexpected,
    })
    if (unexpected) throw unexpected.error
    check(proved && transactions === 1, "Recovery/fresh-scope case not proved")
    assertG02FactsUnchanged(before, after)
    check(
      (await db.assistantActionProposal.count({ where: { id } })) === 0 &&
        (await db.financeCommand.count({
          where: { bookId: book.id, clientCommandId: key },
        })) === 0,
      "Rollback-owned proposal/command persisted",
    )
    results.push({
      case: mode,
      elapsedMs: Math.round(performance.now() - start),
      before,
      after,
      checks,
    })
  }
  return {
    sourceSuite: "G02 signed recovery and fresh scope rollback v1",
    results,
    savedFinanceAuthChatProposalBudgetUnchanged: true,
    providerCalls: 0,
    committedFixtures: false,
    acceptance: false,
    retryFixture:
      "The same reviewed proposal/key is recreated inside each rollback transaction; no persisted pending draft or independent HTTP retry is claimed.",
  }
}
