import type { StoreConversationModerationProjection } from "@ewatrade/service-commerce"

type Moderation = Pick<
  StoreConversationModerationProjection,
  "customerMessage" | "recovery" | "state"
>

const recoveryLabels = {
  return_to_store_entry: "Return to the Store link",
  wait_for_reinstatement: "Waiting for Store review",
} as const

export function projectCustomerConversationRestriction(moderation: Moderation) {
  if (moderation.state !== "restricted") return null

  const recoveryLabel = moderation.recovery
    ? recoveryLabels[moderation.recovery]
    : "Wait for the Store to reopen messaging"
  const title = "Messages paused"
  const detail = "History and requests stay available."

  return {
    accessibilityLabel: `${title}. ${detail} ${recoveryLabel}.`,
    detail,
    recoveryAction:
      moderation.recovery === "return_to_store_entry"
        ? "return_to_store_entry"
        : null,
    recoveryLabel,
    title,
  }
}
