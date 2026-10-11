import type { Capability } from "@ewatrade/assistant/capabilities/types"

/** Every shipped capability is on; planned ones are not built yet. */
export function generalCapabilityEnabled(capability: Capability) {
  return capability.rollout !== "planned"
}
