export type G02BudgetCall = { boundary: "root" | "transaction"; method: string }

/** Verification-only observer: preserve every budget operation, argument and failure. */
export function observeG02BudgetCalls<T extends { assistantBudget: object }>(
  db: T,
  boundary: G02BudgetCall["boundary"],
  record: (call: G02BudgetCall) => void,
): T {
  const delegate = new Proxy(db.assistantBudget, {
    get(owner, key) {
      const value = Reflect.get(owner, key)
      if (typeof value !== "function") return value
      return (...args: unknown[]) => {
        record({ boundary, method: String(key) })
        return Reflect.apply(value, owner, args)
      }
    },
  })
  return new Proxy(db, {
    get(owner, key) {
      if (key === "assistantBudget") return delegate
      const value = Reflect.get(owner, key)
      return typeof value === "function" ? value.bind(owner) : value
    },
  })
}
