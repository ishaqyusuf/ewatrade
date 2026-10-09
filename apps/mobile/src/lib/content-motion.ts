// Timing for content that appears inside a screen once its data is ready.
// Values follow T3 Code's mobile app: short fades (140-220ms) and a small
// upward drift, never a bounce. There is no exit motion: content leaves with
// its native screen transition.
export const CONTENT_MOTION = {
  enterMs: 200,
  itemEnterMs: 220,
  itemOffsetY: 12,
  itemStaggerMs: 35,
  /** Rows past this index share the last delay so long lists never lag. */
  itemStaggerCap: 6,
  /**
   * How long after data first arrives newly mounted rows still animate. Rows
   * mounted later by scrolling or pagination appear without motion.
   */
  revealWindowMs: 700,
} as const

export function itemRevealDelay(index: number) {
  const step = Math.min(Math.max(0, index), CONTENT_MOTION.itemStaggerCap)
  return step * CONTENT_MOTION.itemStaggerMs
}
