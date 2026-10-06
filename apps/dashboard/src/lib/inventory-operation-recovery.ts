type InventoryFailureData =
  | {
      code?: string
      appError?: { code?: string } | null
    }
  | null
  | undefined

export function inventoryOperationRecovery(data: InventoryFailureData) {
  // These stock conflicts are rejected inside the transaction, so nothing committed.
  // Generic conflicts (including identity mismatches) and unknown outcomes stay frozen.
  if (data?.appError?.code === "STOCK_CONFLICT") return "refresh" as const
  if (["BAD_REQUEST", "FORBIDDEN", "NOT_FOUND"].includes(data?.code ?? "")) {
    return "edit" as const
  }
  return "retry" as const
}
