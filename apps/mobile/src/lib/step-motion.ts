// In-screen workflow steps (New sale, new business, domains, sign-up) swap
// inside one route, so native stack presets don't animate them. Shared axis
// (Workshop mobile/order-step-motion 01 v2): the entering step drifts in from
// the direction of travel; the leaving step only fades, because its exit is
// fixed at its last render, before the next direction is known.
export type StepDirection = "forward" | "back" | "none"

export const STEP_MOTION = {
  exitMs: 140,
  enterMs: 240,
  enterDelayMs: 40,
  /** Entering drift, from the right going forward and the left going back. */
  enterOffset: 24,
  /** Reduce Motion: a plain fade with no movement. */
  reducedEnterMs: 150,
  reducedExitMs: 100,
} as const

/** Direction from each step's place in `order`; unknown steps don't move. */
export function stepDirection<T>(
  order: readonly T[],
  previous: T,
  next: T,
): StepDirection {
  const from = order.indexOf(previous)
  const to = order.indexOf(next)
  if (from < 0 || to < 0 || from === to) return "none"
  return to > from ? "forward" : "back"
}

/** Horizontal start of the entering step; zero when nothing should move. */
export function stepEnterOffset(
  direction: StepDirection,
  reduceMotion: boolean,
) {
  if (reduceMotion || direction === "none") return 0
  return direction === "forward"
    ? STEP_MOTION.enterOffset
    : -STEP_MOTION.enterOffset
}
