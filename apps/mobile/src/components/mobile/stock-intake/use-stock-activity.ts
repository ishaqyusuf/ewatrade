import type { trackMobileActivity } from "@/runtime/analytics-runtime"
import { useEffect, useRef } from "react"
import type { StockIntakeModel } from "./use-stock-intake"

type StockActivityModel = Pick<
  StockIntakeModel,
  | "review"
  | "hasAttempt"
  | "outcome"
  | "reviewStale"
  | "scopeChanged"
  | "canManage"
>

/**
 * Observational stock events at the review/outcome boundaries. Fixed enums
 * only. A review object reports once; each status reports once per review, so
 * retries, re-renders and attempt resets never repeat an event. Nothing is
 * reported for a scope (actor/business/Store) or stock access the screen no
 * longer serves.
 * The tracker is injected so effect boundaries stay testable without the
 * native analytics runtime.
 */
export function useStockActivity(
  {
    review,
    hasAttempt,
    outcome,
    reviewStale,
    scopeChanged,
    canManage,
  }: StockActivityModel,
  track: typeof trackMobileActivity,
) {
  const reviewed = useRef(new WeakSet<object>())
  // Changed actor/business/Store or lost stock access: report nothing.
  const outOfScope = scopeChanged || !canManage
  const results = useRef(new WeakMap<object, Set<string>>())
  useEffect(() => {
    if (!review || hasAttempt || reviewStale || outOfScope) return
    if (reviewed.current.has(review)) return
    reviewed.current.add(review)
    track({
      name: "mobile_stock_reviewed",
      properties: {
        action: review.draft.mode,
        category:
          review.balance.kind === "PACKAGED_STOCK" ? "packaged" : "shared",
      },
    })
  }, [review, hasAttempt, reviewStale, outOfScope, track])
  useEffect(() => {
    if (outOfScope) return
    const result =
      outcome ??
      (reviewStale && review
        ? { kind: "refresh_required" as const, review }
        : null)
    if (!result) return
    const seen = results.current.get(result.review) ?? new Set<string>()
    if (seen.has(result.kind)) return
    seen.add(result.kind)
    results.current.set(result.review, seen)
    track({
      name: "mobile_stock_result",
      properties: { action: result.review.draft.mode, status: result.kind },
    })
  }, [outcome, reviewStale, review, outOfScope, track])
}
