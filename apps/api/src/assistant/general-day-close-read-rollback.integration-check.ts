import { randomUUID } from "node:crypto"
import type { Prisma } from "@ewatrade/db"
import { getFinanceCashCountInTransaction } from "@ewatrade/db/queries"
import { requireBrowserIdentity } from "./channel-principal"
import {
  assertG02FactsUnchanged,
  changedG02FactTables,
  g02RollbackFacts,
  verifyG02FinanceInventory,
} from "./general-cash-count-signed-rollback-facts"
import {
  assertG02RollbackEnvironment,
  assertG02RollbackScope,
  rollbackCheck as check,
  g02RollbackScope as f,
} from "./general-cash-count-signed-rollback-guards"
import type { GeneralContext } from "./general-context"
import {
  generalDayCloseAnswer,
  readGeneralCashCountHistory,
  readGeneralDayClose,
} from "./general-day-close"

type Facts = Awaited<ReturnType<typeof g02RollbackFacts>>
type Proof = {
  case: string
  before: Facts
  after: Facts
  changedTables: string[]
  checks: string[]
  forcedRollbackReached: boolean
  elapsedMs: number
}

/** Scheduled source reads only. No fixture, proposal, visibility change or provider. */
export async function verifyG02NativeReadsRollback(
  ctx: GeneralContext,
  recordEvidence?: (proof: Proof) => Promise<void>,
) {
  assertG02RollbackEnvironment(process.env)
  check(
    process.env.RUN_G02_NATIVE_READ_ROLLBACK === "1" &&
      process.env.APP_ENV === "local" &&
      process.env.NODE_ENV === "development",
    "Separate scheduled local native read rollback required",
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
    conversationId: f.conversationId,
  })
  await db.membership.findFirstOrThrow({
    where: {
      tenantId,
      userId: actorUserId,
      role: "OWNER",
      status: "ACTIVE",
      user: { email: f.email },
      tenant: { isActive: true, dataClassification: "QA" },
    },
  })
  await db.store.findFirstOrThrow({
    where: { id: storeId, tenantId, status: "ACTIVE" },
  })
  await db.assistantConversation.findFirstOrThrow({
    where: {
      id: f.conversationId,
      tenantId,
      storeId,
      ownerUserId: actorUserId,
      purpose: "GENERAL",
    },
  })
  await db.session.findFirstOrThrow({
    where: {
      id: requireBrowserIdentity(ctx.session).session.id,
      userId: actorUserId,
      expiresAt: { gt: new Date() },
    },
  })
  await verifyG02FinanceInventory(db)
  const book = await db.financeBook.findFirstOrThrow({
    where: { tenantId },
    orderBy: { startsAt: "desc" },
  })
  const through = new Date(
    `${new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)}T23:59:59.999Z`,
  )
  const from = book.closedThrough
    ? new Date(book.closedThrough.getTime() + 1)
    : book.startsAt
  check(
    through >= from,
    "Existing completed open UTC day required; no fixture or date-lock change allowed",
  )
  const missingBook = `qa-g02-missing-${randomUUID()}`
  const missingCursor = `qa-g02-cursor-${randomUUID()}`
  check(
    (await db.financeBook.count({ where: { id: missingBook } })) === 0,
    "Missing Book marker must not name a saved Book",
  )
  check(
    (await db.financeReconciliation.count({ where: { id: missingCursor } })) ===
      0,
    "Missing cursor marker must not name a saved count",
  )
  const actor = { tenantId, actorUserId }
  const baseline = await g02RollbackFacts(db, tenantId)
  const results: Array<{ case: string; elapsedMs: number; checks: string[] }> =
    []
  let savedCountAvailable = false
  let positivePaginationAvailable = false
  const nativeTransaction = db.$transaction.bind(db)
  async function run(
    name: string,
    read: (fresh: GeneralContext) => Promise<unknown>,
    verify: (
      value: unknown,
      tx: Prisma.TransactionClient,
      checks: string[],
    ) => Promise<void>,
    expectedCode?: string,
  ) {
    const checks: string[] = []
    const sentinel = Error(`forced read rollback ${name}`)
    let transactions = 0
    let reached = false
    let unexpected: unknown
    const started = Date.now()
    const observed = new Proxy(db, {
      get(target, property) {
        if (property === "$transaction")
          return async (
            operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options: {
              maxWait?: number
              timeout?: number
              isolationLevel?: Prisma.TransactionIsolationLevel
            },
          ) => {
            transactions++
            check(
              transactions === 1,
              "Exactly one native root transaction; no nesting",
            )
            check(
              options.maxWait === 10_000 &&
                options.timeout === 30_000 &&
                options.isolationLevel === "RepeatableRead",
              "Native read must retain bounded RepeatableRead options",
            )
            return nativeTransaction(async (tx) => {
              await tx.session.findFirstOrThrow({
                where: {
                  id: requireBrowserIdentity(ctx.session).session.id,
                  userId: actorUserId,
                  expiresAt: { gt: new Date() },
                },
              })
              const beforeRead = await g02RollbackFacts(tx, tenantId)
              let value: unknown
              try {
                value = await operation(tx)
              } catch (error) {
                if (
                  !expectedCode ||
                  !(
                    error &&
                    typeof error === "object" &&
                    "code" in error &&
                    error.code === expectedCode
                  )
                )
                  throw error
                checks.push(`native ${expectedCode} refusal`)
              }
              if (!expectedCode) await verify(value, tx, checks)
              else
                check(
                  checks.length === 1,
                  "Expected native denial must actually occur",
                )
              assertG02FactsUnchanged(
                beforeRead,
                await g02RollbackFacts(tx, tenantId),
              )
              checks.push(
                "transaction-local all-table/all-budget facts unchanged",
              )
              reached = true
              throw sentinel
            }, options)
          }
        const value = Reflect.get(target, property, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    try {
      await read({ ...ctx, db: observed })
    } catch (error) {
      if (error !== sentinel) unexpected = error
    }
    const after = await g02RollbackFacts(db, tenantId)
    const proof = {
      case: name,
      before: baseline,
      after,
      changedTables: changedG02FactTables(baseline, after),
      checks,
      forcedRollbackReached: reached && !unexpected,
      elapsedMs: Date.now() - started,
    }
    await recordEvidence?.(proof)
    assertG02FactsUnchanged(baseline, after)
    if (unexpected) throw unexpected
    check(
      reached && transactions === 1,
      "Native read must reach one forced rollback",
    )
    results.push({ case: name, elapsedMs: proof.elapsedMs, checks })
  }
  await run(
    "bounded-saved-history",
    (fresh) => readGeneralCashCountHistory(fresh, { bookId: book.id }),
    async (value, tx, checks) => {
      const history = value as Awaited<
        ReturnType<typeof readGeneralCashCountHistory>
      >
      check(
        history.currencyCode === book.currencyCode &&
          history.items.length <= 10,
        "History must retain native currency and assistant page bound",
      )
      check(
        new Set(history.items.map((item) => item.id)).size ===
          history.items.length,
        "History may not repeat count identities",
      )
      for (let i = 1; i < history.items.length; i++) {
        const previous = history.items[i - 1]
        const next = history.items[i]
        check(previous && next, "History comparison requires two original rows")
        check(
          previous.asOf > next.asOf ||
            (previous.asOf.getTime() === next.asOf.getTime() &&
              previous.id > next.id),
          "Native history must retain asOf/id descending order",
        )
      }
      check(
        !history.nextCursor ||
          (history.items.length === 10 &&
            history.nextCursor === history.items.at(-1)?.id),
        "Next cursor must identify the original last page row",
      )
      positivePaginationAvailable = Boolean(history.nextCursor)
      const first = history.items[0]
      savedCountAvailable = Boolean(first)
      if (first) {
        const original = await getFinanceCashCountInTransaction(tx, {
          ...actor,
          bookId: book.id,
          countId: first.id,
        })
        check(
          original.id === first.id &&
            original.expectedBalanceMinor === first.expectedBalanceMinor &&
            original.observedBalanceMinor === first.observedBalanceMinor &&
            original.snapshotSequence === first.snapshotSequence &&
            original.differenceMinor === first.differenceAtCountMinor,
          "History must preserve original native saved basis",
        )
        checks.push("existing original count detail agrees with history")
      } else checks.push("saved positive original-count fixture unavailable")
      checks.push("bounded ordered native history; no inferred total")
    },
  )
  await run(
    "unknown-history-cursor",
    (fresh) =>
      readGeneralCashCountHistory(fresh, {
        bookId: book.id,
        cursor: missingCursor,
      }),
    async () => {},
    "CONFLICT",
  )
  await run(
    "nonowning-history-book",
    (fresh) => readGeneralCashCountHistory(fresh, { bookId: missingBook }),
    async () => {},
    "NOT_FOUND",
  )
  await run(
    "native-day-summary-checklist",
    (fresh) =>
      readGeneralDayClose(fresh, {
        bookId: book.id,
        through: through.toISOString(),
      }),
    async (value, tx, checks) => {
      const { checklist, day } = value as Awaited<
        ReturnType<typeof readGeneralDayClose>
      >
      const current = await tx.financeBook.findFirstOrThrow({
        where: { id: book.id, tenantId },
      })
      check(
        checklist.bookId === book.id &&
          day.bookId === book.id &&
          checklist.currencyCode === book.currencyCode &&
          day.currencyCode === book.currencyCode,
        "Day facts must retain exact native Book/currency",
      )
      check(
        checklist.snapshotSequence === current.lastSequence.toString() &&
          day.snapshotSequence === checklist.snapshotSequence &&
          checklist.through.getTime() === through.getTime() &&
          day.through.getTime() === through.getTime(),
        "Day summary/checklist must share native watermark and completed UTC cutoff",
      )
      const midnight = new Date(
        `${through.toISOString().slice(0, 10)}T00:00:00.000Z`,
      )
      check(
        day.from.getTime() ===
          Math.max(midnight.getTime(), checklist.from.getTime()),
        "Day range must start at UTC midnight or next native open interval",
      )
      check(
        !checklist.operationallyReconciled &&
          checklist.completeness === "INCOMPLETE_SOURCE_COVERAGE",
        "Posted evidence may not certify operational close",
      )
      const answer = generalDayCloseAnswer(checklist, day)
      check(
        answer.target.bookId === book.id &&
          answer.target.through === through.toISOString() &&
          answer.detail.includes(
            "operational reconciliation remains uncertified",
          ),
        "Answer must preserve native target and unresolved close caveat",
      )
      checks.push(
        "same-watermark native posted summary/checklist; incomplete close coverage preserved",
      )
    },
  )
  return {
    sourceSuite: "g02-native-read-forced-rollback-v1",
    results,
    savedCountAvailable,
    positivePaginationAvailable,
    providerCalls: 0,
    acceptance: false,
    committed: false,
    savedFinanceAuthChatProposalBudgetUnchanged: true,
  }
}
