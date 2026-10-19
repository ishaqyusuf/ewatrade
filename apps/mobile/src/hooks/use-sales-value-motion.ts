import {
  SALES_VALUE_MOTION,
  type SalesValueTarget,
  salesValueAt,
  salesValuePlan,
} from "@/lib/sales-value-motion"
import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "react-native-reanimated"

// The last value actually shown per scope, in memory only. Home is rebuilt
// after a sale's success screen; a fresh instance counts up from here instead
// of jumping. Cleared with the app process; never persisted.
const lastShown = new Map<string, number>()
const MEMORY_LIMIT = 8
function remember(scopeKey: string, value: number) {
  lastShown.delete(scopeKey)
  lastShown.set(scopeKey, value)
  // Bounded: only the most recent scopes are kept.
  while (lastShown.size > MEMORY_LIMIT) {
    const oldest = lastShown.keys().next().value
    if (oldest === undefined) break
    lastShown.delete(oldest)
  }
}

/** Test seam: forget remembered values (a fresh app process). */
export function resetSalesValueMemory() {
  lastShown.clear()
}

/**
 * The confirmed sales amount to display right now. Counts from what is on
 * screen to each newly confirmed value; a fresh scope, an unchanged value or
 * Reduce Motion shows the value immediately. While `active` is false (a Home
 * hidden under another screen) nothing advances or is remembered, so the
 * count runs when the person can see it.
 */
export function useSalesValueMotion(
  target: SalesValueTarget | undefined,
  active = true,
) {
  const reduceMotion = useReducedMotion()
  const remembered =
    target === undefined ? undefined : lastShown.get(target.scopeKey)
  const [shown, setShown] = useState(remembered ?? target?.minor)
  const displayed = useRef(remembered ?? target?.minor)
  const scope = useRef(target?.scopeKey)
  const frame = useRef<number | null>(null)
  const minor = target?.minor
  const scopeKey = target?.scopeKey
  useEffect(() => {
    if (minor === undefined || scopeKey === undefined || !active) return
    // A fresh Home (no value of its own yet) continues from what was last
    // shown for exactly this scope. A scope change inside one Home doesn't:
    // that always starts a new history.
    if (scope.current === undefined && displayed.current === undefined) {
      const previous = lastShown.get(scopeKey)
      if (previous !== undefined) {
        displayed.current = previous
        scope.current = scopeKey
      }
    }
    const plan = salesValuePlan(
      { scopeKey: scope.current, displayedMinor: displayed.current },
      { scopeKey, minor },
      reduceMotion,
    )
    scope.current = scopeKey
    const show = (value: number) => {
      displayed.current = value
      remember(scopeKey, value)
      setShown(value)
    }
    if (!plan.animate) {
      show(plan.to)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const progress = (now - start) / SALES_VALUE_MOTION.durationMs
      show(salesValueAt(plan.from, plan.to, progress))
      frame.current = progress < 1 ? requestAnimationFrame(tick) : null
    }
    frame.current = requestAnimationFrame(tick)
    // A newer value (or unmount) stops this count where it is; the next one
    // continues from the displayed number.
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [minor, scopeKey, reduceMotion, active])
  if (target === undefined) return undefined
  // A fresh Home shows the remembered value until it can count from it.
  if (scope.current === undefined)
    return lastShown.get(target.scopeKey) ?? target.minor
  // A new scope shows its own value at once, even before the effect runs.
  return scope.current === target.scopeKey && shown !== undefined
    ? shown
    : target.minor
}
