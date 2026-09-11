export type StoreConversationActionReturnState = "armed" | "away" | "idle"

export type StoreConversationActionReturnEvent =
  | "active"
  | "handoff_opened"
  | "inactive"

export function advanceStoreConversationActionReturn(
  state: StoreConversationActionReturnState,
  event: StoreConversationActionReturnEvent,
): { refresh: boolean; state: StoreConversationActionReturnState } {
  if (event === "handoff_opened") {
    return { refresh: false, state: "armed" }
  }
  if (event === "inactive") {
    return {
      refresh: false,
      state: state === "idle" ? "idle" : "away",
    }
  }
  if (state === "idle") return { refresh: false, state }
  return { refresh: true, state: "idle" }
}
