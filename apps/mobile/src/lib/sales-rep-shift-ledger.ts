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
          : "Your counter is ready for the next customer."

  return {
    catalogFactDetail: hasSellableCatalogItem
      ? "Pick items from your catalog"
      : "Add items for faster sales",
    catalogFactValue: hasSellableCatalogItem ? "Ready" : "Needs item",
    heroCue,
    readinessLabel: "Ready to sell",
    saleActionDetail: hasSellableCatalogItem
      ? "Choose an item, customer, and payment."
      : "Pick catalog items or type a price.",
    saleActionDisabled: false,
    saleActionLabel: "Start a new sale",
    syncLabel:
      pendingCommandCount > 0
        ? `${pendingCommandCount} waiting to sync`
        : isOffline
          ? "Offline"
          : "Synced now",
    syncTone: hasPendingSync ? ("attention" as const) : ("ready" as const),
  }
}
