import type { Capability } from "@ewatrade/assistant/capabilities/types"
import { whatsAppAheadOfApp } from "@ewatrade/assistant/channels/policy"
import { commercePreparationEnabled } from "./preparation-observability"

/** Every shipped capability is on; planned ones are not built yet, except in a channel released ahead of the app. */
export function generalCapabilityEnabled(
  capability: Capability,
  channel?: "whatsapp",
) {
  if (
    !commercePreparationEnabled() &&
    [
      "catalog.categories.suggest",
      "catalog.categories.attributes",
      "sales.order.prepare",
      "services.job.prepare",
    ].includes(capability.id)
  )
    return false
  return (
    capability.rollout !== "planned" ||
    (channel === "whatsapp" && whatsAppAheadOfApp(capability))
  )
}
