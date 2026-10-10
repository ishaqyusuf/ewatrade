import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { Capability } from "@ewatrade/assistant/capabilities/types"

/** Optional pilot restriction. Explicit empty or invalid lists fail closed. */
export function generalCapabilityEnabled(
  capability: Capability,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (capability.rollout === "planned") return false
  const configured = environment.ASSISTANT_GENERAL_CAPABILITIES
  if (configured === undefined) return true
  const selected = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  const known = new Set<string>(capabilityManifest.map((value) => value.id))
  return (
    selected.every((id) => known.has(id)) && selected.includes(capability.id)
  )
}
