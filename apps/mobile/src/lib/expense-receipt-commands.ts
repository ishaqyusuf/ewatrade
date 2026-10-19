import type { ExpenseReceiptRecoveryScope } from "@ewatrade/utils/expense-receipt-state"

type Storage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}
const id = /^[A-Za-z0-9_-]{8,128}$/

/** Only opaque command IDs and hashed file identities are persisted, never originals. */
export function createExpenseReceiptCommands(
  scope: ExpenseReceiptRecoveryScope,
  storage: Storage,
  uuid: () => string,
  assertCurrent: () => void,
) {
  const prefix = [
    "expense-receipt-mobile-v1",
    scope.actorUserId,
    scope.tenantId,
    scope.bookId,
    scope.billId,
  ]
    .map(encodeURIComponent)
    .join(":")
  const key = (operation: string, identity: string) =>
    `${prefix}:${operation}:${encodeURIComponent(identity)}`
  return {
    async command(
      operation: "intent" | "attach" | "withdraw",
      identity: string,
    ) {
      assertCurrent()
      const target = key(operation, identity)
      const saved = await storage.getItem(target)
      assertCurrent()
      if (saved !== null) {
        if (!id.test(saved))
          throw new Error("Saved receipt retry identity is unreadable.")
        return saved
      }
      const created = uuid()
      if (!id.test(created))
        throw new Error("Receipt retry identity is invalid.")
      await storage.setItem(target, created)
      assertCurrent()
      if ((await storage.getItem(target)) !== created)
        throw new Error(
          "Receipt retry identity could not be saved. Nothing was sent.",
        )
      assertCurrent()
      return created
    },
    async bind(assetId: string, identity: string) {
      assertCurrent()
      await storage.setItem(key("asset", assetId), identity)
      assertCurrent()
      if ((await storage.getItem(key("asset", assetId))) !== identity)
        throw new Error(
          "Receipt recovery link could not be saved. Retry the same file.",
        )
      assertCurrent()
    },
    async complete(operation: "attach" | "withdraw", assetId: string) {
      assertCurrent()
      const identity = await storage.getItem(key("asset", assetId))
      assertCurrent()
      // Clear the intent only after an authorized read confirms the final state.
      if (identity) await storage.removeItem(key("intent", identity))
      assertCurrent()
      await storage.removeItem(key("asset", assetId))
      assertCurrent()
      await storage.removeItem(key(operation, assetId))
      assertCurrent()
    },
  }
}
