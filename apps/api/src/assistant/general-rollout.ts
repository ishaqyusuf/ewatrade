import type { Capability } from "@ewatrade/assistant/capabilities/types"
import { commercePreparationEnabled } from "./preparation-observability"

/** Every shipped capability is on; planned ones are not built yet. */
export function generalCapabilityEnabled(capability: Capability) {
  if (
    !commercePreparationEnabled() &&
    [
      "catalog.categories.suggest",
      "sales.order.prepare",
      "services.job.prepare",
    ].includes(capability.id)
  )
    return false
  return capability.rollout !== "planned"
}
