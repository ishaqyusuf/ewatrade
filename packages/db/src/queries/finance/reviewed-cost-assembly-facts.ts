import type { auditReviewedCostPhysicalHistory } from "./reviewed-cost-history-rules"
import type { readReviewedCostReturnsInTransaction } from "./reviewed-cost-returns"
import type { ReviewedCostTraceNode } from "./reviewed-cost-trace"
import { FinanceError } from "./rules"
import { normalizeQuantity } from "./valuation-math"

type Physical = ReturnType<typeof auditReviewedCostPhysicalHistory>
type ReturnSources = Awaited<
  ReturnType<typeof readReviewedCostReturnsInTransaction>
>
type Movement = Physical["balances"][number]["movements"][number]
type IssuePurpose = Extract<
  ReviewedCostTraceNode,
  { kind: "WITHDRAWAL" }
>["purpose"]
type WithoutOrdinal<T> = T extends unknown ? Omit<T, "ordinal"> : never
type TraceNode = WithoutOrdinal<ReviewedCostTraceNode>

/** Private selectors must supply proved owning semantics, never sign/enum guesses. */
export type ReviewedMovementSemantics =
  | { movementId: string; kind: "ORIGIN" }
  | { movementId: string; kind: "WITHDRAWAL"; purpose: IssuePurpose }
  | { movementId: string; kind: "TRANSFER_OUT" }
  | { movementId: string; kind: "TRANSFER_IN"; originalMovementId: string }
  | { movementId: string; kind: "RESTORATION"; originalMovementId: string }
  | { movementId: string; kind: "RETURN_RESTOCK"; productReturnId: string }

export type ReviewedAssemblyPhysical = Pick<
  Physical,
  | "tenantId"
  | "bookId"
  | "currencyCode"
  | "bookSequence"
  | "through"
  | "physicalSnapshotHash"
> & {
  balances: Array<
    Pick<
      Physical["balances"][number],
      | "balanceSourceId"
      | "canonicalOnHandQuantity"
      | "impliedBaselineQuantity"
      | "orderedMovementIds"
      | "physicalQuantityReconciled"
      | "issues"
    > & {
      snapshot: Pick<
        Physical["balances"][number]["snapshot"],
        "productId" | "variantId"
      >
      movements: Array<
        Pick<
          Movement,
          | "id"
          | "balanceSourceId"
          | "canonicalBefore"
          | "canonicalAfter"
          | "signedCanonicalEffect"
        > & {
          operation: Pick<Movement["operation"], "id" | "effectiveAt">
          valuation: Pick<
            NonNullable<Movement["valuation"]>,
            "id" | "sourceCostMinor"
          > | null
        }
      >
    }
  >
}
export type ReviewedAssemblyReturns = Pick<
  ReturnSources,
  "issues" | "returns" | "allocations" | "sourceSnapshotHash"
> & {
  snapshot: Pick<
    ReturnSources["snapshot"],
    | "tenantId"
    | "bookId"
    | "currencyCode"
    | "bookSequence"
    | "fulfillments"
    | "returns"
  >
}

export function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
export function unique(values: string[]) {
  if (values.some((id) => !id.trim()) || new Set(values).size !== values.length)
    conflict("Canonical source assembly has duplicate or missing identities.")
}
export function q(value: string) {
  try {
    return normalizeQuantity(value)
  } catch {
    conflict("Canonical source quantity exceeds exact supported bounds.")
  }
}
export type Pending = {
  id: string
  balanceSourceId: string
  effectiveAt: Date
  parents: Set<string>
  node: TraceNode | null
  allocation: ReviewedAssemblyReturns["allocations"][number] | null
  nonphysical: boolean
}

export type ReviewedAssemblyInput = {
  physical: ReviewedAssemblyPhysical
  returns: ReviewedAssemblyReturns
  semantics: ReviewedMovementSemantics[]
}
