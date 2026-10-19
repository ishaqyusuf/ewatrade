import { expect, test } from "bun:test"
import {
  SALE_STEP_MOTION,
  itemsScrollRestore,
  previousSaleStep,
  saleRemovalDecision,
  saleStepDirection,
  saleStepEnterOffset,
} from "./sale-step-motion"

test("direction follows the step order both ways, including skips", () => {
  expect(saleStepDirection("items", "customer")).toBe("forward")
  expect(saleStepDirection("customer", "review")).toBe("forward")
  expect(saleStepDirection("items", "review")).toBe("forward")
  expect(saleStepDirection("review", "customer")).toBe("back")
  expect(saleStepDirection("customer", "items")).toBe("back")
  expect(saleStepDirection("review", "items")).toBe("back")
  expect(saleStepDirection("customer", "customer")).toBe("none")
})

test("the entering step drifts from the side it is coming from", () => {
  expect(saleStepEnterOffset("forward", false)).toBe(24)
  expect(saleStepEnterOffset("back", false)).toBe(-24)
  expect(saleStepEnterOffset("none", false)).toBe(0)
})

test("Reduce Motion never moves a step and keeps fades short", () => {
  expect(saleStepEnterOffset("forward", true)).toBe(0)
  expect(saleStepEnterOffset("back", true)).toBe(0)
  expect(SALE_STEP_MOTION.reducedEnterMs).toBeLessThanOrEqual(150)
  expect(SALE_STEP_MOTION.reducedExitMs).toBeLessThan(
    SALE_STEP_MOTION.reducedEnterMs,
  )
})

test("system back and swipe step back through an open sale; nothing else is redirected", () => {
  const at = (
    step: "items" | "customer" | "review",
    actionType: string,
    extra = {},
  ) =>
    saleRemovalDecision({
      step,
      completed: false,
      submitting: false,
      actionType,
      ...extra,
    })
  expect(at("review", "GO_BACK")).toBe("previous-step")
  expect(at("customer", "POP")).toBe("previous-step")
  expect(previousSaleStep("review")).toBe("customer")
  expect(previousSaleStep("customer")).toBe("items")
  // At Items, back leaves the sale as before.
  expect(at("items", "GO_BACK")).toBe("proceed")
  // Closing (replace), the completed sale's reset and navigation proceed.
  expect(at("review", "REPLACE")).toBe("proceed")
  expect(at("review", "RESET")).toBe("proceed")
  expect(at("review", "NAVIGATE")).toBe("proceed")
  // A completed or submitting sale is never held back.
  expect(at("review", "GO_BACK", { completed: true })).toBe("proceed")
  expect(at("review", "GO_BACK", { submitting: true })).toBe("proceed")
})

test("the Items list returns to its saved place once the content is tall enough", () => {
  expect(itemsScrollRestore(0, 2_000, 600)).toBe(0)
  expect(itemsScrollRestore(900, 2_000, 600)).toBe(900)
  // Not loaded far enough yet: wait for more content.
  expect(itemsScrollRestore(900, 1_200, 600)).toBeNull()
  expect(itemsScrollRestore(Number.NaN, 2_000, 600)).toBe(0)
})
