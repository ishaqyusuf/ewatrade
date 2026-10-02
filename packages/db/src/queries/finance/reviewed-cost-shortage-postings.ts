import { financePostingCommandId } from "./commands"
import type { PriorCostReviewExpectedPosting } from "./reviewed-cost-prior-journal-proof"
import { FinanceError, financeAmount } from "./rules"

type Kind = "STOCK_COUNT" | "INVENTORY_CLOSEOUT"
export type ReviewedShortagePostingCandidate = {
  tenantId: string
  bookId: string
  storeId: string
  documentId: string
  kind: Kind
  movementId: string
  actorUserId: string
  effectiveAt: Date
  amountMinor: string
}
type SavedEvent = {
  tenantId: string
  bookId: string
  sourceKind: string
  sourceId: string
  stockOperationId: string
  stockMovementId: string
  actorUserId: string
  effectiveAt: Date
  canonicalEffect: { toFixed(): string }
  sourceCostMinor: bigint | null
  valueBeforeMinor: bigint | null
  valueDeltaMinor: bigint | null
  valueAfterMinor: bigint | null
  unknownReason: string | null
}
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", `Original shortage posting ${message}`)
}

/** Called only after complete original document and saved-event source auditors. */
export function captureReviewedShortageCandidates(input: {
  tenantId: string
  bookId: string
  kind: Kind
  documentId: string
  operation: {
    id: string
    tenantId: string
    storeId: string
    actorUserId: string
    effectiveAt: Date
  }
  events: SavedEvent[]
}): ReviewedShortagePostingCandidate[] {
  const { operation } = input
  if (
    input.events.length > 4096 ||
    new Set(input.events.map((e) => e.stockMovementId)).size !==
      input.events.length ||
    ![
      input.tenantId,
      input.bookId,
      input.documentId,
      operation.id,
      operation.storeId,
      operation.actorUserId,
    ].every((v) => v.trim()) ||
    operation.tenantId !== input.tenantId ||
    !Number.isFinite(operation.effectiveAt.getTime())
  )
    conflict("source scope or complete event set is invalid.")
  return input.events.flatMap((event) => {
    if (
      event.tenantId !== input.tenantId ||
      event.bookId !== input.bookId ||
      event.sourceKind !== input.kind ||
      event.sourceId !== input.documentId ||
      event.stockOperationId !== operation.id ||
      !event.stockMovementId.trim() ||
      event.actorUserId !== operation.actorUserId ||
      event.effectiveAt.getTime() !== operation.effectiveAt.getTime()
    )
      conflict("event differs from original owner provenance.")
    // Original writers post only positive known shortage carrying value.
    if (
      !event.canonicalEffect.toFixed().startsWith("-") ||
      event.sourceCostMinor === null ||
      event.sourceCostMinor === 0n
    )
      return []
    const amount = event.sourceCostMinor
    if (
      amount < 0n ||
      event.unknownReason !== null ||
      event.valueBeforeMinor === null ||
      event.valueAfterMinor === null ||
      event.valueBeforeMinor < 0n ||
      event.valueAfterMinor < 0n ||
      event.valueDeltaMinor !== -amount ||
      event.valueBeforeMinor - amount !== event.valueAfterMinor
    )
      conflict("known shortage carrying value is inconsistent.")
    financeAmount(amount.toString())
    return [
      {
        tenantId: input.tenantId,
        bookId: input.bookId,
        storeId: operation.storeId,
        documentId: input.documentId,
        kind: input.kind,
        movementId: event.stockMovementId,
        actorUserId: operation.actorUserId,
        effectiveAt: new Date(operation.effectiveAt),
        amountMinor: amount.toString(),
      },
    ]
  })
}

export function bindReviewedShortagePostings(input: {
  scope: { tenantId: string; bookId: string }
  candidates: ReviewedShortagePostingCandidate[]
  entries: Array<{
    id: string
    bookId: string
    sourceKind: string
    sourceId: string
    reversalOfId: string | null
  }>
  accounts: Array<{
    id: string
    bookId: string
    code: string
    kind: string
    purpose: string
  }>
}): PriorCostReviewExpectedPosting[] {
  if (
    input.candidates.length > 4096 ||
    input.entries.length > 4096 ||
    new Set(input.entries.map((e) => e.id)).size !== input.entries.length
  )
    conflict("original binding exceeds complete bounds or repeats entries.")
  const sourceKind = (kind: Kind) =>
    kind === "STOCK_COUNT"
      ? "INVENTORY_COUNT_SHORTAGE"
      : "INVENTORY_CLOSEOUT_SHORTAGE"
  const sources = new Map<string, ReviewedShortagePostingCandidate>()
  for (const c of input.candidates) {
    if (
      c.tenantId !== input.scope.tenantId ||
      c.bookId !== input.scope.bookId ||
      !c.movementId.trim()
    )
      conflict("candidate crosses Tenant/Book.")
    const key = `${sourceKind(c.kind)}:${c.movementId}`
    if (sources.has(key)) conflict("candidate repeats an original movement.")
    sources.set(key, c)
  }
  if (!input.entries.length) return []
  const account = (code: string, kind: string, purpose: string) => {
    const found = input.accounts.filter(
      (a) =>
        a.bookId === input.scope.bookId &&
        a.code === code &&
        a.kind === kind &&
        a.purpose === purpose,
    )
    if (found.length !== 1 || !found[0]?.id.trim())
      conflict("historical control account is unavailable or ambiguous.")
    return found[0].id
  }
  const expense = account("6000", "EXPENSE", "OPERATING_EXPENSE")
  const inventory = account("1300", "ASSET", "INVENTORY")
  if (expense === inventory)
    conflict("original controls share an invalid account identity.")
  const bound = new Set<string>()
  return input.entries
    .map((entry) => {
      const key = `${entry.sourceKind}:${entry.sourceId}`
      const c = sources.get(key)
      if (
        !c ||
        entry.bookId !== input.scope.bookId ||
        entry.reversalOfId !== null ||
        !entry.id.trim() ||
        bound.has(key)
      )
        conflict("entry does not uniquely bind its original source.")
      bound.add(key)
      const count = c.kind === "STOCK_COUNT"
      financeAmount(c.amountMinor)
      if (
        !Number.isFinite(c.effectiveAt.getTime()) ||
        !c.actorUserId.trim() ||
        !c.storeId.trim()
      )
        conflict("original actor/date/Store is missing.")
      return {
        entryId: entry.id,
        input: {
          tenantId: c.tenantId,
          bookId: c.bookId,
          actorUserId: c.actorUserId,
          storeId: c.storeId,
          effectiveAt: new Date(c.effectiveAt),
          sourceKind: entry.sourceKind,
          sourceId: c.movementId,
          clientCommandId: financePostingCommandId(
            `${count ? "inventory-count" : "inventory-closeout"}:${entry.sourceKind}:${c.movementId}`,
            "posting",
          ),
          description: `${count ? "Inventory count shortage" : "Custody closeout shortage"}: ${c.documentId}`,
          lines: [
            { accountId: expense, side: "DEBIT", amountMinor: c.amountMinor },
            {
              accountId: inventory,
              side: "CREDIT",
              amountMinor: c.amountMinor,
            },
          ],
        },
      } satisfies PriorCostReviewExpectedPosting
    })
    .sort((a, b) =>
      a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0,
    )
}
