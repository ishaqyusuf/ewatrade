// Home's confirmed sales total counts from the last displayed value to the
// newly confirmed one (Workshop mobile/home-sales-motion 01 "Count up").
// A new Store, role or day starts a fresh history and shows the value at once;
// an unchanged value never animates; Reduce Motion updates immediately.
export const SALES_VALUE_MOTION = { durationMs: 500 } as const

export type SalesValueTarget = { scopeKey: string; minor: number }

export type SalesValuePlan = { animate: boolean; from: number; to: number }

export function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3
}

export function salesValuePlan(
  previous: { scopeKey?: string; displayedMinor?: number },
  next: SalesValueTarget,
  reduceMotion: boolean,
): SalesValuePlan {
  const still = { animate: false, from: next.minor, to: next.minor }
  if (
    previous.scopeKey !== next.scopeKey ||
    previous.displayedMinor === undefined ||
    previous.displayedMinor === next.minor ||
    reduceMotion
  )
    return still
  return { animate: true, from: previous.displayedMinor, to: next.minor }
}

/**
 * The displayed amount at `progress` (0–1). It lands exactly on `to`; while
 * counting between whole-currency amounts it stays on whole units so no
 * stray decimals flash.
 */
export function salesValueAt(from: number, to: number, progress: number) {
  if (progress >= 1) return to
  if (progress <= 0) return from
  const unit = from % 100 === 0 && to % 100 === 0 ? 100 : 1
  const raw = from + (to - from) * easeOutCubic(progress)
  return Math.round(raw / unit) * unit
}

/**
 * Which confirmed total a value belongs to. Any change starts a new history:
 * actor, business, Store, role, own-vs-business sales, reporting day,
 * currency, and the session and data-cache generations (so a sign-out or
 * cache reset never revives a remembered value, even for the same actor).
 */
export function salesValueScope(facts: {
  actorId: string | null | undefined
  businessId: string | null | undefined
  storeId: string | null | undefined
  role: string | null | undefined
  mine: boolean
  dayStartIso: string
  currencyCode: string
  sessionGeneration: number
  dataGeneration: number
}) {
  return JSON.stringify([
    facts.actorId ?? null,
    facts.businessId ?? null,
    facts.storeId ?? null,
    facts.role ?? null,
    facts.mine,
    facts.dayStartIso,
    facts.currencyCode,
    facts.sessionGeneration,
    facts.dataGeneration,
  ])
}
