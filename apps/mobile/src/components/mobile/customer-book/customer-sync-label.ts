/** A queued order must remain visible even when this customer has synced orders. */
export function customerSyncLabel(savedOrders: number, queuedOrders: number) {
  if (queuedOrders > 0) return `${queuedOrders} waiting to sync`
  return savedOrders > 0 ? "Synced" : "Saved"
}
