import { randomUUID } from "node:crypto"
import { cashCountAction } from "@ewatrade/assistant/general/contracts"
import type { Prisma } from "@ewatrade/db"
import {
  getFinanceCashCountInTransaction,
  getFinanceCashCountReviewInTransaction,
  recordFinanceMoneyMovementInTransaction,
} from "@ewatrade/db/queries"
import { cashCountRecord } from "./general-cash-count"
import {
  type G02BudgetCall,
  observeG02BudgetCalls,
} from "./general-cash-count-budget-trace"
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

type Confirmation = Awaited<ReturnType<typeof decideGeneralProposal>>

/** Real signed dispatcher callback, exact saved QA scope, every fixture forcibly rolled back. */
export async function verifyG02SignedProposalRollback(
  ctx: GeneralContext,
  conversationId: string,
  recordEvidence?: (evidence: {
    case: string
    before: Awaited<ReturnType<typeof g02RollbackFacts>>
    after: Awaited<ReturnType<typeof g02RollbackFacts>>
    changedTables: string[]
    transactionChecksReached: string[]
    forcedRollbackReached: boolean
    budgetCalls: G02BudgetCall[]
  }) => Promise<void>,
) {
  assertG02RollbackEnvironment(process.env)
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const actorUserId = ctx.session.user.id
  const storeId = ctx.tenantContext.activeStore?.id ?? ""
  const [identity] = await db.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database`
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
      role: "OWNER",
      status: "ACTIVE",
      tenant: { dataClassification: "QA", isActive: true },
      user: { email: g02RollbackScope.email },
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
  const book = await db.financeBook.findFirstOrThrow({
    where: { tenantId },
    orderBy: { startsAt: "desc" },
  })
  const account = await db.financeAccount.findFirstOrThrow({
    where: {
      bookId: book.id,
      purpose: "CASH",
      kind: "ASSET",
      archivedAt: null,
    },
    orderBy: { id: "asc" },
  })
  const facts = () => g02RollbackFacts(db, tenantId)
  const before = await facts()
  const results: Array<{ case: string; elapsedMs: number; checks: string[] }> =
    []
  const caseEvidence: Array<{
    case: string
    before: typeof before
    after: typeof before
  }> = []
  for (const mode of [
    "completion-and-replay",
    "changed-token",
    "stale-posted-basis",
  ] as const) {
    const id = randomUUID()
    const key = `assistant_${id}`
    const rollback = new Error("G02_SIGNED_FORCED_ROLLBACK")
    const started = performance.now()
    const expiresAt = new Date(Date.now() + 900_000)
    const asOf = new Date(Date.now() - 1000)
    check(
      asOf >= book.startsAt &&
        (!book.closedThrough || asOf > book.closedThrough),
      "Existing open posting interval required; no fixture setup permitted",
    )
    const payload = cashCountAction.parse({
      action: "cash_count_record",
      bookId: book.id,
      accountId: account.id,
      asOf: asOf.toISOString(),
      observedBalanceMinor: "0",
      reference: `QA G02 signed rollback ${id}`,
      cashPhysicallyCounted: true,
    })
    const binding = {
      id,
      expiresAt,
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
    let proved = false
    let transactions = 0
    const checks: string[] = []
    const budgetCalls: G02BudgetCall[] = []
    const observedRoot = observeG02BudgetCalls(db, "root", (call) =>
      budgetCalls.push(call),
    )
    const scopedDb = new Proxy(observedRoot, {
      get(owner, property) {
        if (property !== "$transaction") {
          const value = Reflect.get(owner, property)
          return typeof value === "function" ? value.bind(owner) : value
        }
        return (
          operation: (tx: Prisma.TransactionClient) => Promise<Confirmation>,
          options: {
            maxWait?: number
            timeout?: number
            isolationLevel?: Prisma.TransactionIsolationLevel
          },
        ) => {
          assertG02RollbackTransactionOptions(options)
          check(++transactions === 1, "Unexpected root transaction or retry")
          return db.$transaction(async (tx) => {
            const confirmationTx = observeG02BudgetCalls(
              tx,
              "transaction",
              (call) => budgetCalls.push(call),
            )
            const input = {
              tenantId,
              actorUserId,
              bookId: book.id,
              accountId: account.id,
              asOf,
              observedBalanceMinor: "0",
              reference: payload.reference,
            }
            const review = await getFinanceCashCountReviewInTransaction(
              tx,
              input,
            )
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
            if (mode === "stale-posted-basis") {
              await recordFinanceMoneyMovementInTransaction(tx, {
                tenantId,
                actorUserId,
                storeId,
                bookId: book.id,
                accountId: account.id,
                clientCommandId: `qa-g02-basis-${id}`,
                kind: "OWNER_CONTRIBUTION",
                amountMinor: "1",
                effectiveAt: asOf,
                description: "QA G02 rollback-only posted basis fixture",
              })
              const changed = await getFinanceCashCountReviewInTransaction(
                tx,
                input,
              )
              check(
                BigInt(changed.snapshotSequence) ===
                  BigInt(review.snapshotSequence) + 1n &&
                  BigInt(changed.expectedBalanceMinor) ===
                    BigInt(review.expectedBalanceMinor) + 1n,
                "Canonical posted cash basis did not change",
              )
              checks.push("canonical-posted-basis-changed")
            }
            const seeded = await g02RollbackFacts(tx, tenantId)
            if (mode === "completion-and-replay") {
              const app = await operation(confirmationTx)
              check(
                app.status === "COMPLETED" &&
                  app.receipt?.kind === "finance_cash_count",
                "Signed confirmation did not return original count receipt",
              )
              const receipt = app.receipt
              check(receipt.bookId === book.id, "Receipt Book differs")
              const original = await getFinanceCashCountInTransaction(tx, {
                ...input,
                countId: receipt.recordId,
              })
              check(
                original.observedBalanceMinor === "0" &&
                  original.expectedBalanceMinor ===
                    review.expectedBalanceMinor &&
                  original.differenceMinor === review.differenceMinor &&
                  original.snapshotSequence === review.snapshotSequence &&
                  original.adjustment === null &&
                  original.actorUserId === actorUserId &&
                  original.asOf.getTime() === asOf.getTime() &&
                  original.reference === payload.reference,
                "Immutable original count differs from signed review",
              )
              const command = await tx.financeCommand.findUniqueOrThrow({
                where: {
                  bookId_clientCommandId: {
                    bookId: book.id,
                    clientCommandId: key,
                  },
                },
              })
              check(
                command.kind === "CASH_COUNT" &&
                  proposalDigest(command.result) ===
                    proposalDigest({ id: original.id }),
                "Canonical command does not identify original count",
              )
              const saved = await tx.assistantActionProposal.findUniqueOrThrow({
                where: { id },
              })
              check(
                saved.status === "COMPLETED" &&
                  proposalDigest(saved.executedResult) ===
                    proposalDigest(receipt),
                "Atomic assistant receipt differs",
              )
              const completed = await g02RollbackFacts(tx, tenantId)
              assertG02FactsUnchanged(seeded, completed, [
                "FinanceCommand",
                "FinanceReconciliation",
                "AssistantActionProposal",
              ])
              for (const table of ["FinanceCommand", "FinanceReconciliation"]) {
                const a = seeded.find((row) => row.table === table)
                const b = completed.find((row) => row.table === table)
                check(a && b, "Native row fingerprints missing")
                check(
                  BigInt(b.rows) === BigInt(a.rows) + 1n,
                  "Confirmation duplicated native rows",
                )
              }
              // Re-enter the captured fresh-auth callback on the same caller-owned transaction.
              // Calling the root dispatcher recursively here would create a nested transaction.
              const replay = await operation(confirmationTx)
              check(
                replay.status === "COMPLETED" &&
                  proposalDigest(replay.receipt) === proposalDigest(receipt),
                "Completed replay changed original receipt",
              )
              assertG02FactsUnchanged(
                completed,
                await g02RollbackFacts(tx, tenantId),
              )
              checks.push(
                "real-signed-confirmation",
                "canonical-original-zero-count",
                "atomic-original-receipt",
                "completed-replay-no-write",
                "no-journal-or-close",
              )
            } else {
              let refused = false
              try {
                await operation(confirmationTx)
              } catch (error) {
                if (
                  !(
                    error &&
                    typeof error === "object" &&
                    "code" in error &&
                    error.code === "CONFLICT"
                  )
                )
                  throw error
                refused = true
              }
              check(refused, "Changed approval or stale basis was accepted")
              assertG02FactsUnchanged(
                seeded,
                await g02RollbackFacts(tx, tenantId),
              )
              checks.push(
                "real-signed-conflict",
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
          approvalToken:
            mode === "changed-token"
              ? `${token[0] === "a" ? "b" : "a"}${token.slice(1)}`
              : token,
        },
      )
      throw new Error(
        "Forced rollback did not escape the confirmation transaction",
      )
    } catch (error) {
      if (error !== rollback) unexpected = { error }
    }
    const after = await facts()
    await recordEvidence?.({
      case: mode,
      before,
      after,
      changedTables: changedG02FactTables(before, after),
      transactionChecksReached: checks,
      forcedRollbackReached: proved && !unexpected,
      budgetCalls,
    })
    if (unexpected) throw unexpected.error
    check(proved && transactions === 1, "Signed rollback case was not proved")
    assertG02FactsUnchanged(before, after)
    check(
      (await db.assistantActionProposal.count({ where: { id } })) === 0,
      "Rollback-owned proposal persisted",
    )
    results.push({
      case: mode,
      elapsedMs: Math.round(performance.now() - started),
      checks,
    })
    caseEvidence.push({ case: mode, before, after })
  }
  return {
    sourceSuite: "G02 signed proposal rollback v1",
    results,
    caseEvidence,
    savedFinanceAuthChatProposalBudgetUnchanged: true,
    providerCalls: 0,
    committedFixtures: false,
    acceptance: false,
    remaining:
      "HTTP and saved-web acceptance, fault/recovery and true financial close",
  }
}
