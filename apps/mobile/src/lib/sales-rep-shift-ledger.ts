export function getSalesRepShiftLedgerPresentation({
  hasSellableCatalogItem,
  isOffline,
  pendingCommandCount,
  workspaceState,
}: {
  hasSellableCatalogItem: boolean
  isOffline: boolean
  pendingCommandCount: number
  workspaceState: "available" | "loading" | "offline-unknown" | "unavailable"
}) {
  const hasPendingSync = isOffline || pendingCommandCount > 0
  const heroCue =
    workspaceState === "offline-unknown"
      ? "Reconnect to confirm your sellable catalog."
      : workspaceState === "loading"
        ? "Loading the latest sales workspace."
        : workspaceState === "unavailable"
          ? "Refresh to confirm the counter is ready."
          : hasSellableCatalogItem
            ? "Your counter is ready for the next customer."
            : "A sellable item is needed before the next customer."

  return {
    catalogFactDetail: hasSellableCatalogItem
      ? "Orders can be created"
      : "A sellable item is required",
    catalogFactValue: hasSellableCatalogItem ? "Ready" : "Needs item",
    heroCue,
    readinessLabel: hasSellableCatalogItem
      ? "Ready to sell"
      : "Selling needs setup",
    saleActionDetail: hasSellableCatalogItem
      ? "Choose an item, customer, and payment."
      : "Ask a manager to add an active sellable item.",
    saleActionDisabled: !hasSellableCatalogItem,
    saleActionLabel: hasSellableCatalogItem
      ? "Start a new sale"
      : "Sale unavailable",
    syncLabel:
      pendingCommandCount > 0
        ? `${pendingCommandCount} waiting to sync`
        : isOffline
          ? "Offline"
          : "Synced now",
    syncTone: hasPendingSync ? ("attention" as const) : ("ready" as const),
  }
}
