import { expect, test } from "bun:test"
import {
  type G02BudgetCall,
  observeG02BudgetCalls,
} from "./general-cash-count-budget-trace"

test("budget observer preserves receiver, original arguments, effects and return value without recording data", () => {
  const calls: G02BudgetCall[] = []
  const original = { scopeKey: "private", data: { requests: 2 } }
  const delegate = {
    rows: 0,
    update(input: typeof original) {
      expect(input).toBe(original)
      this.rows += input.data.requests
      return original
    },
  }
  const db = {
    assistantBudget: delegate,
    marker() {
      return this.assistantBudget.rows
    },
  }
  const observed = observeG02BudgetCalls(db, "root", (call) => calls.push(call))
  expect(observed.assistantBudget.update(original)).toBe(original)
  expect(delegate.rows).toBe(2)
  expect(observed.marker()).toBe(2)
  expect(calls).toEqual([{ boundary: "root", method: "update" }])
  expect(JSON.stringify(calls)).not.toContain("private")
})

test("budget observer propagates the exact rejection and never substitutes a successful quota result", async () => {
  const fault = Error("quota failure")
  const calls: G02BudgetCall[] = []
  const db = {
    assistantBudget: {
      async upsert() {
        throw fault
      },
    },
  }
  const observed = observeG02BudgetCalls(db, "transaction", (call) =>
    calls.push(call),
  )
  let actual: unknown
  try {
    await observed.assistantBudget.upsert()
  } catch (error) {
    actual = error
  }
  expect(actual).toBe(fault)
  expect(calls).toEqual([{ boundary: "transaction", method: "upsert" }])
})
