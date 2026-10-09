import { describe, expect, test } from "bun:test"
import { CONTENT_MOTION, itemRevealDelay } from "./content-motion"

describe("content motion", () => {
  test("rows stagger in order from the first row", () => {
    expect(itemRevealDelay(0)).toBe(0)
    expect(itemRevealDelay(1)).toBe(CONTENT_MOTION.itemStaggerMs)
    expect(itemRevealDelay(3)).toBe(3 * CONTENT_MOTION.itemStaggerMs)
  })

  test("long lists share the capped delay so later rows never lag", () => {
    const capped = CONTENT_MOTION.itemStaggerCap * CONTENT_MOTION.itemStaggerMs
    expect(itemRevealDelay(CONTENT_MOTION.itemStaggerCap)).toBe(capped)
    expect(itemRevealDelay(40)).toBe(capped)
    expect(capped + CONTENT_MOTION.itemEnterMs).toBeLessThan(
      CONTENT_MOTION.revealWindowMs,
    )
  })

  test("negative indexes are treated as the first row", () => {
    expect(itemRevealDelay(-2)).toBe(0)
  })
})
